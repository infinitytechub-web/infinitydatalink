import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole, FINANCE_ROLES, loadRoleSet, type Role } from "@/lib/role-guards";
import { writeAudit } from "@/lib/audit-log";

// ============================================================================
// Types
// ============================================================================

export type FixedDepositProduct = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  term_months: number;
  rate_annual: number;
  min_amount: number;
  max_amount: number | null;
  early_break_penalty_pct: number;
};

export type FixedDeposit = {
  id: string;
  ref: string;
  user_id: string;
  product_name: string;
  member_name?: string | null;
  member_no?: string | null;
  source_account_id: string;
  principal: number;
  rate_annual: number;
  term_months: number;
  start_date: string;
  maturity_date: string;
  interest_expected: number;
  interest_paid: number;
  penalty_amount: number;
  rollover: "none" | "principal" | "principal_interest";
  status: "active" | "matured" | "redeemed" | "broken";
  break_reason: string | null;
  broken_at: string | null;
  closed_at: string | null;
  created_at: string;
};

export type SavingsHold = {
  id: string;
  account_id: string;
  account_label: string;
  user_id: string;
  member_name: string | null;
  member_no: string | null;
  amount: number;
  reason: string;
  loan_id: string | null;
  status: "active" | "released";
  created_by_role: string | null;
  released_at: string | null;
  release_reason: string | null;
  created_at: string;
};

export type GroupPot = {
  id: string;
  entity_id: string;
  entity_name: string;
  name: string;
  description: string | null;
  contribution_amount: number;
  frequency: "daily" | "weekly" | "monthly";
  balance: number;
  current_cycle: number;
  status: string;
  member_count: number;
  my_contributed: number;
};

export type PotContribution = {
  id: string;
  pot_id: string;
  profile_id: string;
  member_name: string | null;
  cycle: number;
  amount: number;
  note: string | null;
  created_at: string;
};

export type PotPayout = {
  id: string;
  pot_id: string;
  pot_name?: string;
  profile_id: string;
  member_name: string | null;
  cycle: number;
  amount: number;
  status: "scheduled" | "paid" | "skipped";
  paid_at: string | null;
  created_at: string;
};

export type SavingsInsights = {
  total_balance: number;
  total_held: number;
  available: number;
  deposits_12m: number;
  withdrawals_12m: number;
  net_12m: number;
  interest_earned: number;
  avg_monthly_deposit: number;
  consistency_pct: number;
  months_contributed: number;
  streak_months: number;
  projected_12m: number;
  monthly: Array<{ month: string; deposits: number; withdrawals: number; net: number }>;
  goals: Array<{
    account: string;
    goal: number;
    balance: number;
    pct: number;
    target_date: string | null;
  }>;
};

// ============================================================================
// Helpers
// ============================================================================

function pickActorRole(roles: ReadonlySet<Role>): string {
  if (roles.has("super_admin")) return "super_admin";
  if (roles.has("finance_officer")) return "finance_officer";
  if (roles.has("loan_officer")) return "loan_officer";
  return "finance_officer";
}

const HOLD_ROLES: readonly Role[] = ["super_admin", "finance_officer", "loan_officer"];

async function requireRoles(context: any, allowed: readonly Role[], label: string) {
  const roles = await loadRoleSet(context.supabase, context.userId);
  assertAnyRole(roles, allowed, label);
  return pickActorRole(roles);
}

function accountLabel(a: any): string {
  return a?.nickname || a?.savings_plans?.name || "Savings account";
}

async function profileMap(supabase: any, ids: string[]) {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0)
    return new Map<string, { full_name: string | null; member_no: string | null }>();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, member_no")
    .in("id", unique);
  return new Map<string, { full_name: string | null; member_no: string | null }>(
    ((data ?? []) as any[]).map((p) => [p.id, { full_name: p.full_name, member_no: p.member_no }]),
  );
}

function mapDeposit(
  r: any,
  profile?: { full_name: string | null; member_no: string | null } | null,
): FixedDeposit {
  return {
    id: r.id,
    ref: r.ref,
    user_id: r.user_id,
    product_name: r.fixed_deposit_products?.name ?? "Term deposit",
    member_name: profile?.full_name ?? null,
    member_no: profile?.member_no ?? null,
    source_account_id: r.source_account_id,
    principal: Number(r.principal),
    rate_annual: Number(r.rate_annual),
    term_months: r.term_months,
    start_date: r.start_date,
    maturity_date: r.maturity_date,
    interest_expected: Number(r.interest_expected ?? 0),
    interest_paid: Number(r.interest_paid ?? 0),
    penalty_amount: Number(r.penalty_amount ?? 0),
    rollover: r.rollover,
    status: r.status,
    break_reason: r.break_reason ?? null,
    broken_at: r.broken_at ?? null,
    closed_at: r.closed_at ?? null,
    created_at: r.created_at,
  };
}

// ============================================================================
// Fixed deposits — member
// ============================================================================

export const listFixedDepositProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FixedDepositProduct[]> => {
    const { data, error } = await context.supabase
      .from("fixed_deposit_products")
      .select(
        "id, code, name, description, term_months, rate_annual, min_amount, max_amount, early_break_penalty_pct",
      )
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((p) => ({
      ...p,
      rate_annual: Number(p.rate_annual),
      min_amount: Number(p.min_amount),
      max_amount: p.max_amount === null ? null : Number(p.max_amount),
      early_break_penalty_pct: Number(p.early_break_penalty_pct),
    }));
  });

export const listMyFixedDeposits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FixedDeposit[]> => {
    const { data, error } = await context.supabase
      .from("fixed_deposits")
      .select("*, fixed_deposit_products(name)")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((r) => mapDeposit(r));
  });

export const openFixedDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        account_id: z.string().uuid(),
        product_id: z.string().uuid(),
        amount: z.number().positive().max(10_000_000),
        rollover: z.enum(["none", "principal", "principal_interest"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<FixedDeposit> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("open_fixed_deposit", {
      _account_id: data.account_id,
      _product_id: data.product_id,
      _amount: data.amount,
      _rollover: data.rollover,
      _actor_id: context.userId,
    } as never);
    if (error) throw new Error(error.message);
    const r = (Array.isArray(row) ? row[0] : row) as any;
    return mapDeposit(r);
  });

export const breakFixedDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), reason: z.string().trim().min(5).max(500) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<FixedDeposit> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("break_fixed_deposit", {
      _id: data.id,
      _reason: data.reason,
      _actor_id: context.userId,
    } as never);
    if (error) throw new Error(error.message);
    const r = (Array.isArray(row) ? row[0] : row) as any;
    await writeAudit({
      actor_id: context.userId,
      actor_role: "member",
      action: "fixed_deposit.broken",
      target: data.id,
      meta: {
        ref: r?.ref,
        principal: r?.principal,
        penalty: r?.penalty_amount,
        reason: data.reason,
      },
    });
    return mapDeposit(r);
  });

// ============================================================================
// Fixed deposits — admin
// ============================================================================

export const adminListFixedDeposits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        status: z.enum(["active", "matured", "redeemed", "broken", "all"]).default("active"),
        page: z.number().int().min(1).default(1),
        page_size: z.number().int().min(5).max(100).default(25),
      })
      .parse(d ?? {}),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ rows: FixedDeposit[]; total: number; principal_active: number }> => {
      await requireRoles(context, [...FINANCE_ROLES, "auditor"], "finance");
      const from = (data.page - 1) * data.page_size;
      let q = context.supabase
        .from("fixed_deposits")
        .select("*, fixed_deposit_products(name)", { count: "exact" })
        .order("maturity_date", { ascending: true })
        .range(from, from + data.page_size - 1);
      if (data.status !== "all") q = q.eq("status", data.status);
      const { data: rows, count, error } = await q;
      if (error) throw new Error(error.message);

      const profiles = await profileMap(
        context.supabase,
        ((rows ?? []) as any[]).map((r) => r.user_id),
      );
      const { data: activeRows } = await context.supabase
        .from("fixed_deposits")
        .select("principal")
        .eq("status", "active");

      return {
        rows: ((rows ?? []) as any[]).map((r) => mapDeposit(r, profiles.get(r.user_id))),
        total: count ?? 0,
        principal_active: ((activeRows ?? []) as any[]).reduce(
          (s, r) => s + Number(r.principal),
          0,
        ),
      };
    },
  );

export const adminRunMaturities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ processed: number }> => {
    const actorRole = await requireRoles(context, FINANCE_ROLES, "finance");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("mature_fixed_deposits" as never);
    if (error) throw new Error(error.message);
    const processed = Number(data ?? 0);
    await writeAudit({
      actor_id: context.userId,
      actor_role: actorRole,
      action: "fixed_deposit.maturity_run",
      target: "fixed_deposits",
      meta: { processed },
    });
    return { processed };
  });

// ============================================================================
// Savings holds (loan collateral)
// ============================================================================

function mapHold(
  r: any,
  profile?: { full_name: string | null; member_no: string | null } | null,
): SavingsHold {
  return {
    id: r.id,
    account_id: r.account_id,
    account_label: accountLabel(r.savings_accounts),
    user_id: r.user_id,
    member_name: profile?.full_name ?? null,
    member_no: profile?.member_no ?? null,
    amount: Number(r.amount),
    reason: r.reason,
    loan_id: r.loan_id ?? null,
    status: r.status,
    created_by_role: r.created_by_role ?? null,
    released_at: r.released_at ?? null,
    release_reason: r.release_reason ?? null,
    created_at: r.created_at,
  };
}

const HOLD_SELECT = "*, savings_accounts(nickname, savings_plans(name))";

export const listMyHolds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SavingsHold[]> => {
    const { data, error } = await context.supabase
      .from("savings_holds")
      .select(HOLD_SELECT)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((r) => mapHold(r));
  });

export const adminListHolds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        status: z.enum(["active", "released", "all"]).default("active"),
        page: z.number().int().min(1).default(1),
        page_size: z.number().int().min(5).max(100).default(25),
      })
      .parse(d ?? {}),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ rows: SavingsHold[]; total: number; held_total: number }> => {
      await requireRoles(context, [...HOLD_ROLES, "auditor"], "finance or loans");
      const from = (data.page - 1) * data.page_size;
      let q = context.supabase
        .from("savings_holds")
        .select(HOLD_SELECT, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, from + data.page_size - 1);
      if (data.status !== "all") q = q.eq("status", data.status);
      const { data: rows, count, error } = await q;
      if (error) throw new Error(error.message);

      const profiles = await profileMap(
        context.supabase,
        ((rows ?? []) as any[]).map((r) => r.user_id),
      );
      const { data: activeRows } = await context.supabase
        .from("savings_holds")
        .select("amount")
        .eq("status", "active");

      return {
        rows: ((rows ?? []) as any[]).map((r) => mapHold(r, profiles.get(r.user_id))),
        total: count ?? 0,
        held_total: ((activeRows ?? []) as any[]).reduce((s, r) => s + Number(r.amount), 0),
      };
    },
  );

export const adminSearchSavingsAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ q: z.string().trim().max(120).default("") }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requireRoles(context, HOLD_ROLES, "finance or loans");
    let userIds: string[] | null = null;
    if (data.q) {
      const term = data.q.replace(/[%,()]/g, "");
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id")
        .or(`full_name.ilike.%${term}%,member_no.ilike.%${term}%`)
        .limit(25);
      userIds = ((profs ?? []) as any[]).map((p) => p.id);
      if (userIds.length === 0) return [];
    }
    let q = context.supabase
      .from("savings_accounts")
      .select("id, user_id, balance, nickname, savings_plans(name)")
      .eq("status", "active")
      .limit(25);
    if (userIds) q = q.in("user_id", userIds);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const profiles = await profileMap(
      context.supabase,
      ((rows ?? []) as any[]).map((r) => r.user_id),
    );
    return ((rows ?? []) as any[]).map((r) => ({
      id: r.id as string,
      user_id: r.user_id as string,
      balance: Number(r.balance),
      label: accountLabel(r),
      member_name: profiles.get(r.user_id)?.full_name ?? null,
      member_no: profiles.get(r.user_id)?.member_no ?? null,
    }));
  });

export const placeSavingsHold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        account_id: z.string().uuid(),
        amount: z.number().positive().max(10_000_000),
        reason: z.string().trim().min(5).max(500),
        loan_id: z.string().uuid().nullable().default(null),
        step_up_token: z.string().min(16).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<SavingsHold> => {
    const actorRole = await requireRoles(context, HOLD_ROLES, "finance or loans");
    const { assertStepUp } = await import("@/lib/step-up.server");
    const proof = await assertStepUp(context.userId, data.step_up_token, "place a savings hold");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("place_savings_hold", {
      _account_id: data.account_id,
      _amount: data.amount,
      _reason: data.reason,
      _loan_id: data.loan_id,
      _actor_id: context.userId,
      _actor_role: actorRole,
    } as never);
    if (error) throw new Error(error.message);
    const r = (Array.isArray(row) ? row[0] : row) as any;
    await writeAudit({
      actor_id: context.userId,
      actor_role: actorRole,
      action: "savings_hold.placed",
      target: r?.id ?? data.account_id,
      meta: {
        account_id: data.account_id,
        amount: data.amount,
        reason: data.reason,
        loan_id: data.loan_id,
        step_up: { method: proof.method, session_id: proof.id },
      },
    });
    return mapHold(r);
  });

export const releaseSavingsHold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        reason: z.string().trim().min(5).max(500),
        step_up_token: z.string().min(16).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<SavingsHold> => {
    const actorRole = await requireRoles(context, HOLD_ROLES, "finance or loans");
    const { assertStepUp } = await import("@/lib/step-up.server");
    const proof = await assertStepUp(context.userId, data.step_up_token, "release a savings hold");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("release_savings_hold", {
      _id: data.id,
      _reason: data.reason,
      _actor_id: context.userId,
    } as never);
    if (error) throw new Error(error.message);
    const r = (Array.isArray(row) ? row[0] : row) as any;
    await writeAudit({
      actor_id: context.userId,
      actor_role: actorRole,
      action: "savings_hold.released",
      target: data.id,
      meta: {
        amount: r?.amount,
        reason: data.reason,
        step_up: { method: proof.method, session_id: proof.id },
      },
    });
    return mapHold(r);
  });

// ============================================================================
// Group / susu pots
// ============================================================================

export const listMyPots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GroupPot[]> => {
    const { data: memberships, error: mErr } = await context.supabase
      .from("group_pot_members")
      .select("pot_id")
      .eq("profile_id", context.userId)
      .eq("status", "active");
    if (mErr) throw new Error(mErr.message);
    const potIds = ((memberships ?? []) as any[]).map((m) => m.pot_id);
    if (potIds.length === 0) return [];

    const { data: pots, error } = await context.supabase
      .from("group_pots")
      .select("*, entities(name)")
      .in("id", potIds);
    if (error) throw new Error(error.message);

    const { data: counts } = await context.supabase
      .from("group_pot_members")
      .select("pot_id")
      .in("pot_id", potIds)
      .eq("status", "active");
    const { data: mine } = await context.supabase
      .from("group_pot_contributions")
      .select("pot_id, amount")
      .in("pot_id", potIds)
      .eq("profile_id", context.userId);

    return ((pots ?? []) as any[]).map((p) => ({
      id: p.id,
      entity_id: p.entity_id,
      entity_name: p.entities?.name ?? "Group",
      name: p.name,
      description: p.description ?? null,
      contribution_amount: Number(p.contribution_amount),
      frequency: p.frequency,
      balance: Number(p.balance),
      current_cycle: p.current_cycle,
      status: p.status,
      member_count: ((counts ?? []) as any[]).filter((c) => c.pot_id === p.id).length,
      my_contributed: ((mine ?? []) as any[])
        .filter((c) => c.pot_id === p.id)
        .reduce((s, c) => s + Number(c.amount), 0),
    }));
  });

export const getPotDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ pot_id: z.string().uuid() }).parse(d))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ contributions: PotContribution[]; payouts: PotPayout[] }> => {
      const [{ data: contribs, error: cErr }, { data: payouts, error: pErr }] = await Promise.all([
        context.supabase
          .from("group_pot_contributions")
          .select("*")
          .eq("pot_id", data.pot_id)
          .order("created_at", { ascending: false })
          .limit(100),
        context.supabase
          .from("group_pot_payouts")
          .select("*")
          .eq("pot_id", data.pot_id)
          .order("cycle", { ascending: true }),
      ]);
      if (cErr) throw new Error(cErr.message);
      if (pErr) throw new Error(pErr.message);

      const ids = [
        ...((contribs ?? []) as any[]).map((c) => c.profile_id),
        ...((payouts ?? []) as any[]).map((p) => p.profile_id),
      ];
      const profiles = await profileMap(context.supabase, ids);

      return {
        contributions: ((contribs ?? []) as any[]).map((c) => ({
          id: c.id,
          pot_id: c.pot_id,
          profile_id: c.profile_id,
          member_name: profiles.get(c.profile_id)?.full_name ?? null,
          cycle: c.cycle,
          amount: Number(c.amount),
          note: c.note ?? null,
          created_at: c.created_at,
        })),
        payouts: ((payouts ?? []) as any[]).map((p) => ({
          id: p.id,
          pot_id: p.pot_id,
          profile_id: p.profile_id,
          member_name: profiles.get(p.profile_id)?.full_name ?? null,
          cycle: p.cycle,
          amount: Number(p.amount),
          status: p.status,
          paid_at: p.paid_at ?? null,
          created_at: p.created_at,
        })),
      };
    },
  );

export const contributeToPot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        pot_id: z.string().uuid(),
        account_id: z.string().uuid(),
        amount: z.number().positive().max(10_000_000),
        note: z.string().trim().max(200).nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("contribute_to_pot", {
      _pot_id: data.pot_id,
      _account_id: data.account_id,
      _amount: data.amount,
      _note: data.note,
      _actor_id: context.userId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListPots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }): Promise<{ pots: GroupPot[]; payouts: PotPayout[]; pooled: number }> => {
      await requireRoles(context, [...FINANCE_ROLES, "auditor"], "finance");
      const { data: pots, error } = await context.supabase
        .from("group_pots")
        .select("*, entities(name)")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);

      const potIds = ((pots ?? []) as any[]).map((p) => p.id);
      const { data: counts } = potIds.length
        ? await context.supabase
            .from("group_pot_members")
            .select("pot_id")
            .in("pot_id", potIds)
            .eq("status", "active")
        : { data: [] as any[] };
      const { data: payouts } = potIds.length
        ? await context.supabase
            .from("group_pot_payouts")
            .select("*")
            .in("pot_id", potIds)
            .order("cycle", { ascending: true })
        : { data: [] as any[] };

      const profiles = await profileMap(
        context.supabase,
        ((payouts ?? []) as any[]).map((p) => p.profile_id),
      );
      const potNames = new Map(((pots ?? []) as any[]).map((p) => [p.id, p.name as string]));

      return {
        pots: ((pots ?? []) as any[]).map((p) => ({
          id: p.id,
          entity_id: p.entity_id,
          entity_name: p.entities?.name ?? "Group",
          name: p.name,
          description: p.description ?? null,
          contribution_amount: Number(p.contribution_amount),
          frequency: p.frequency,
          balance: Number(p.balance),
          current_cycle: p.current_cycle,
          status: p.status,
          member_count: ((counts ?? []) as any[]).filter((c) => c.pot_id === p.id).length,
          my_contributed: 0,
        })),
        payouts: ((payouts ?? []) as any[]).map((p) => ({
          id: p.id,
          pot_id: p.pot_id,
          pot_name: potNames.get(p.pot_id) ?? "Pot",
          profile_id: p.profile_id,
          member_name: profiles.get(p.profile_id)?.full_name ?? null,
          cycle: p.cycle,
          amount: Number(p.amount),
          status: p.status,
          paid_at: p.paid_at ?? null,
          created_at: p.created_at,
        })),
        pooled: ((pots ?? []) as any[]).reduce((s, p) => s + Number(p.balance), 0),
      };
    },
  );

export const adminPayPotPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ payout_id: z.string().uuid(), step_up_token: z.string().min(16).max(200) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const actorRole = await requireRoles(context, FINANCE_ROLES, "finance");
    const { assertStepUp } = await import("@/lib/step-up.server");
    const proof = await assertStepUp(
      context.userId,
      data.step_up_token,
      "release a group pot payout",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("pay_pot_payout", {
      _payout_id: data.payout_id,
      _actor_id: context.userId,
    } as never);
    if (error) throw new Error(error.message);
    const r = (Array.isArray(row) ? row[0] : row) as any;
    await writeAudit({
      actor_id: context.userId,
      actor_role: actorRole,
      action: "group_pot.payout_paid",
      target: data.payout_id,
      meta: {
        amount: r?.amount,
        cycle: r?.cycle,
        recipient: r?.profile_id,
        step_up: { method: proof.method, session_id: proof.id },
      },
    });
    return { ok: true };
  });

// ============================================================================
// Savings insights (member analytics)
// ============================================================================

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

export const getSavingsInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SavingsInsights> => {
    const since = new Date();
    since.setMonth(since.getMonth() - 11);
    since.setDate(1);

    const [{ data: accounts }, { data: txns }, { data: holds }, { data: pending }] =
      await Promise.all([
        context.supabase
          .from("savings_accounts")
          .select("id, balance, nickname, goal_amount, goal_target_date, savings_plans(name)")
          .eq("user_id", context.userId),
        context.supabase
          .from("transactions")
          .select("kind, amount, status, created_at")
          .eq("user_id", context.userId)
          .eq("status", "cleared")
          .gte("created_at", since.toISOString())
          .order("created_at"),
        context.supabase
          .from("savings_holds")
          .select("amount")
          .eq("user_id", context.userId)
          .eq("status", "active"),
        context.supabase
          .from("savings_withdrawal_requests")
          .select("amount")
          .eq("user_id", context.userId)
          .in("status", ["pending", "approved"]),
      ]);

    const accts = (accounts ?? []) as any[];
    const total_balance = accts.reduce((s, a) => s + Number(a.balance), 0);
    const total_held =
      ((holds ?? []) as any[]).reduce((s, h) => s + Number(h.amount), 0) +
      ((pending ?? []) as any[]).reduce((s, h) => s + Number(h.amount), 0);

    const buckets = new Map<string, { deposits: number; withdrawals: number }>();
    for (let i = 0; i < 12; i++) {
      const d = new Date(since);
      d.setMonth(since.getMonth() + i);
      buckets.set(d.toISOString().slice(0, 7), { deposits: 0, withdrawals: 0 });
    }

    let interest_earned = 0;
    for (const t of (txns ?? []) as any[]) {
      const key = monthKey(t.created_at);
      const bucket = buckets.get(key);
      const amt = Number(t.amount);
      if (t.kind === "interest") interest_earned += amt;
      if (!bucket) continue;
      if (t.kind === "deposit" || t.kind === "interest" || t.kind === "transfer_in")
        bucket.deposits += amt;
      else if (t.kind === "withdrawal" || t.kind === "transfer_out") bucket.withdrawals += amt;
    }

    const monthly = [...buckets.entries()].map(([month, v]) => ({
      month,
      deposits: Math.round(v.deposits * 100) / 100,
      withdrawals: Math.round(v.withdrawals * 100) / 100,
      net: Math.round((v.deposits - v.withdrawals) * 100) / 100,
    }));

    const deposits_12m = monthly.reduce((s, m) => s + m.deposits, 0);
    const withdrawals_12m = monthly.reduce((s, m) => s + m.withdrawals, 0);
    const months_contributed = monthly.filter((m) => m.deposits > 0).length;

    let streak = 0;
    for (let i = monthly.length - 1; i >= 0; i--) {
      if (monthly[i].deposits > 0) streak++;
      else break;
    }

    const avg_monthly_deposit = deposits_12m / 12;

    return {
      total_balance,
      total_held,
      available: Math.max(total_balance - total_held, 0),
      deposits_12m: Math.round(deposits_12m * 100) / 100,
      withdrawals_12m: Math.round(withdrawals_12m * 100) / 100,
      net_12m: Math.round((deposits_12m - withdrawals_12m) * 100) / 100,
      interest_earned: Math.round(interest_earned * 100) / 100,
      avg_monthly_deposit: Math.round(avg_monthly_deposit * 100) / 100,
      consistency_pct: Math.round((months_contributed / 12) * 100),
      months_contributed,
      streak_months: streak,
      projected_12m: Math.round((total_balance + (deposits_12m - withdrawals_12m)) * 100) / 100,
      monthly,
      goals: accts
        .filter((a) => a.goal_amount && Number(a.goal_amount) > 0)
        .map((a) => ({
          account: a.nickname || a.savings_plans?.name || "Savings account",
          goal: Number(a.goal_amount),
          balance: Number(a.balance),
          pct: Math.min(100, Math.round((Number(a.balance) / Number(a.goal_amount)) * 100)),
          target_date: a.goal_target_date ?? null,
        })),
    };
  });
