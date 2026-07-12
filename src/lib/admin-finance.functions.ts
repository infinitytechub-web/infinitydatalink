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
  category_code: string;
  vendor: string;
  amount: number;
  currency: string;
  status: "pending" | "approved" | "rejected" | "paid";
  incurred_on: string;
  paid_on: string | null;
  notes: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
};

export const listExpenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ status: z.string().optional(), limit: z.number().int().min(1).max(200).default(100) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<ExpenseRow[]> => {
    await assertView(context.supabase, context.userId);
    let q: any = context.supabase.from("expenses").select("*").order("created_at", { ascending: false }).limit(data.limit);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as ExpenseRow[];
  });

export const listExpenseCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Array<{ code: string; label: string }>> => {
    await assertView(context.supabase, context.userId);
    const { data, error } = await (context.supabase as any)
      .from("expense_categories")
      .select("code,label")
      .eq("active", true)
      .order("label");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ code: string; label: string }>;
  });

export const postExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        category_code: z.string().min(1),
        vendor: z.string().min(1).max(200),
        amount: z.number().positive(),
        incurred_on: z.string().optional(),
        payment_channel: z.string().max(50).nullable().optional(),
        reference: z.string().max(100).nullable().optional(),
        notes: z.string().max(1000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await assertFinance(context.supabase, context.userId);
    const { data: row, error } = await (context.supabase as any).rpc("post_expense", {
      _category_code: data.category_code,
      _vendor: data.vendor,
      _amount: data.amount,
      _incurred_on: data.incurred_on ?? new Date().toISOString().slice(0, 10),
      _payment_channel: data.payment_channel ?? null,
      _reference: data.reference ?? null,
      _notes: data.notes ?? null,
      _actor_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { id: (row as any)?.id ?? (row as any) };
  });

export const decideExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["approve", "reject", "pay"]),
        reason: z.string().max(500).nullable().optional(),
        channel: z.string().max(50).nullable().optional(),
        reference: z.string().max(100).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertFinance(context.supabase, context.userId);
    let args: Record<string, any>;
    let rpc: string;
    if (data.action === "approve") {
      rpc = "approve_expense";
      args = { _expense_id: data.id, _actor_id: context.userId };
    } else if (data.action === "reject") {
      if (!data.reason || data.reason.trim().length < 3) throw new Error("Rejection reason required");
      rpc = "reject_expense";
      args = { _expense_id: data.id, _reason: data.reason, _actor_id: context.userId };
    } else {
      rpc = "pay_expense";
      args = {
        _expense_id: data.id,
        _channel: data.channel ?? "manual",
        _reference: data.reference ?? "",
        _actor_id: context.userId,
      };
    }
    const { error } = await (context.supabase as any).rpc(rpc, args);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Transfers ============
export type TransferRow = {
  id: string;
  ref: string;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  status: "pending" | "cleared" | "failed" | "reversed";
  channel: string | null;
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
    let q: any = context.supabase.from("transfers").select("*").order("created_at", { ascending: false }).limit(data.limit);
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
        channel: z.string().max(50).nullable().optional(),
        note: z.string().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertFinance(context.supabase, context.userId);
    const { data: id, error } = await (context.supabase as any).rpc("post_transfer", {
      _from: data.from_account_id,
      _to: data.to_account_id,
      _amount: data.amount,
      _channel: data.channel ?? "internal",
      _note: data.note ?? null,
      _actor_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { id: (id as any)?.id ?? (id as any) };
  });

export const clearTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context.supabase, context.userId);
    const { error } = await (context.supabase as any).rpc("clear_transfer", {
      _transfer_id: data.id,
      _actor_id: context.userId,
    });
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
  approved_by: string | null;
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
    const { data: id, error } = await (context.supabase as any).rpc("post_balance_adjustment", {
      _account_id: data.savings_account_id,
      _direction: data.direction,
      _amount: data.amount,
      _reason: data.reason,
      _actor_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { id: (id as any)?.id ?? (id as any) };
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
      sb.from("expenses").select("status,amount"),
      sb.from("transfers").select("status,amount"),
      sb.from("savings_accounts").select("balance"),
      sb.from("loans").select("outstanding_principal,status"),
    ]);
    const txns = (txnRes.data ?? []) as Array<{ kind: string; amount: number; status: string; created_at: string }>;
    const isIn = (k: string) => k === "deposit" || k === "loan_repayment";
    const isOut = (k: string) => k === "withdrawal" || k === "loan_disbursement" || k === "expense";
    const cash_in_30d = txns.filter((t) => t.status === "cleared" && isIn(t.kind)).reduce((s, t) => s + Number(t.amount), 0);
    const cash_out_30d = txns.filter((t) => t.status === "cleared" && isOut(t.kind)).reduce((s, t) => s + Number(t.amount), 0);

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
      if (isIn(t.kind)) b.inc += Number(t.amount);
      else if (isOut(t.kind)) b.out += Number(t.amount);
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

export type SavingsPick = {
  id: string;
  user_id: string;
  balance: number;
  plan_name: string | null;
  member_name: string | null;
  member_no: string | null;
};

export const listSavingsForFinance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SavingsPick[]> => {
    await assertView(context.supabase, context.userId);
    const { data, error } = await (context.supabase as any)
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
