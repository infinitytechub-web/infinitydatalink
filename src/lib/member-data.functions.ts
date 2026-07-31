import { writeAudit } from "@/lib/audit-log";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PageInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(100).default(10),
  sortBy: z.string().default("created_at"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
export type PageInput = z.infer<typeof PageInput>;
export type Paginated<T> = { rows: T[]; total: number; page: number; pageSize: number };

export type SavingsRow = {
  id: string;
  name: string;
  schedule: string;
  interest_rate: number;
  balance: number;
};

export type LoanRow = {
  id: string;
  ref: string;
  product: string;
  amount: number;
  term_months: number;
  interest_rate: number;
  status: "pending" | "approved" | "rejected" | "active" | "closed";
  purpose: string | null;
  created_at: string;
  decided_at: string | null;
  outstanding_principal: number;
  monthly_payment: number | null;
};

export type TxnRow = {
  id: string;
  ref: string;
  kind: string;
  amount: number;
  channel: string | null;
  note: string | null;
  status: "pending" | "cleared" | "failed";
  created_at: string;
};

export type MemberSummary = {
  totalSavings: number;
  activeLoanBalance: number;
  nextContribution: number | null;
};

const SAVINGS_SORT: Record<string, string> = { balance: "balance", created_at: "created_at" };
const LOAN_SORT: Record<string, string> = {
  created_at: "created_at",
  amount: "amount",
  status: "status",
  term_months: "term_months",
  ref: "ref",
};
const TXN_SORT: Record<string, string> = {
  created_at: "created_at",
  amount: "amount",
  status: "status",
  ref: "ref",
};

export const getMySavings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => PageInput.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<Paginated<SavingsRow>> => {
    const sortCol = SAVINGS_SORT[data.sortBy] ?? "created_at";
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: rows, error, count } = await context.supabase
      .from("savings_accounts")
      .select("id, balance, created_at, savings_plans(id, name, schedule, interest_rate)", { count: "exact" })
      .eq("user_id", context.userId)
      .order(sortCol, { ascending: data.sortDir === "asc" })
      .range(from, to);
    if (error) throw new Error(error.message);
    return {
      rows: (rows ?? []).map((row: any) => ({
        id: row.id,
        balance: Number(row.balance ?? 0),
        name: row.savings_plans?.name ?? "Savings Plan",
        schedule: row.savings_plans?.schedule ?? "—",
        interest_rate: Number(row.savings_plans?.interest_rate ?? 0),
      })),
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

export const getMyLoans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => PageInput.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<Paginated<LoanRow>> => {
    const sortCol = LOAN_SORT[data.sortBy] ?? "created_at";
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: rows, error, count } = await context.supabase
      .from("loans")
      .select("id, ref, product, amount, term_months, interest_rate, status, purpose, created_at, decided_at, outstanding_principal, monthly_payment", { count: "exact" })
      .eq("user_id", context.userId)
      .order(sortCol, { ascending: data.sortDir === "asc" })
      .range(from, to);
    if (error) throw new Error(error.message);
    return {
      rows: (rows ?? []).map((r) => ({
        ...r,
        amount: Number(r.amount),
        interest_rate: Number(r.interest_rate),
        outstanding_principal: Number(r.outstanding_principal ?? 0),
        monthly_payment: r.monthly_payment == null ? null : Number(r.monthly_payment),
      })) as LoanRow[],
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

export const getMyTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => PageInput.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<Paginated<TxnRow>> => {
    const sortCol = TXN_SORT[data.sortBy] ?? "created_at";
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: rows, error, count } = await context.supabase
      .from("transactions")
      .select("id, ref, kind, amount, channel, note, status, created_at", { count: "exact" })
      .eq("user_id", context.userId)
      .order(sortCol, { ascending: data.sortDir === "asc" })
      .range(from, to);
    if (error) throw new Error(error.message);
    return {
      rows: (rows ?? []).map((r) => ({ ...r, amount: Number(r.amount) })) as TxnRow[],
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });


export const getMySummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MemberSummary> => {
    const [{ data: savings }, { data: loans }] = await Promise.all([
      context.supabase.from("savings_accounts").select("balance").eq("user_id", context.userId),
      context.supabase.from("loans").select("amount, status").eq("user_id", context.userId),
    ]);
    const totalSavings = (savings ?? []).reduce((s, r: any) => s + Number(r.balance ?? 0), 0);
    const activeLoanBalance = (loans ?? [])
      .filter((l: any) => l.status === "active" || l.status === "approved")
      .reduce((s, r: any) => s + Number(r.amount ?? 0), 0);
    return { totalSavings, activeLoanBalance, nextContribution: null };
  });

const LoanApplicationSchema = z.object({
  product: z.string().min(2).max(80),
  product_id: z.string().uuid().optional().nullable(),
  amount: z.number().positive().max(10_000_000),
  term_months: z.number().int().min(1).max(360),
  purpose: z.string().max(1000).optional().nullable(),
});

export const applyForLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => LoanApplicationSchema.parse(data))
  .handler(async ({ data, context }): Promise<LoanRow> => {
    const year = new Date().getFullYear();
    const suffix = Math.floor(1000 + Math.random() * 9000);
    const ref = `LN-${year}-${suffix}`;

    // Product-based applications are re-checked server-side; the client preview
    // is advisory only and must never be the gate.
    let rate: number | null = null;
    if (data.product_id) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: verdict, error: eligErr } = await (supabaseAdmin as any).rpc("check_loan_eligibility", {
        _user_id: context.userId,
        _product_id: data.product_id,
        _amount: data.amount,
        _term_months: data.term_months,
      });
      if (eligErr) throw new Error(eligErr.message);
      const v = (verdict ?? {}) as any;
      if (!v.eligible) {
        const reasons = ((v.reasons ?? []) as string[]).join("; ");
        throw new Error(reasons || "You are not currently eligible for this product.");
      }
      rate = v.interest_rate == null ? null : Number(v.interest_rate);
    }

    const { data: inserted, error } = await context.supabase
      .from("loans")
      .insert({
        user_id: context.userId,
        ref,
        product: data.product,
        ...(data.product_id ? { product_id: data.product_id } : {}),
        ...(rate != null ? { interest_rate: rate } : {}),
        amount: data.amount,
        term_months: data.term_months,
        purpose: data.purpose ?? null,
        status: "pending",
      })
      .select("id, ref, product, amount, term_months, interest_rate, status, purpose, created_at, decided_at")
      .single();
    if (error) throw new Error(error.message);


    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: "member",
      action: "loan.application.submitted",
      target: inserted.id,
      meta: { ref, product: data.product, amount: data.amount, term_months: data.term_months },
    });

    return { ...inserted, amount: Number(inserted.amount), interest_rate: Number(inserted.interest_rate) } as LoanRow;
  });

export type MemberLoanScheduleRow = {
  id: string;
  installment_no: number;
  due_date: string;
  principal_due: number;
  interest_due: number;
  total_due: number;
  paid_amount: number;
  paid_at: string | null;
  status: "due" | "partial" | "paid" | "late";
};

export type MemberLoanDetail = LoanRow & {
  outstanding_principal: number;
  monthly_payment: number | null;
  disbursed_at: string | null;
  first_payment_at: string | null;
  maturity_at: string | null;
  decision_note: string | null;
  schedule: MemberLoanScheduleRow[];
};

export const getMyLoanDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ loan_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<MemberLoanDetail> => {
    const { data: loan, error } = await context.supabase
      .from("loans")
      .select(
        "id, ref, product, amount, term_months, interest_rate, status, purpose, created_at, decided_at, decision_note, outstanding_principal, monthly_payment, disbursed_at, first_payment_at, maturity_at",
      )
      .eq("id", data.loan_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!loan) throw new Error("Loan not found");
    const { data: sched } = await context.supabase
      .from("loan_repayments")
      .select("id, installment_no, due_date, principal_due, interest_due, total_due, paid_amount, paid_at, status")
      .eq("loan_id", loan.id)
      .order("installment_no", { ascending: true });
    return {
      ...(loan as any),
      amount: Number(loan.amount),
      interest_rate: Number(loan.interest_rate),
      outstanding_principal: Number(loan.outstanding_principal ?? 0),
      monthly_payment: loan.monthly_payment != null ? Number(loan.monthly_payment) : null,
      schedule: (sched ?? []).map((r: any) => ({
        ...r,
        principal_due: Number(r.principal_due),
        interest_due: Number(r.interest_due),
        total_due: Number(r.total_due),
        paid_amount: Number(r.paid_amount),
      })),
    } as MemberLoanDetail;
  });

const SubmitRepaymentSchema = z.object({
  loan_id: z.string().uuid(),
  amount: z.number().positive().max(100_000_000),
  channel: z.string().trim().min(2).max(40),
  note: z.string().trim().max(500).optional().nullable(),
});

export const submitLoanRepayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SubmitRepaymentSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ txn_id: string; ref: string }> => {
    // Confirm loan ownership & active status (RLS-scoped)
    const { data: loan, error: lerr } = await context.supabase
      .from("loans")
      .select("id, ref, status, outstanding_principal")
      .eq("id", data.loan_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (lerr) throw new Error(lerr.message);
    if (!loan) throw new Error("Loan not found");
    if (loan.status !== "active") throw new Error("Loan is not active");
    const outstanding = Number(loan.outstanding_principal ?? 0);
    if (data.amount > outstanding * 1.1 + 0.01) {
      throw new Error("Amount exceeds outstanding balance");
    }

    const ref = `REPAY-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const { data: inserted, error } = await context.supabase
      .from("transactions")
      .insert({
        user_id: context.userId,
        ref,
        kind: "loan_repayment",
        amount: data.amount,
        status: "pending",
        channel: data.channel,
        loan_id: data.loan_id,
        note: data.note ?? null,
      })
      .select("id, ref")
      .single();
    if (error) throw new Error(error.message);

    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: "member",
      action: "loan.repayment.submitted",
      target: inserted.id,
      meta: { ref: inserted.ref, loan_ref: loan.ref, amount: data.amount, channel: data.channel },
    });

    return { txn_id: inserted.id, ref: inserted.ref };
  });
