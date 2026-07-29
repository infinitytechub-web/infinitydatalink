import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RepaymentLoanSummary = {
  id: string;
  ref: string;
  product: string;
  status: "pending" | "approved" | "rejected" | "active" | "closed";
  amount: number;
  outstanding_principal: number;
  monthly_payment: number | null;
  interest_rate: number;
  term_months: number;
  maturity_at: string | null;
  installments_total: number;
  installments_paid: number;
  total_repaid: number;
  arrears: number;
  next_due_date: string | null;
  next_due_amount: number | null;
};

export type UpcomingInstallment = {
  id: string;
  loan_id: string;
  loan_ref: string;
  installment_no: number;
  due_date: string;
  total_due: number;
  paid_amount: number;
  remaining: number;
  status: string;
  overdue: boolean;
};

export type RepaymentHistoryRow = {
  id: string;
  ref: string;
  loan_id: string | null;
  loan_ref: string | null;
  amount: number;
  status: string;
  channel: string | null;
  note: string | null;
  created_at: string;
};

export type RepaymentDashboard = {
  totals: {
    outstanding: number;
    arrears: number;
    repaidTotal: number;
    repaidThisMonth: number;
    activeLoans: number;
    nextDueDate: string | null;
    nextDueAmount: number | null;
  };
  loans: RepaymentLoanSummary[];
  upcoming: UpcomingInstallment[];
  history: RepaymentHistoryRow[];
};

export const getMyRepaymentDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RepaymentDashboard> => {
    const { data: loanRows, error: lerr } = await context.supabase
      .from("loans")
      .select(
        "id, ref, product, status, amount, interest_rate, term_months, outstanding_principal, monthly_payment, maturity_at",
      )
      .eq("user_id", context.userId)
      .in("status", ["approved", "active", "closed"])
      .order("created_at", { ascending: false });
    if (lerr) throw new Error(lerr.message);

    const loans = loanRows ?? [];
    const loanIds = loans.map((l) => l.id);
    const refById = new Map(loans.map((l) => [l.id, l.ref]));

    const [schedRes, txnRes] = await Promise.all([
      loanIds.length
        ? context.supabase
            .from("loan_repayments")
            .select("id, loan_id, installment_no, due_date, total_due, paid_amount, status")
            .in("loan_id", loanIds)
            .order("due_date", { ascending: true })
        : Promise.resolve({ data: [], error: null } as any),
      context.supabase
        .from("transactions")
        .select("id, ref, loan_id, amount, status, channel, note, created_at")
        .eq("user_id", context.userId)
        .eq("kind", "loan_repayment")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (schedRes.error) throw new Error(schedRes.error.message);
    if (txnRes.error) throw new Error(txnRes.error.message);

    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const monthStart = `${todayKey.slice(0, 7)}-01`;

    const schedule: UpcomingInstallment[] = (schedRes.data ?? []).map((r: any): UpcomingInstallment => {
      const total = Number(r.total_due ?? 0);
      const paid = Number(r.paid_amount ?? 0);
      const remaining = Math.max(0, total - paid);
      return {
        id: r.id as string,
        loan_id: r.loan_id as string,
        loan_ref: refById.get(r.loan_id) ?? "—",
        installment_no: Number(r.installment_no ?? 0),
        due_date: r.due_date as string,
        total_due: total,
        paid_amount: paid,
        remaining,
        status: String(r.status ?? "due"),
        overdue: remaining > 0.005 && String(r.due_date) < todayKey,
      };
    });

    const history: RepaymentHistoryRow[] = (txnRes.data ?? []).map((t: any) => ({
      id: t.id,
      ref: t.ref,
      loan_id: t.loan_id ?? null,
      loan_ref: t.loan_id ? (refById.get(t.loan_id) ?? null) : null,
      amount: Number(t.amount ?? 0),
      status: String(t.status),
      channel: t.channel ?? null,
      note: t.note ?? null,
      created_at: t.created_at,
    }));

    const loanSummaries: RepaymentLoanSummary[] = loans.map((l: any) => {
      const rows = schedule.filter((s) => s.loan_id === l.id);
      const open = rows.filter((s) => s.remaining > 0.005);
      const next = open[0] ?? null;
      return {
        id: l.id,
        ref: l.ref,
        product: l.product,
        status: l.status,
        amount: Number(l.amount ?? 0),
        outstanding_principal: Number(l.outstanding_principal ?? 0),
        monthly_payment: l.monthly_payment == null ? null : Number(l.monthly_payment),
        interest_rate: Number(l.interest_rate ?? 0),
        term_months: Number(l.term_months ?? 0),
        maturity_at: l.maturity_at ?? null,
        installments_total: rows.length,
        installments_paid: rows.length - open.length,
        total_repaid: rows.reduce((s, r) => s + r.paid_amount, 0),
        arrears: rows.filter((r) => r.overdue).reduce((s, r) => s + r.remaining, 0),
        next_due_date: next?.due_date ?? null,
        next_due_amount: next?.remaining ?? null,
      };
    });

    const upcoming = schedule
      .filter((s) => s.remaining > 0.005)
      .sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0))
      .slice(0, 12);

    const cleared = history.filter((h) => h.status === "cleared");

    return {
      totals: {
        outstanding: loanSummaries
          .filter((l) => l.status !== "closed")
          .reduce((s, l) => s + l.outstanding_principal, 0),
        arrears: loanSummaries.reduce((s, l) => s + l.arrears, 0),
        repaidTotal: cleared.reduce((s, h) => s + h.amount, 0),
        repaidThisMonth: cleared
          .filter((h) => h.created_at.slice(0, 10) >= monthStart)
          .reduce((s, h) => s + h.amount, 0),
        activeLoans: loanSummaries.filter((l) => l.status === "active" || l.status === "approved").length,
        nextDueDate: upcoming[0]?.due_date ?? null,
        nextDueAmount: upcoming[0]?.remaining ?? null,
      },
      loans: loanSummaries,
      upcoming,
      history,
    };
  });
