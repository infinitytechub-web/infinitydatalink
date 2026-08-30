import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ReconRow = {
  account_id: string;
  nickname: string | null;
  plan_name: string | null;
  member_name: string | null;
  member_no: string | null;
  status: string;
  recorded_balance: number;
  computed_balance: number;
  delta: number;
  movements: number;
  pending_count: number;
  pending_amount: number;
  last_movement_at: string | null;
};

export type ReconReport = {
  generated_at: string;
  accounts_checked: number;
  discrepancies: number;
  total_recorded: number;
  total_computed: number;
  total_abs_delta: number;
  pending_total: number;
  rows: ReconRow[];
};

// Signed contribution of each cleared ledger kind to a savings account balance.
const SIGN: Record<string, number> = {
  deposit: 1,
  interest: 1,
  transfer_in: 1,
  loan_disbursement: 1,
  withdrawal: -1,
  transfer_out: -1,
  fee: -1,
  loan_repayment: -1,
  expense: -1,
};

async function assertFinanceOrAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = new Set((data ?? []).map((r: any) => r.role));
  if (!roles.has("super_admin") && !roles.has("finance_officer") && !roles.has("auditor")) {
    throw new Error("Forbidden: finance role required");
  }
}

export const adminReconcileSavings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        only_discrepancies: z.boolean().optional().default(true),
        tolerance: z.number().min(0).max(100).optional().default(0.005),
        limit: z.number().int().min(1).max(500).optional().default(200),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<ReconReport> => {
    await assertFinanceOrAdmin(context.supabase, context.userId);
    const sb = context.supabase;

    const [accountsRes, txnRes, adjRes, plansRes] = await Promise.all([
      sb.from("savings_accounts").select("id, user_id, plan_id, nickname, balance, status"),
      sb
        .from("transactions")
        .select("id, savings_account_id, kind, amount, status, created_at")
        .not("savings_account_id", "is", null),
      sb.from("balance_adjustments").select("txn_id, direction, amount"),
      sb.from("savings_plans").select("id, name"),
    ]);
    for (const r of [accountsRes, txnRes, adjRes, plansRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    const accounts = (accountsRes.data ?? []) as any[];
    const planName = new Map((plansRes.data ?? []).map((p: any) => [p.id, p.name as string]));
    const adjByTxn = new Map(
      (adjRes.data ?? []).map((a: any) => [a.txn_id, a.direction as string]),
    );

    const userIds = Array.from(new Set(accounts.map((a) => a.user_id)));
    const profiles = userIds.length
      ? await sb.from("profiles").select("id, full_name, member_no").in("id", userIds)
      : { data: [], error: null as any };
    if (profiles.error) throw new Error(profiles.error.message);
    const profileById = new Map((profiles.data ?? []).map((p: any) => [p.id, p]));

    type Agg = {
      computed: number;
      movements: number;
      pendingCount: number;
      pendingAmount: number;
      last: string | null;
    };
    const agg = new Map<string, Agg>();
    for (const t of (txnRes.data ?? []) as any[]) {
      const key = t.savings_account_id as string;
      const rec = agg.get(key) ?? {
        computed: 0,
        movements: 0,
        pendingCount: 0,
        pendingAmount: 0,
        last: null,
      };
      const amount = Number(t.amount ?? 0);
      if (t.status === "cleared") {
        let sign = SIGN[t.kind] ?? 0;
        if (t.kind === "adjustment") sign = adjByTxn.get(t.id) === "debit" ? -1 : 1;
        rec.computed += sign * amount;
        rec.movements += 1;
        if (!rec.last || t.created_at > rec.last) rec.last = t.created_at;
      } else if (t.status === "pending") {
        rec.pendingCount += 1;
        rec.pendingAmount += amount;
      }
      agg.set(key, rec);
    }

    const rows: ReconRow[] = [];
    let totalRecorded = 0;
    let totalComputed = 0;
    let totalAbs = 0;
    let pendingTotal = 0;
    let discrepancies = 0;

    for (const a of accounts) {
      const rec = agg.get(a.id) ?? {
        computed: 0,
        movements: 0,
        pendingCount: 0,
        pendingAmount: 0,
        last: null,
      };
      const recorded = Number(a.balance ?? 0);
      const computed = Math.round(rec.computed * 100) / 100;
      const delta = Math.round((recorded - computed) * 100) / 100;
      const prof = profileById.get(a.user_id);
      totalRecorded += recorded;
      totalComputed += computed;
      pendingTotal += rec.pendingAmount;
      const flagged = Math.abs(delta) > data.tolerance;
      if (flagged) {
        discrepancies += 1;
        totalAbs += Math.abs(delta);
      }
      if (!data.only_discrepancies || flagged) {
        rows.push({
          account_id: a.id,
          nickname: a.nickname ?? null,
          plan_name: planName.get(a.plan_id) ?? null,
          member_name: prof?.full_name ?? null,
          member_no: prof?.member_no ?? null,
          status: a.status,
          recorded_balance: recorded,
          computed_balance: computed,
          delta,
          movements: rec.movements,
          pending_count: rec.pendingCount,
          pending_amount: Math.round(rec.pendingAmount * 100) / 100,
          last_movement_at: rec.last,
        });
      }
    }

    rows.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

    return {
      generated_at: new Date().toISOString(),
      accounts_checked: accounts.length,
      discrepancies,
      total_recorded: Math.round(totalRecorded * 100) / 100,
      total_computed: Math.round(totalComputed * 100) / 100,
      total_abs_delta: Math.round(totalAbs * 100) / 100,
      pending_total: Math.round(pendingTotal * 100) / 100,
      rows: rows.slice(0, data.limit),
    };
  });
