import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const VIEW_ROLES = new Set(["super_admin", "finance_officer", "auditor", "compliance_officer"]);
async function assertView(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role as string);
  if (!roles.some((r: string) => VIEW_ROLES.has(r))) throw new Error("Forbidden: finance/audit role required");
}

const RangeSchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .transform((v) => {
    const now = new Date();
    const to = v.to ? new Date(v.to) : now;
    const from = v.from ? new Date(v.from) : new Date(to.getTime() - 29 * 24 * 3600 * 1000);
    return { from: from.toISOString(), to: to.toISOString(), fromDate: from, toDate: to };
  });

const INCOME_KINDS = new Set(["deposit", "loan_repayment", "transfer_in"]);
const EXPENSE_KINDS = new Set(["withdrawal", "loan_disbursement", "expense", "transfer_out", "adjustment"]);

function isIncome(k: string) {
  return INCOME_KINDS.has(k);
}
function isExpense(k: string) {
  return EXPENSE_KINDS.has(k);
}

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function bucketDays(from: Date, to: Date) {
  const out = new Map<string, { income: number; expense: number }>();
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  for (let d = start; d <= end; d = new Date(d.getTime() + 24 * 3600 * 1000)) {
    out.set(d.toISOString().slice(0, 10), { income: 0, expense: 0 });
  }
  return out;
}

// ============ Financial Summary (P&L + Balance snapshot) ============
export type FinancialSummary = {
  from: string;
  to: string;
  income_total: number;
  expense_total: number;
  net: number;
  income_by_kind: Array<{ kind: string; amount: number }>;
  expense_by_kind: Array<{ kind: string; amount: number }>;
  daily_series: Array<{ day: string; income: number; expense: number; net: number }>;
  balance_snapshot: {
    aum: number;
    outstanding_loans: number;
    pending_expenses_amount: number;
    pending_transfers_amount: number;
    active_savings_accounts: number;
    active_loans: number;
  };
};

export const getFinancialSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RangeSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<FinancialSummary> => {
    await assertView(context.supabase, context.userId);
    const sb = context.supabase;
    const [txnRes, expRes, transRes, savingsRes, loansRes] = await Promise.all([
      sb
        .from("transactions")
        .select("kind,amount,status,created_at")
        .gte("created_at", data.from)
        .lte("created_at", data.to),
      sb.from("expenses").select("status,amount"),
      sb.from("transfers").select("status,amount"),
      sb.from("savings_accounts").select("balance,status"),
      sb.from("loans").select("outstanding_principal,status"),
    ]);
    const txns = (txnRes.data ?? []) as Array<{ kind: string; amount: number; status: string; created_at: string }>;

    let income_total = 0;
    let expense_total = 0;
    const inKind = new Map<string, number>();
    const outKind = new Map<string, number>();
    const daily = bucketDays(data.fromDate, data.toDate);
    for (const t of txns) {
      if (t.status !== "cleared") continue;
      const a = Number(t.amount);
      if (isIncome(t.kind)) {
        income_total += a;
        inKind.set(t.kind, (inKind.get(t.kind) ?? 0) + a);
        const b = daily.get(dayKey(t.created_at));
        if (b) b.income += a;
      } else if (isExpense(t.kind)) {
        expense_total += a;
        outKind.set(t.kind, (outKind.get(t.kind) ?? 0) + a);
        const b = daily.get(dayKey(t.created_at));
        if (b) b.expense += a;
      }
    }

    const daily_series = Array.from(daily.entries()).map(([day, v]) => ({
      day,
      income: v.income,
      expense: v.expense,
      net: v.income - v.expense,
    }));

    const savings = (savingsRes.data ?? []) as Array<{ balance: number; status: string }>;
    const loans = (loansRes.data ?? []) as Array<{ outstanding_principal: number; status: string }>;
    const expenses = (expRes.data ?? []) as Array<{ status: string; amount: number }>;
    const transfers = (transRes.data ?? []) as Array<{ status: string; amount: number }>;

    return {
      from: data.from,
      to: data.to,
      income_total,
      expense_total,
      net: income_total - expense_total,
      income_by_kind: Array.from(inKind, ([kind, amount]) => ({ kind, amount })).sort((a, b) => b.amount - a.amount),
      expense_by_kind: Array.from(outKind, ([kind, amount]) => ({ kind, amount })).sort((a, b) => b.amount - a.amount),
      daily_series,
      balance_snapshot: {
        aum: savings.reduce((s, r) => s + Number(r.balance), 0),
        outstanding_loans: loans.filter((l) => l.status === "active").reduce((s, l) => s + Number(l.outstanding_principal), 0),
        pending_expenses_amount: expenses.filter((e) => e.status === "pending").reduce((s, e) => s + Number(e.amount), 0),
        pending_transfers_amount: transfers.filter((t) => t.status === "pending").reduce((s, t) => s + Number(t.amount), 0),
        active_savings_accounts: savings.filter((s) => s.status === "active").length,
        active_loans: loans.filter((l) => l.status === "active").length,
      },
    };
  });

// ============ Contributions report ============
export type ContributionsRow = {
  id: string;
  ref: string;
  created_at: string;
  amount: number;
  status: string;
  channel: string | null;
  member_name: string | null;
  member_no: string | null;
  plan_name: string | null;
};

export type ContributionsReport = {
  from: string;
  to: string;
  cleared_total: number;
  pending_total: number;
  cleared_count: number;
  pending_count: number;
  by_plan: Array<{ plan: string; amount: number; count: number }>;
  daily: Array<{ day: string; amount: number }>;
  rows: ContributionsRow[];
};

export const getContributionsReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RangeSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<ContributionsReport> => {
    await assertView(context.supabase, context.userId);
    const { data: rows, error } = await (context.supabase as any)
      .from("transactions")
      .select(
        "id, ref, amount, status, channel, created_at, savings_account_id, profiles!transactions_user_id_profiles_fkey(full_name, member_no), savings_accounts(savings_plans(name))",
      )
      .eq("kind", "deposit")
      .gte("created_at", data.from)
      .lte("created_at", data.to)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);

    const daily = bucketDays(data.fromDate, data.toDate);
    let cleared_total = 0;
    let pending_total = 0;
    let cleared_count = 0;
    let pending_count = 0;
    const planAgg = new Map<string, { amount: number; count: number }>();
    const mapped: ContributionsRow[] = (rows ?? []).map((r: any) => {
      const amt = Number(r.amount);
      const plan = r.savings_accounts?.savings_plans?.name ?? "—";
      if (r.status === "cleared") {
        cleared_total += amt;
        cleared_count += 1;
        const b = daily.get(dayKey(r.created_at));
        if (b) b.income += amt;
        const rec = planAgg.get(plan) ?? { amount: 0, count: 0 };
        rec.amount += amt;
        rec.count += 1;
        planAgg.set(plan, rec);
      } else if (r.status === "pending") {
        pending_total += amt;
        pending_count += 1;
      }
      return {
        id: r.id,
        ref: r.ref,
        amount: amt,
        status: r.status,
        channel: r.channel,
        created_at: r.created_at,
        member_name: r.profiles?.full_name ?? null,
        member_no: r.profiles?.member_no ?? null,
        plan_name: plan,
      };
    });

    return {
      from: data.from,
      to: data.to,
      cleared_total,
      pending_total,
      cleared_count,
      pending_count,
      by_plan: Array.from(planAgg, ([plan, v]) => ({ plan, ...v })).sort((a, b) => b.amount - a.amount),
      daily: Array.from(daily, ([day, v]) => ({ day, amount: v.income })),
      rows: mapped,
    };
  });

// ============ Income breakdown ============
export type IncomeBreakdown = {
  from: string;
  to: string;
  total: number;
  by_kind: Array<{ kind: string; amount: number; count: number }>;
  by_channel: Array<{ channel: string; amount: number; count: number }>;
  daily: Array<{ day: string; amount: number }>;
};

export const getIncomeBreakdown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RangeSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<IncomeBreakdown> => {
    await assertView(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("transactions")
      .select("kind,amount,channel,created_at,status")
      .in("kind", Array.from(INCOME_KINDS) as any)
      .eq("status", "cleared")
      .gte("created_at", data.from)
      .lte("created_at", data.to);
    if (error) throw new Error(error.message);

    const byKind = new Map<string, { amount: number; count: number }>();
    const byChannel = new Map<string, { amount: number; count: number }>();
    const daily = bucketDays(data.fromDate, data.toDate);
    let total = 0;
    for (const r of (rows ?? []) as Array<{ kind: string; amount: number; channel: string | null; created_at: string }>) {
      const a = Number(r.amount);
      total += a;
      const k = byKind.get(r.kind) ?? { amount: 0, count: 0 };
      k.amount += a;
      k.count += 1;
      byKind.set(r.kind, k);
      const cn = r.channel ?? "—";
      const c = byChannel.get(cn) ?? { amount: 0, count: 0 };
      c.amount += a;
      c.count += 1;
      byChannel.set(cn, c);
      const b = daily.get(dayKey(r.created_at));
      if (b) b.income += a;
    }
    return {
      from: data.from,
      to: data.to,
      total,
      by_kind: Array.from(byKind, ([kind, v]) => ({ kind, ...v })).sort((a, b) => b.amount - a.amount),
      by_channel: Array.from(byChannel, ([channel, v]) => ({ channel, ...v })).sort((a, b) => b.amount - a.amount),
      daily: Array.from(daily, ([day, v]) => ({ day, amount: v.income })),
    };
  });

// ============ Expenses breakdown ============
export type ExpensesBreakdown = {
  from: string;
  to: string;
  total_paid: number;
  total_pending: number;
  total_approved: number;
  by_category: Array<{ code: string; label: string; amount: number; count: number }>;
  by_status: Array<{ status: string; amount: number; count: number }>;
  daily: Array<{ day: string; amount: number }>;
  top_vendors: Array<{ vendor: string; amount: number; count: number }>;
};

export const getExpensesBreakdown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RangeSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<ExpensesBreakdown> => {
    await assertView(context.supabase, context.userId);
    const [expRes, catRes] = await Promise.all([
      context.supabase
        .from("expenses")
        .select("category_code, vendor, amount, status, incurred_on, paid_on, created_at")
        .gte("created_at", data.from)
        .lte("created_at", data.to),
      (context.supabase as any).from("expense_categories").select("code,label"),
    ]);
    if (expRes.error) throw new Error(expRes.error.message);

    const catMap = new Map<string, string>();
    for (const c of ((catRes.data ?? []) as any[])) catMap.set(c.code, c.label);

    const daily = bucketDays(data.fromDate, data.toDate);
    let total_paid = 0;
    let total_pending = 0;
    let total_approved = 0;
    const byCat = new Map<string, { amount: number; count: number }>();
    const byStatus = new Map<string, { amount: number; count: number }>();
    const byVendor = new Map<string, { amount: number; count: number }>();

    for (const e of (expRes.data ?? []) as Array<{
      category_code: string;
      vendor: string;
      amount: number;
      status: string;
      created_at: string;
      paid_on: string | null;
    }>) {
      const a = Number(e.amount);
      if (e.status === "paid") total_paid += a;
      else if (e.status === "approved") total_approved += a;
      else if (e.status === "pending") total_pending += a;
      const c = byCat.get(e.category_code) ?? { amount: 0, count: 0 };
      c.amount += a;
      c.count += 1;
      byCat.set(e.category_code, c);
      const s = byStatus.get(e.status) ?? { amount: 0, count: 0 };
      s.amount += a;
      s.count += 1;
      byStatus.set(e.status, s);
      const v = byVendor.get(e.vendor) ?? { amount: 0, count: 0 };
      v.amount += a;
      v.count += 1;
      byVendor.set(e.vendor, v);
      if (e.status === "paid" && e.paid_on) {
        const b = daily.get(e.paid_on);
        if (b) b.expense += a;
      }
    }
    return {
      from: data.from,
      to: data.to,
      total_paid,
      total_pending,
      total_approved,
      by_category: Array.from(byCat, ([code, v]) => ({ code, label: catMap.get(code) ?? code, ...v })).sort(
        (a, b) => b.amount - a.amount,
      ),
      by_status: Array.from(byStatus, ([status, v]) => ({ status, ...v })),
      daily: Array.from(daily, ([day, v]) => ({ day, amount: v.expense })),
      top_vendors: Array.from(byVendor, ([vendor, v]) => ({ vendor, ...v }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10),
    };
  });
