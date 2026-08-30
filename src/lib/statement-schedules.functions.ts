import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MEMBER_REPORT_DATASETS } from "@/lib/member-reports.shared";
import {
  STATEMENT_FREQUENCIES,
  type StatementRun,
  type StatementSchedule,
} from "@/lib/statement-schedules.shared";

export const listMyStatementSchedules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }): Promise<{ schedules: StatementSchedule[]; runs: StatementRun[] }> => {
      const sb = context.supabase as any;
      const [sched, runs] = await Promise.all([
        sb
          .from("statement_schedules")
          .select(
            "id, dataset, frequency, email, sms, active, next_run_at, last_run_at, last_status, last_error",
          )
          .eq("user_id", context.userId)
          .order("created_at", { ascending: true }),
        sb
          .from("statement_runs")
          .select(
            "id, schedule_id, period_start, period_end, row_count, channels, status, error, created_at",
          )
          .eq("user_id", context.userId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      if (sched.error) throw new Error(sched.error.message);
      if (runs.error) throw new Error(runs.error.message);
      return {
        schedules: (sched.data ?? []) as StatementSchedule[],
        runs: (runs.data ?? []) as StatementRun[],
      };
    },
  );

export const saveMyStatementSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        dataset: z.enum(MEMBER_REPORT_DATASETS),
        frequency: z.enum(STATEMENT_FREQUENCIES),
        email: z.boolean(),
        sms: z.boolean(),
        active: z.boolean().optional().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { nextRunAt } = await import("@/lib/statement-schedules.server");
    const sb = context.supabase as any;
    const payload = {
      user_id: context.userId,
      dataset: data.dataset,
      frequency: data.frequency,
      email: data.email,
      sms: data.sms,
      active: data.active,
      failure_count: 0,
      last_error: null,
      next_run_at: nextRunAt(data.frequency),
    };
    const { error } = data.id
      ? await sb
          .from("statement_schedules")
          .update(payload)
          .eq("id", data.id)
          .eq("user_id", context.userId)
      : await sb
          .from("statement_schedules")
          .upsert(payload, { onConflict: "user_id,dataset,frequency" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setMyStatementScheduleActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as any;
    const { error } = await sb
      .from("statement_schedules")
      .update({ active: data.active, failure_count: 0, last_error: null })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMyStatementSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as any;
    const { error } = await sb
      .from("statement_schedules")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Sends one schedule immediately so the member can verify delivery. */
export const sendMyStatementNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ status: string; rows: number; error?: string }> => {
    const sb = context.supabase as any;
    const { data: row, error } = await sb
      .from("statement_schedules")
      .select("id, user_id, dataset, frequency, email, sms, failure_count")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Schedule not found");

    const { deliverStatement } = await import("@/lib/statement-schedules.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await deliverStatement(supabaseAdmin as any, row as any);
    await sb
      .from("statement_schedules")
      .update({
        last_run_at: new Date().toISOString(),
        last_status: result.status,
        last_error: result.error ?? null,
      })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    return { status: result.status, rows: result.rows, error: result.error };
  });
