import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertAnyRole,
  FINANCE_ROLES,
  loadRoleSet,
  type Role,
} from "@/lib/role-guards";

export type AdminRecurringStatus = "active" | "paused";
export type AdminRecurringRow = {
  id: string;
  user_id: string;
  account_id: string;
  member_name: string | null;
  member_email: string | null;
  member_no: string | null;
  account_label: string;
  amount: number;
  channel: string;
  note: string | null;
  frequency: "daily" | "weekly" | "monthly";
  day_of_week: number | null;
  day_of_month: number | null;
  status: AdminRecurringStatus;
  next_run_at: string;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_error: string | null;
  runs_completed: number;
  created_at: string;
};

export type AdminRecurringList = {
  rows: AdminRecurringRow[];
  total: number;
  failed_count: number;
  active_count: number;
  paused_count: number;
};

const FilterSchema = z.object({
  status: z.enum(["all", "active", "paused", "failed"]).default("all"),
  search: z.string().trim().max(120).optional().nullable(),
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(5).max(100).default(25),
});

function pickActorRole(roles: ReadonlySet<Role>): string {
  if (roles.has("super_admin")) return "super_admin";
  if (roles.has("finance_officer")) return "finance_officer";
  return "super_admin";
}

export const adminListRecurring = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FilterSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<AdminRecurringList> => {
    const roles = await loadRoleSet(context.supabase, context.userId);
    assertAnyRole(roles, FINANCE_ROLES, "finance");

    const from = (data.page - 1) * data.page_size;
    const to = from + data.page_size - 1;

    let q = context.supabase
      .from("savings_recurring_contributions")
      .select(
        "id, user_id, account_id, amount, channel, note, frequency, day_of_week, day_of_month, status, next_run_at, last_run_at, last_run_status, last_run_error, runs_completed, created_at, savings_accounts!inner(nickname, savings_plans(name))",
        { count: "exact" },
      );

    if (data.status === "active" || data.status === "paused") {
      q = q.eq("status", data.status);
    } else if (data.status === "failed") {
      q = q.eq("last_run_status", "failed");
    }

    q = q.order("next_run_at", { ascending: true }).range(from, to);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);

    const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.user_id as string)));
    const profileMap = new Map<string, { full_name: string | null; email: string | null; member_no: string | null }>();
    if (userIds.length > 0) {
      const { data: profs, error: perr } = await context.supabase
        .from("profiles")
        .select("id, full_name, email, member_no")
        .in("id", userIds);
      if (perr) throw new Error(perr.message);
      for (const p of (profs ?? []) as any[]) {
        profileMap.set(p.id, {
          full_name: p.full_name ?? null,
          email: p.email ?? null,
          member_no: p.member_no ?? null,
        });
      }
    }

    const mapped: AdminRecurringRow[] = (rows ?? []).map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      account_id: r.account_id,
      member_name: profileMap.get(r.user_id)?.full_name ?? null,
      member_email: profileMap.get(r.user_id)?.email ?? null,
      member_no: profileMap.get(r.user_id)?.member_no ?? null,
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
      created_at: r.created_at,
    }));

    const filtered = data.search
      ? mapped.filter((r) => {
          const s = data.search!.toLowerCase();
          return (
            (r.member_name ?? "").toLowerCase().includes(s) ||
            (r.member_email ?? "").toLowerCase().includes(s) ||
            (r.member_no ?? "").toLowerCase().includes(s) ||
            r.account_label.toLowerCase().includes(s)
          );
        })
      : mapped;

    // Summary counts across the whole table (ignoring pagination + search)
    const [{ count: failedCount }, { count: activeCount }, { count: pausedCount }] =
      await Promise.all([
        context.supabase
          .from("savings_recurring_contributions")
          .select("id", { count: "exact", head: true })
          .eq("last_run_status", "failed"),
        context.supabase
          .from("savings_recurring_contributions")
          .select("id", { count: "exact", head: true })
          .eq("status", "active"),
        context.supabase
          .from("savings_recurring_contributions")
          .select("id", { count: "exact", head: true })
          .eq("status", "paused"),
      ]);

    return {
      rows: filtered,
      total: count ?? filtered.length,
      failed_count: failedCount ?? 0,
      active_count: activeCount ?? 0,
      paused_count: pausedCount ?? 0,
    };
  });

export const adminRetryRecurring = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), note: z.string().trim().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; next_run_at: string }> => {
    const roles = await loadRoleSet(context.supabase, context.userId);
    assertAnyRole(roles, FINANCE_ROLES, "finance");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sched, error: serr } = await supabaseAdmin
      .from("savings_recurring_contributions")
      .select("id, user_id, amount, last_run_status")
      .eq("id", data.id)
      .maybeSingle();
    if (serr) throw new Error(serr.message);
    if (!sched) throw new Error("Schedule not found");

    const nextRunAt = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("savings_recurring_contributions")
      .update({
        status: "active",
        next_run_at: nextRunAt,
        last_run_error: null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: pickActorRole(roles),
      action: "recurring.retry",
      target: data.id,
      meta: {
        user_id: sched.user_id,
        amount: Number(sched.amount),
        previous_status: sched.last_run_status,
        note: data.note ?? null,
      },
    });

    return { ok: true, next_run_at: nextRunAt };
  });

export const adminCancelRecurring = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), note: z.string().trim().max(500) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const roles = await loadRoleSet(context.supabase, context.userId);
    assertAnyRole(roles, FINANCE_ROLES, "finance");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sched, error: serr } = await supabaseAdmin
      .from("savings_recurring_contributions")
      .select("id, user_id, amount, frequency, account_id")
      .eq("id", data.id)
      .maybeSingle();
    if (serr) throw new Error(serr.message);
    if (!sched) throw new Error("Schedule not found");

    const { error } = await supabaseAdmin
      .from("savings_recurring_contributions")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: pickActorRole(roles),
      action: "recurring.cancelled",
      target: data.id,
      meta: {
        user_id: sched.user_id,
        account_id: sched.account_id,
        amount: Number(sched.amount),
        frequency: sched.frequency,
        note: data.note,
      },
    });

    return { ok: true };
  });
