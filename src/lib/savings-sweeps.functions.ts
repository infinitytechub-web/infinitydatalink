import { writeAudit } from "@/lib/audit-log";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Sweep = {
  id: string;
  from_account_id: string;
  from_label: string;
  to_account_id: string;
  to_label: string;
  amount: number;
  min_balance: number;
  max_amount: number | null;
  frequency: "daily" | "weekly" | "monthly";
  day_of_week: number | null;
  day_of_month: number | null;
  status: "active" | "paused";
  next_run_at: string;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_error: string | null;
  last_run_amount: number | null;
  runs_completed: number;
  note: string | null;
};

const RuleFields = {
  amount: z.number().positive().max(10_000_000),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  day_of_week: z.number().int().min(0).max(6).optional().nullable(),
  day_of_month: z.number().int().min(1).max(28).optional().nullable(),
  min_balance: z.number().min(0).max(10_000_000).default(0),
  max_amount: z.number().positive().max(10_000_000).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
};

const CreateSchema = z.object({
  from_account_id: z.string().uuid(),
  to_account_id: z.string().uuid(),
  ...RuleFields,
  start_at: z.string().datetime().optional().nullable(),
});

const UpdateSchema = z.object({ id: z.string().uuid(), ...RuleFields });


function firstRun(frequency: string, dow: number | null | undefined, dom: number | null | undefined, start?: string | null): string {
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

async function assertBothMine(supabase: any, userId: string, from: string, to: string) {
  if (from === to) throw new Error("same_account");
  const { data, error } = await supabase
    .from("savings_accounts")
    .select("id, user_id, status")
    .in("id", [from, to]);
  if (error) throw new Error(error.message);
  if ((data ?? []).length !== 2) throw new Error("account_not_found");
  for (const a of data as any[]) {
    if (a.user_id !== userId) throw new Error("account_not_owned");
    if (a.status !== "active") throw new Error("account_not_active");
  }
}

export const listMySweeps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Sweep[]> => {
    const { data, error } = await context.supabase
      .from("savings_sweeps")
      .select(
        "id, from_account_id, to_account_id, amount, min_balance, max_amount, frequency, day_of_week, day_of_month, status, next_run_at, last_run_at, last_run_status, last_run_error, last_run_amount, runs_completed, note",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = new Set<string>();
    (data ?? []).forEach((r: any) => {
      ids.add(r.from_account_id);
      ids.add(r.to_account_id);
    });
    let labelMap = new Map<string, string>();
    if (ids.size > 0) {
      const { data: accts } = await context.supabase
        .from("savings_accounts")
        .select("id, nickname, savings_plans(name)")
        .in("id", Array.from(ids));
      labelMap = new Map((accts ?? []).map((a: any) => [a.id, a.nickname || a.savings_plans?.name || "Savings"]));
    }

    return (data ?? []).map((r: any) => ({
      id: r.id,
      from_account_id: r.from_account_id,
      from_label: labelMap.get(r.from_account_id) ?? "Savings",
      to_account_id: r.to_account_id,
      to_label: labelMap.get(r.to_account_id) ?? "Savings",
      amount: Number(r.amount),
      min_balance: Number(r.min_balance ?? 0),
      max_amount: r.max_amount == null ? null : Number(r.max_amount),
      frequency: r.frequency,
      day_of_week: r.day_of_week,
      day_of_month: r.day_of_month,
      status: r.status,
      next_run_at: r.next_run_at,
      last_run_at: r.last_run_at,
      last_run_status: r.last_run_status,
      last_run_error: r.last_run_error,
      last_run_amount: r.last_run_amount == null ? null : Number(r.last_run_amount),
      runs_completed: r.runs_completed,
      note: r.note,
    }));
  });

export const createSweep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await assertBothMine(context.supabase, context.userId, data.from_account_id, data.to_account_id);
    const next = firstRun(data.frequency, data.day_of_week ?? null, data.day_of_month ?? null, data.start_at);
    const { data: inserted, error } = await context.supabase
      .from("savings_sweeps")
      .insert({
        user_id: context.userId,
        from_account_id: data.from_account_id,
        to_account_id: data.to_account_id,
        amount: data.amount,
        frequency: data.frequency,
        day_of_week: data.frequency === "weekly" ? data.day_of_week ?? 1 : null,
        day_of_month: data.frequency === "monthly" ? data.day_of_month ?? 1 : null,
        note: data.note ?? null,
        next_run_at: next,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted!.id };
  });

export const setSweepStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["active", "paused"]) }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("savings_sweeps")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSweep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("savings_sweeps")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Instant own-account transfer (auto-clears)
export const submitOwnAccountTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        from_account_id: z.string().uuid(),
        to_account_id: z.string().uuid(),
        amount: z.number().positive().max(10_000_000),
        note: z.string().max(500).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ transfer_id: string }> => {
    await assertBothMine(context.supabase, context.userId, data.from_account_id, data.to_account_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: t, error } = await supabaseAdmin.rpc("post_transfer", {
      _from: data.from_account_id,
      _to: data.to_account_id,
      _amount: data.amount,
      _channel: "own_account",
      _note: data.note ?? "Between my accounts",
      _actor_id: context.userId,
    });
    if (error) throw new Error(error.message);
    const transferId = (t as any)?.id;
    const { error: cErr } = await supabaseAdmin.rpc("clear_transfer", {
      _transfer_id: transferId,
      _actor_id: context.userId,
    });
    if (cErr) throw new Error(cErr.message);
    return { transfer_id: transferId };
  });

// Admin manual accrual (super_admin only)
export const adminRunMonthlyAccrual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ period_end: z.string().optional().nullable(), note: z.string().min(3).max(500) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ accounts: number; total_interest: number }> => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const set = new Set((roles ?? []).map((r: any) => r.role));
    if (!set.has("super_admin")) throw new Error("forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("accrue_monthly_interest", {
      _period_end: data.period_end ?? undefined,
    } as never);
    if (error) throw new Error(error.message);
    const rows = (result ?? []) as Array<{ interest: number }>;
    const total = rows.reduce((s, r) => s + Number(r.interest ?? 0), 0);

    await writeAudit({
      actor_id: context.userId,
      actor_role: "super_admin",
      action: "savings.interest_accrual.manual",
      target: data.period_end ?? "current",
      meta: { note: data.note, accounts: rows.length, total_interest: total },
    });

    return { accounts: rows.length, total_interest: total };
  });
