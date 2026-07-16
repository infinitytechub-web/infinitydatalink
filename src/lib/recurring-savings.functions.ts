import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RecurringFrequency = "daily" | "weekly" | "monthly";
export type RecurringStatus = "active" | "paused";

export type RecurringSchedule = {
  id: string;
  account_id: string;
  account_label: string;
  amount: number;
  channel: string;
  note: string | null;
  frequency: RecurringFrequency;
  day_of_week: number | null;
  day_of_month: number | null;
  status: RecurringStatus;
  next_run_at: string;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_error: string | null;
  runs_completed: number;
};

const InputSchema = z.object({
  account_id: z.string().uuid(),
  amount: z.number().positive().max(10_000_000),
  channel: z.string().min(2).max(60).default("mobile_money"),
  note: z.string().max(500).optional().nullable(),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  day_of_week: z.number().int().min(0).max(6).optional().nullable(),
  day_of_month: z.number().int().min(1).max(28).optional().nullable(),
  start_at: z.string().datetime().optional().nullable(),
});

function firstRun(
  frequency: RecurringFrequency,
  dow: number | null | undefined,
  dom: number | null | undefined,
  start?: string | null,
): string {
  const base = start ? new Date(start) : new Date(Date.now() + 60_000);
  const d = new Date(base);
  if (frequency === "weekly" && (dow ?? -1) >= 0) {
    const delta = (dow! - d.getUTCDay() + 7) % 7;
    d.setUTCDate(d.getUTCDate() + (delta === 0 ? 7 : delta));
  } else if (frequency === "monthly" && dom) {
    const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), Math.min(dom, 28), d.getUTCHours(), d.getUTCMinutes()));
    if (target <= base) target.setUTCMonth(target.getUTCMonth() + 1);
    return target.toISOString();
  }
  return d.toISOString();
}

export const listMyRecurring = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RecurringSchedule[]> => {
    const { data, error } = await context.supabase
      .from("savings_recurring_contributions")
      .select(
        "id, account_id, amount, channel, note, frequency, day_of_week, day_of_month, status, next_run_at, last_run_at, last_run_status, last_run_error, runs_completed, savings_accounts!inner(nickname, savings_plans(name))",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      account_id: r.account_id,
      account_label:
        r.savings_accounts?.nickname ||
        r.savings_accounts?.savings_plans?.name ||
        "Savings account",
      amount: Number(r.amount),
      channel: r.channel,
      note: r.note,
      frequency: r.frequency,
      day_of_week: r.day_of_week,
      day_of_month: r.day_of_month,
      status: r.status,
      next_run_at: r.next_run_at,
      last_run_at: r.last_run_at,
      last_run_status: r.last_run_status,
      last_run_error: r.last_run_error,
      runs_completed: r.runs_completed,
    }));
  });

export const createRecurring = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    // verify account ownership
    const { data: acct, error: aerr } = await context.supabase
      .from("savings_accounts")
      .select("id, user_id, status")
      .eq("id", data.account_id)
      .maybeSingle();
    if (aerr) throw new Error(aerr.message);
    if (!acct || acct.user_id !== context.userId) throw new Error("account_not_found");
    if (acct.status !== "active") throw new Error("account_not_active");

    const next = firstRun(data.frequency, data.day_of_week ?? null, data.day_of_month ?? null, data.start_at);
    const { data: inserted, error } = await context.supabase
      .from("savings_recurring_contributions")
      .insert({
        user_id: context.userId,
        account_id: data.account_id,
        amount: data.amount,
        channel: data.channel,
        note: data.note ?? null,
        frequency: data.frequency,
        day_of_week: data.frequency === "weekly" ? data.day_of_week ?? 1 : null,
        day_of_month: data.frequency === "monthly" ? data.day_of_month ?? 1 : null,
        next_run_at: next,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted!.id };
  });

const UpdateSchema = InputSchema.partial().extend({ id: z.string().uuid() });

export const updateRecurring = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const patch: Record<string, any> = {};
    if (data.amount !== undefined) patch.amount = data.amount;
    if (data.channel !== undefined) patch.channel = data.channel;
    if (data.note !== undefined) patch.note = data.note;
    if (data.frequency !== undefined) {
      patch.frequency = data.frequency;
      patch.day_of_week = data.frequency === "weekly" ? data.day_of_week ?? 1 : null;
      patch.day_of_month = data.frequency === "monthly" ? data.day_of_month ?? 1 : null;
      patch.next_run_at = firstRun(
        data.frequency,
        data.day_of_week ?? null,
        data.day_of_month ?? null,
        data.start_at,
      );
    } else {
      if (data.day_of_week !== undefined) patch.day_of_week = data.day_of_week;
      if (data.day_of_month !== undefined) patch.day_of_month = data.day_of_month;
    }
    const { error } = await context.supabase
      .from("savings_recurring_contributions")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setRecurringStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["active", "paused"]) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("savings_recurring_contributions")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteRecurring = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("savings_recurring_contributions")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
