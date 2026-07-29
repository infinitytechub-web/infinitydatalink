import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit } from "@/lib/audit-log";

export type InterestSettings = {
  enabled: boolean;
  frequency: "monthly" | "quarterly" | "annually";
  basis: "closing_balance" | "average_balance" | "minimum_balance";
  rounding_dp: number;
  min_balance_to_earn: number;
  exclude_held_funds: boolean;
  rate_source: "plan" | "flat";
  flat_rate_annual: number;
  min_interest_to_post: number;
  updated_at: string;
};

export type InterestRun = {
  id: string;
  period_start: string;
  period_end: string;
  frequency: string;
  basis: string;
  rate_source: string;
  accounts_processed: number;
  accounts_credited: number;
  total_interest: number;
  dry_run: boolean;
  note: string | null;
  created_at: string;
};

export type InterestRunResult = {
  run_id: string;
  period_start: string;
  period_end: string;
  accounts_processed: number;
  accounts_credited: number;
  total_interest: number;
  dry_run: boolean;
};

const SettingsSchema = z.object({
  enabled: z.boolean(),
  frequency: z.enum(["monthly", "quarterly", "annually"]),
  basis: z.enum(["closing_balance", "average_balance", "minimum_balance"]),
  rounding_dp: z.number().int().min(0).max(4),
  min_balance_to_earn: z.number().min(0).max(100_000_000),
  exclude_held_funds: z.boolean(),
  rate_source: z.enum(["plan", "flat"]),
  flat_rate_annual: z.number().min(0).max(100),
  min_interest_to_post: z.number().min(0).max(1_000_000),
});

export const getInterestSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ settings: InterestSettings; runs: InterestRun[] }> => {
    const [settingsRes, runsRes] = await Promise.all([
      context.supabase.from("savings_interest_settings").select("*").eq("id", 1).maybeSingle(),
      context.supabase
        .from("savings_interest_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (settingsRes.error) throw new Error(settingsRes.error.message);
    if (!settingsRes.data) throw new Error("Interest settings not configured");
    const s: any = settingsRes.data;
    return {
      settings: {
        enabled: s.enabled,
        frequency: s.frequency,
        basis: s.basis,
        rounding_dp: Number(s.rounding_dp),
        min_balance_to_earn: Number(s.min_balance_to_earn),
        exclude_held_funds: s.exclude_held_funds,
        rate_source: s.rate_source,
        flat_rate_annual: Number(s.flat_rate_annual),
        min_interest_to_post: Number(s.min_interest_to_post),
        updated_at: s.updated_at,
      },
      runs: (runsRes.data ?? []).map((r: any) => ({
        ...r,
        total_interest: Number(r.total_interest ?? 0),
      })) as InterestRun[],
    };
  });

export const updateInterestSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SettingsSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("savings_interest_settings")
      .update({ ...data, updated_at: new Date().toISOString(), updated_by: context.userId })
      .eq("id", 1);
    if (error) throw new Error(error.message);

    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: "finance_officer",
      action: "savings.interest_settings.updated",
      target: "savings_interest_settings",
      meta: data,
    });
    return { ok: true };
  });

export const runInterestPosting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        period_end: z.string().trim().min(4).max(10).optional().nullable(),
        dry_run: z.boolean().default(false),
        note: z.string().trim().min(3).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<InterestRunResult> => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const set = new Set((roles ?? []).map((r: any) => r.role));
    if (!set.has("super_admin") && !set.has("finance_officer")) throw new Error("forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("post_savings_interest", {
      _period_end: data.period_end || undefined,
      _dry_run: data.dry_run,
      _actor: context.userId,
      _note: data.note,
    } as never);
    if (error) throw new Error(error.message);
    const row: any = Array.isArray(result) ? result[0] : result;
    const summary: InterestRunResult = {
      run_id: row?.run_id,
      period_start: row?.period_start,
      period_end: row?.period_end,
      accounts_processed: Number(row?.accounts_processed ?? 0),
      accounts_credited: Number(row?.accounts_credited ?? 0),
      total_interest: Number(row?.total_interest ?? 0),
      dry_run: Boolean(row?.dry_run),
    };

    if (!data.dry_run) {
      await writeAudit({
        actor_id: context.userId,
        actor_email: (context.claims as any)?.email ?? null,
        actor_role: set.has("super_admin") ? "super_admin" : "finance_officer",
        action: "savings.interest.posted",
        target: summary.run_id ?? "run",
        meta: { ...summary, note: data.note },
      });
    }
    return summary;
  });
