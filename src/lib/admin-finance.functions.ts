import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FINANCE_ROLES = new Set(["super_admin", "finance_officer"]);
const VIEW_ROLES = new Set([...FINANCE_ROLES, "auditor", "compliance_officer"]);

async function loadRoles(supabase: any, userId: string): Promise<string[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: any) => r.role as string);
}
async function assertFinance(supabase: any, userId: string) {
  const roles = await loadRoles(supabase, userId);
  if (!roles.some((r) => FINANCE_ROLES.has(r))) throw new Error("Forbidden: finance role required");
}
async function assertView(supabase: any, userId: string) {
  const roles = await loadRoles(supabase, userId);
  if (!roles.some((r) => VIEW_ROLES.has(r))) throw new Error("Forbidden: finance/audit role required");
}

// ============ Expenses ============
export type ExpenseRow = {
  id: string;
  ref: string;
  category: string | null;
  amount: number;
  status: "pending" | "approved" | "rejected" | "paid" | "void";
  note: string | null;
  vendor: string | null;
  incurred_on: string;
  created_at: string;
  posted_by: string;
  approved_by: string | null;
  paid_at: string | null;
};

export const listExpenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ status: z.string().optional(), limit: z.number().int().min(1).max(200).default(100) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<ExpenseRow[]> => {
    await assertView(context.supabase, context.userId);
    let q = context.supabase.from("expenses").select("*").order("created_at", { ascending: false }).limit(data.limit);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as ExpenseRow[];
  });

export const listExpenseCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Array<{ id: string; name: string }>> => {
    await assertView(context.supabase, context.userId);
    const { data, error } = await context.supabase.from("expense_categories").select("id,name").order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ id: string; name: string }>;
  });

export const postExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        category_id: z.string().uuid().nullable().optional(),
        amount: z.number().positive(),
        vendor: z.string().max(200).nullable().optional(),
        note: z.string().max(1000).nullable().optional(),
        incurred_on: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await assertFinance(context.supabase, context.userId);
    const { data: row, error } = await context.supabase.rpc("post_expense", {
      _category_id: data.category_id ?? null,
      _amount: data.amount,
      _vendor: data.vendor ?? null,
      _note: data.note ?? null,
      _incurred_on: data.incurred_on ?? new Date().toISOString().slice(0, 10),
    });
    if (error) throw new Error(error.message);
    return { id: row as string };
  });

export const decideExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["approve", "reject", "pay"]),
        note: z.string().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertFinance(context.supabase, context.userId);
    const rpc = data.action === "approve" ? "approve_expense" : data.action === "reject" ? "reject_expense" : "pay_expense";
    const { error } = await context.supabase.rpc(rpc, { _expense_id: data.id, _note: data.note ?? null });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Transfers ============
export type TransferRow = {
  id: string;
  ref: string;
  from_account_id: string | null;
  to_account_id: string | null;
  amount: number;
  status: "pending" | "cleared" | "failed";
  note: string | null;
  created_at: string;
  cleared_at: string | null;
};

export const listTransfers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ status: z.string().optional(), limit: z.number().int().min(1).max(200).default(100) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<TransferRow[]> => {
    await assertView(context.supabase, context.userId);
    let q = context.supabase.from("transfers").select("*").order("created_at", { ascending: false }).limit(data.limit);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as TransferRow[];
  });

export const postTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        from_account_id: z.string().uuid(),
        to_account_id: z.string().uuid(),
        amount: z.number().positive(),
        note: z.string().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertFinance(context.supabase, context.userId);
    const { data: id, error } = await context.supabase.rpc("post_transfer", {
      _from_account_id: data.from_account_id,
      _to_account_id: data.to_account_id,
      _amount: data.amount,
      _note: data.note ?? null,
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const clearTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), note: z.string().max(500).nullable().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertFinance(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("clear_transfer", { _transfer_id: data.id, _note: data.note ?? null });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Adjustments ============
export type AdjustmentRow = {
  id: string;
  ref: string;
  savings_account_id: string;
  direction: "credit" | "debit";
  amount: number;
  reason: string;
  created_at: string;
  posted_by: string;
};

export const listAdjustments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(200).default(100) }).parse(d))
  .handler(async ({ data, context }): Promise<AdjustmentRow[]> => {
    await assertView(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("balance_adjustments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []) as AdjustmentRow[];
  });

export const postAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        savings_account_id: z.string().uuid(),
        direction: z.enum(["credit", "debit"]),
        amount: z.number().positive(),
        reason: z.string().min(3).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertFinance(context.supabase, context.userId);
    const { data: id, error } = await context.supabase.rpc("post_balance_adjustment", {
      _savings_account_id: data.savings_account_id,
      _direction: data.direction,
      _amount: data.amount,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

// ============ Dashboard summary ============
export type FinanceSummary = {
  cash_in_30d: number;
  cash_out_30d: number;
  net_30d: number;
  expenses_pending: number;
  expenses_pending_amount: number;
  transfers_pending: number;
  aum: number;
  outstanding_loans: number;
  income_series: Array<{ day: string; amount: number }>;
  expense_series: Array<{ day: string; amount: number }>;
};

export const getFinanceSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FinanceSummary> => {
    await assertView(context.supabase, context.userId);
    const sb = context.supabase;
    const now = new Date();
    const from = new Date(now.getTime() - 29 * 24 * 3600 * 1000).toISOString();

    const [txnRes, expRes, transRes, savingsRes, loansRes] = await Promise.all([
      sb.from("transactions").select("kind,amount,status,created_at").gte("created_at", from),
      sb.from("expenses").select("status,amount,created_at"),
      sb.from("transfers").select("status,amount"),
      sb.from("savings_accounts").select("balance"),
      sb.from("loans").select("outstanding_principal,status"),
    ]);
    const txns = (txnRes.data ?? []) as Array<{ kind: string; amount: number; status: string; created_at: string }>;
    const cash_in_30d = txns
      .filter((t) => t.status === "cleared" && (t.kind === "deposit" || t.kind === "loan_repayment"))
      .reduce((s, t) => s + Number(t.amount), 0);
    const cash_out_30d = txns
      .filter((t) => t.status === "cleared" && (t.kind === "withdrawal" || t.kind === "loan_disbursement" || t.kind === "expense"))
      .reduce((s, t) => s + Number(t.amount), 0);

    // Build daily series (last 30 days)
    const buckets = new Map<string, { inc: number; out: number }>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
      buckets.set(d, { inc: 0, out: 0 });
    }
    for (const t of txns) {
      if (t.status !== "cleared") continue;
      const day = t.created_at.slice(0, 10);
      const b = buckets.get(day);
      if (!b) continue;
      if (t.kind === "deposit" || t.kind === "loan_repayment") b.inc += Number(t.amount);
      else if (t.kind === "withdrawal" || t.kind === "loan_disbursement" || t.kind === "expense") b.out += Number(t.amount);
    }
    const income_series = Array.from(buckets.entries()).map(([day, b]) => ({ day, amount: b.inc }));
    const expense_series = Array.from(buckets.entries()).map(([day, b]) => ({ day, amount: b.out }));

    const expenses = (expRes.data ?? []) as Array<{ status: string; amount: number }>;
    const expenses_pending = expenses.filter((e) => e.status === "pending").length;
    const expenses_pending_amount = expenses.filter((e) => e.status === "pending").reduce((s, e) => s + Number(e.amount), 0);
    const transfers = (transRes.data ?? []) as Array<{ status: string; amount: number }>;
    const transfers_pending = transfers.filter((t) => t.status === "pending").length;
    const aum = ((savingsRes.data ?? []) as Array<{ balance: number }>).reduce((s, r) => s + Number(r.balance), 0);
    const outstanding_loans = ((loansRes.data ?? []) as Array<{ outstanding_principal: number; status: string }>)
      .filter((l) => l.status === "active")
      .reduce((s, l) => s + Number(l.outstanding_principal), 0);

    return {
      cash_in_30d,
      cash_out_30d,
      net_30d: cash_in_30d - cash_out_30d,
      expenses_pending,
      expenses_pending_amount,
      transfers_pending,
      aum,
      outstanding_loans,
      income_series,
      expense_series,
    };
  });

// Helper: list savings accounts for the finance transfer/adjustment pickers.
export type SavingsPick = { id: string; user_id: string; balance: number; plan_name: string | null; member_name: string | null; member_no: string | null };
export const listSavingsForFinance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SavingsPick[]> => {
    await assertView(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("savings_accounts")
      .select("id,user_id,balance,savings_plans(name),profiles!inner(full_name,member_no)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      balance: Number(r.balance),
      plan_name: r.savings_plans?.name ?? null,
      member_name: r.profiles?.full_name ?? null,
      member_no: r.profiles?.member_no ?? null,
    }));
  });
