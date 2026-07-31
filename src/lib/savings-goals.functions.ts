import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SetGoalSchema = z.object({
  account_id: z.string().uuid(),
  goal_amount: z.number().positive().max(100_000_000),
  goal_target_date: z.string().optional().nullable(),
});

export type GoalProgress = {
  account_id: string;
  balance: number;
  goal_amount: number | null;
  goal_target_date: string | null;
  goal_started_at: string | null;
  goal_completed_at: string | null;
  progress_pct: number;
  last_milestone_pct: number;
  projected_completion: string | null;
  monthly_avg_contribution: number;
  on_track: boolean | null;
};

export const setGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetGoalSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("savings_accounts")
      .update({
        goal_amount: data.goal_amount,
        goal_target_date: data.goal_target_date ?? null,
        goal_started_at: new Date().toISOString(),
        goal_completed_at: null,
        last_milestone_pct: 0,
      })
      .eq("id", data.account_id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ account_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("savings_accounts")
      .update({
        goal_amount: null,
        goal_target_date: null,
        goal_started_at: null,
        goal_completed_at: null,
        last_milestone_pct: 0,
      })
      .eq("id", data.account_id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getGoalProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ account_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<GoalProgress> => {
    const { data: acct, error } = await context.supabase
      .from("savings_accounts")
      .select("id, balance, goal_amount, goal_target_date, goal_started_at, goal_completed_at, last_milestone_pct")
      .eq("id", data.account_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!acct) throw new Error("account_not_found");

    const balance = Number(acct.balance ?? 0);
    const goal = acct.goal_amount == null ? null : Number(acct.goal_amount);
    const progress_pct = goal && goal > 0 ? Math.min(100, Math.round((balance / goal) * 100)) : 0;

    // Compute monthly avg contribution from last 90 days of cleared deposits
    const since = new Date(Date.now() - 90 * 86400_000).toISOString();
    const { data: txns } = await context.supabase
      .from("transactions")
      .select("amount, kind, status, created_at")
      .eq("savings_account_id", data.account_id)
      .in("kind", ["deposit", "transfer_in", "interest"])
      .eq("status", "cleared")
      .gte("created_at", since);
    const total = (txns ?? []).reduce((s: number, t: any) => s + Number(t.amount ?? 0), 0);
    const monthly = total / 3;

    let projected: string | null = null;
    let on_track: boolean | null = null;
    if (goal && goal > balance && monthly > 0) {
      const months = (goal - balance) / monthly;
      const d = new Date();
      d.setMonth(d.getMonth() + Math.ceil(months));
      projected = d.toISOString();
      if (acct.goal_target_date) {
        on_track = new Date(projected) <= new Date(acct.goal_target_date);
      }
    } else if (goal && balance >= goal) {
      on_track = true;
    }

    return {
      account_id: acct.id,
      balance,
      goal_amount: goal,
      goal_target_date: acct.goal_target_date,
      goal_started_at: acct.goal_started_at,
      goal_completed_at: acct.goal_completed_at,
      progress_pct,
      last_milestone_pct: acct.last_milestone_pct ?? 0,
      projected_completion: projected,
      monthly_avg_contribution: Math.round(monthly * 100) / 100,
      on_track,
    };
  });

export type GoalContribution = {
  id: string;
  ref: string | null;
  kind: string;
  amount: number;
  created_at: string;
};

export type GoalRow = {
  account_id: string;
  label: string;
  balance: number;
  goal_amount: number;
  goal_target_date: string | null;
  goal_started_at: string | null;
  goal_completed_at: string | null;
  progress_pct: number;
  remaining: number;
  days_left: number | null;
  required_monthly: number | null;
  /** Cleared deposits / transfers-in / interest credited since the goal started. */
  contributed_since_start: number;
  contributions_count: number;
  last_contribution_at: string | null;
  recent_contributions: GoalContribution[];
};

const CONTRIBUTION_KINDS = ["deposit", "transfer_in", "interest"] as const;

export const listMyGoals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      rows: GoalRow[];
      total_saved: number;
      total_target: number;
      total_contributed: number;
      synced_at: string;
    }> => {
      const { data, error } = await context.supabase
        .from("savings_accounts")
        .select(
          "id, balance, nickname, goal_amount, goal_target_date, goal_started_at, goal_completed_at, savings_plans(name)",
        )
        .eq("user_id", context.userId)
        .not("goal_amount", "is", null);
      if (error) throw new Error(error.message);

      const accounts = data ?? [];
      const accountIds = accounts.map((a: any) => a.id);

      // Link goal progress to the member's own cleared contribution transactions.
      const byAccount = new Map<string, GoalContribution[]>();
      if (accountIds.length > 0) {
        const earliest = accounts.reduce<string | null>((min, a: any) => {
          const s = a.goal_started_at as string | null;
          if (!s) return min;
          return !min || s < min ? s : min;
        }, null);
        let q = context.supabase
          .from("transactions")
          .select("id, ref, kind, amount, created_at, savings_account_id")
          .eq("user_id", context.userId)
          .in("savings_account_id", accountIds)
          .in("kind", [...CONTRIBUTION_KINDS])
          .eq("status", "cleared")
          .order("created_at", { ascending: false })
          .limit(500);
        if (earliest) q = q.gte("created_at", earliest);
        const { data: txns, error: tErr } = await q;
        if (tErr) throw new Error(tErr.message);
        for (const t of txns ?? []) {
          const list = byAccount.get(t.savings_account_id as string) ?? [];
          list.push({
            id: t.id as string,
            ref: (t.ref as string | null) ?? null,
            kind: t.kind as string,
            amount: Number(t.amount ?? 0),
            created_at: t.created_at as string,
          });
          byAccount.set(t.savings_account_id as string, list);
        }
      }

      const rows: GoalRow[] = accounts.map((a: any) => {
        const balance = Number(a.balance ?? 0);
        const goal = Number(a.goal_amount ?? 0);
        const remaining = Math.max(0, goal - balance);
        let days_left: number | null = null;
        let required_monthly: number | null = null;
        if (a.goal_target_date) {
          days_left = Math.ceil((new Date(a.goal_target_date).getTime() - Date.now()) / 86400_000);
          const months = Math.max(1, days_left / 30);
          required_monthly = remaining > 0 ? Math.round((remaining / months) * 100) / 100 : 0;
        }
        const all = byAccount.get(a.id) ?? [];
        const since = a.goal_started_at ? new Date(a.goal_started_at).getTime() : null;
        const linked = since == null ? all : all.filter((c) => new Date(c.created_at).getTime() >= since);
        const contributed = linked.reduce((s, c) => s + c.amount, 0);
        return {
          account_id: a.id,
          label: a.nickname || a.savings_plans?.name || "Savings account",
          balance,
          goal_amount: goal,
          goal_target_date: a.goal_target_date,
          goal_started_at: a.goal_started_at,
          goal_completed_at: a.goal_completed_at,
          progress_pct: goal > 0 ? Math.min(100, Math.round((balance / goal) * 100)) : 0,
          remaining,
          days_left,
          required_monthly,
          contributed_since_start: Math.round(contributed * 100) / 100,
          contributions_count: linked.length,
          last_contribution_at: linked[0]?.created_at ?? null,
          recent_contributions: linked.slice(0, 5),
        };
      });
      rows.sort((x, y) => y.progress_pct - x.progress_pct);
      return {
        rows,
        total_saved: rows.reduce((s, r) => s + Math.min(r.balance, r.goal_amount), 0),
        total_target: rows.reduce((s, r) => s + r.goal_amount, 0),
        total_contributed: rows.reduce((s, r) => s + r.contributed_since_start, 0),
        synced_at: new Date().toISOString(),
      };
    },
  );

