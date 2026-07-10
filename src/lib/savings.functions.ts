import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============================================================================
// Types
// ============================================================================

export type SavingsPlan = {
  id: string;
  name: string;
  schedule: string;
  interest_rate: number;
  description: string | null;
  min_contribution: number;
  contribution_amount: number;
  lock_days: number;
  is_active: boolean;
  sort_order: number;
};

export type SavingsAccount = {
  id: string;
  plan_id: string;
  plan_name: string;
  plan_schedule: string;
  plan_interest_rate: number;
  balance: number;
  nickname: string | null;
  goal_amount: number | null;
  goal_target_date: string | null;
  status: string;
  progress_pct: number | null;
  created_at: string;
  updated_at: string;
};

export type SavingsTxn = {
  id: string;
  ref: string;
  kind: string;
  amount: number;
  status: "pending" | "cleared" | "failed";
  channel: string | null;
  note: string | null;
  created_at: string;
};

export type AccountDetail = {
  account: SavingsAccount;
  transactions: SavingsTxn[];
};

export type AdminSavingsSummary = {
  total_balance: number;
  active_plans: number;
  active_accounts: number;
  pending_count: number;
  failed_24h: number;
  plans: Array<{
    id: string;
    name: string;
    schedule: string;
    interest_rate: number;
    members: number;
    balance: number;
  }>;
};

export type AdminPendingTxn = {
  id: string;
  ref: string;
  kind: string;
  amount: number;
  channel: string | null;
  note: string | null;
  created_at: string;
  user_id: string;
  member_name: string | null;
  member_no: string | null;
  account_id: string | null;
  plan_name: string | null;
};

// ============================================================================
// Member: list own accounts
// ============================================================================

export const listMyAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SavingsAccount[]> => {
    const { data, error } = await context.supabase
      .from("savings_accounts")
      .select(
        "id, plan_id, balance, nickname, goal_amount, goal_target_date, status, created_at, updated_at, savings_plans(name, schedule, interest_rate)",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => {
      const balance = Number(r.balance ?? 0);
      const goal = r.goal_amount == null ? null : Number(r.goal_amount);
      return {
        id: r.id,
        plan_id: r.plan_id,
        plan_name: r.savings_plans?.name ?? "Savings Plan",
        plan_schedule: r.savings_plans?.schedule ?? "—",
        plan_interest_rate: Number(r.savings_plans?.interest_rate ?? 0),
        balance,
        nickname: r.nickname,
        goal_amount: goal,
        goal_target_date: r.goal_target_date,
        status: r.status,
        progress_pct: goal && goal > 0 ? Math.min(100, Math.round((balance / goal) * 100)) : null,
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    });
  });

// ============================================================================
// Member: list available (enrollable) plans
// ============================================================================

export const listAvailablePlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SavingsPlan[]> => {
    const [{ data: plans, error: pErr }, { data: enrolled, error: eErr }] = await Promise.all([
      context.supabase
        .from("savings_plans")
        .select("id, name, schedule, interest_rate, description, min_contribution, contribution_amount, lock_days, is_active, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      context.supabase.from("savings_accounts").select("plan_id, status").eq("user_id", context.userId),
    ]);
    if (pErr) throw new Error(pErr.message);
    if (eErr) throw new Error(eErr.message);
    const openPlans = new Set((enrolled ?? []).filter((a: any) => a.status === "active").map((a: any) => a.plan_id));
    return (plans ?? [])
      .filter((p: any) => !openPlans.has(p.id))
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        schedule: p.schedule,
        interest_rate: Number(p.interest_rate ?? 0),
        description: p.description,
        min_contribution: Number(p.min_contribution ?? 0),
        contribution_amount: Number(p.contribution_amount ?? 0),
        lock_days: p.lock_days ?? 0,
        is_active: p.is_active,
        sort_order: p.sort_order ?? 0,
      }));
  });

// ============================================================================
// Member: enroll in a plan
// ============================================================================

const EnrollSchema = z.object({
  plan_id: z.string().uuid(),
  nickname: z.string().trim().min(1).max(80).optional().nullable(),
  goal_amount: z.number().positive().max(100_000_000).optional().nullable(),
  goal_target_date: z.string().optional().nullable(),
});

export const enrollInPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => EnrollSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    // KYC gate
    const { data: profile, error: pErr } = await context.supabase
      .from("profiles")
      .select("kyc")
      .eq("id", context.userId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!profile || profile.kyc !== "active") {
      throw new Error("kyc_not_approved");
    }
    const { data: inserted, error } = await context.supabase
      .from("savings_accounts")
      .insert({
        user_id: context.userId,
        plan_id: data.plan_id,
        nickname: data.nickname ?? null,
        goal_amount: data.goal_amount ?? null,
        goal_target_date: data.goal_target_date ?? null,
        status: "active",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

// ============================================================================
// Member: account detail with recent transactions
// ============================================================================

export const getMyAccountDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<AccountDetail> => {
    const { data: acct, error } = await context.supabase
      .from("savings_accounts")
      .select(
        "id, plan_id, balance, nickname, goal_amount, goal_target_date, status, created_at, updated_at, savings_plans(name, schedule, interest_rate)",
      )
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!acct) throw new Error("account_not_found");
    const { data: txns, error: tErr } = await context.supabase
      .from("transactions")
      .select("id, ref, kind, amount, status, channel, note, created_at")
      .eq("savings_account_id", data.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (tErr) throw new Error(tErr.message);
    const a: any = acct;
    const balance = Number(a.balance ?? 0);
    const goal = a.goal_amount == null ? null : Number(a.goal_amount);
    return {
      account: {
        id: a.id,
        plan_id: a.plan_id,
        plan_name: a.savings_plans?.name ?? "Savings Plan",
        plan_schedule: a.savings_plans?.schedule ?? "—",
        plan_interest_rate: Number(a.savings_plans?.interest_rate ?? 0),
        balance,
        nickname: a.nickname,
        goal_amount: goal,
        goal_target_date: a.goal_target_date,
        status: a.status,
        progress_pct: goal && goal > 0 ? Math.min(100, Math.round((balance / goal) * 100)) : null,
        created_at: a.created_at,
        updated_at: a.updated_at,
      },
      transactions: (txns ?? []).map((t: any) => ({
        id: t.id,
        ref: t.ref,
        kind: t.kind,
        amount: Number(t.amount),
        status: t.status,
        channel: t.channel,
        note: t.note,
        created_at: t.created_at,
      })),
    };
  });

// ============================================================================
// Member: submit contribution / withdrawal
// ============================================================================

const MoveSchema = z.object({
  account_id: z.string().uuid(),
  amount: z.number().positive().max(10_000_000),
  channel: z.string().min(2).max(60).default("manual"),
  note: z.string().max(500).optional().nullable(),
});

export const submitContribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MoveSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ txn_id: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: id, error } = await supabaseAdmin.rpc("post_savings_contribution", {
      _account_id: data.account_id,
      _amount: data.amount,
      _channel: data.channel,
      _note: data.note ?? "",
      _actor_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { txn_id: id as string };
  });

export const submitWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MoveSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ txn_id: string }> => {
    const { data: id, error } = await context.supabase.rpc("post_savings_withdrawal", {
      _account_id: data.account_id,
      _amount: data.amount,
      _channel: data.channel,
      _note: data.note ?? "",
    });
    if (error) throw new Error(error.message);
    return { txn_id: id as string };
  });

// ============================================================================
// Admin: summary + pending queue + settle
// ============================================================================

async function assertFinanceOrAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = new Set((data ?? []).map((r: any) => r.role));
  if (!roles.has("super_admin") && !roles.has("finance_officer")) {
    throw new Error("forbidden");
  }
}

export const adminListSavingsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminSavingsSummary> => {
    await assertFinanceOrAdmin(context.supabase, context.userId);
    const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
    const [{ data: accounts, error: aErr }, { data: plans, error: pErr }, { count: pending, error: qErr }, { count: failed, error: fErr }] =
      await Promise.all([
        context.supabase.from("savings_accounts").select("plan_id, balance, status"),
        context.supabase
          .from("savings_plans")
          .select("id, name, schedule, interest_rate, is_active")
          .order("sort_order", { ascending: true }),
        context.supabase.from("transactions").select("id", { count: "exact", head: true }).eq("status", "pending"),
        context.supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("status", "failed")
          .gte("created_at", since24h),
      ]);
    if (aErr) throw new Error(aErr.message);
    if (pErr) throw new Error(pErr.message);
    if (qErr) throw new Error(qErr.message);
    if (fErr) throw new Error(fErr.message);

    const per = new Map<string, { members: number; balance: number }>();
    let total = 0;
    let activeCount = 0;
    for (const a of accounts ?? []) {
      const rec = per.get(a.plan_id) ?? { members: 0, balance: 0 };
      rec.members += 1;
      const bal = Number(a.balance ?? 0);
      rec.balance += bal;
      total += bal;
      if (a.status === "active") activeCount += 1;
      per.set(a.plan_id, rec);
    }
    const activePlans = (plans ?? []).filter((p: any) => p.is_active);
    return {
      total_balance: total,
      active_plans: activePlans.length,
      active_accounts: activeCount,
      pending_count: pending ?? 0,
      failed_24h: failed ?? 0,
      plans: activePlans.map((p: any) => ({
        id: p.id,
        name: p.name,
        schedule: p.schedule,
        interest_rate: Number(p.interest_rate ?? 0),
        members: per.get(p.id)?.members ?? 0,
        balance: per.get(p.id)?.balance ?? 0,
      })),
    };
  });

export const adminListPendingTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(["deposit", "withdrawal", "all"]).default("all"),
        limit: z.number().int().min(1).max(100).default(25),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<AdminPendingTxn[]> => {
    await assertFinanceOrAdmin(context.supabase, context.userId);
    let q = context.supabase
      .from("transactions")
      .select(
        "id, ref, kind, amount, channel, note, created_at, user_id, savings_account_id, profiles!transactions_user_id_fkey(full_name, member_no), savings_accounts(savings_plans(name))",
      )
      .eq("status", "pending")
      .in("kind", ["deposit", "withdrawal"])
      .order("created_at", { ascending: true })
      .limit(data.limit);
    if (data.kind !== "all") q = q.eq("kind", data.kind);
    const { data: rows, error } = await q;
    if (error) {
      // Fallback without join if FK alias is unavailable
      const { data: rows2, error: e2 } = await context.supabase
        .from("transactions")
        .select("id, ref, kind, amount, channel, note, created_at, user_id, savings_account_id")
        .eq("status", "pending")
        .in("kind", ["deposit", "withdrawal"])
        .order("created_at", { ascending: true })
        .limit(data.limit);
      if (e2) throw new Error(e2.message);
      return (rows2 ?? []).map((t: any) => ({
        id: t.id,
        ref: t.ref,
        kind: t.kind,
        amount: Number(t.amount),
        channel: t.channel,
        note: t.note,
        created_at: t.created_at,
        user_id: t.user_id,
        member_name: null,
        member_no: null,
        account_id: t.savings_account_id,
        plan_name: null,
      }));
    }
    return (rows ?? []).map((t: any) => ({
      id: t.id,
      ref: t.ref,
      kind: t.kind,
      amount: Number(t.amount),
      channel: t.channel,
      note: t.note,
      created_at: t.created_at,
      user_id: t.user_id,
      member_name: t.profiles?.full_name ?? null,
      member_no: t.profiles?.member_no ?? null,
      account_id: t.savings_account_id,
      plan_name: t.savings_accounts?.savings_plans?.name ?? null,
    }));
  });

const SettleSchema = z.object({
  txn_id: z.string().uuid(),
  status: z.enum(["cleared", "failed"]),
  note: z.string().max(500).optional().nullable(),
});

export const adminSettleTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SettleSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    if (data.status === "failed" && !data.note?.trim()) {
      throw new Error("note_required_for_rejection");
    }
    const { error } = await context.supabase.rpc("finalize_transaction", {
      _txn_id: data.txn_id,
      _status: data.status,
      _note: data.note ?? "",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
