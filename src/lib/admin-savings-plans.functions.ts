import { writeAudit } from "@/lib/audit-log";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdminPlan = {
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
  active_accounts: number;
  total_balance: number;
  created_at: string;
};

async function assertPlanAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = new Set((data ?? []).map((r: any) => r.role));
  if (!roles.has("super_admin") && !roles.has("finance_officer")) throw new Error("forbidden");
  return { roles: Array.from(roles) as string[] };
}

async function auditLog(supabase: any, userId: string, roles: string[], action: string, target: string, meta: Record<string, any>) {
  await writeAudit({
    actor_id: userId,
    actor_role: roles.includes("super_admin") ? "super_admin" : "finance_officer",
    action,
    target,
    meta,
  });
}

export const listPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminPlan[]> => {
    await assertPlanAdmin(context.supabase, context.userId);
    const [{ data: plans, error }, { data: accts, error: aErr }] = await Promise.all([
      context.supabase
        .from("savings_plans")
        .select("id, name, schedule, interest_rate, description, min_contribution, contribution_amount, lock_days, is_active, sort_order, created_at")
        .order("sort_order", { ascending: true }),
      context.supabase.from("savings_accounts").select("plan_id, balance, status"),
    ]);
    if (error) throw new Error(error.message);
    if (aErr) throw new Error(aErr.message);
    const per = new Map<string, { active: number; balance: number }>();
    for (const a of accts ?? []) {
      const rec = per.get(a.plan_id) ?? { active: 0, balance: 0 };
      if (a.status === "active") rec.active += 1;
      rec.balance += Number(a.balance ?? 0);
      per.set(a.plan_id, rec);
    }
    return (plans ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      schedule: p.schedule,
      interest_rate: Number(p.interest_rate ?? 0),
      description: p.description,
      min_contribution: Number(p.min_contribution ?? 0),
      contribution_amount: Number(p.contribution_amount ?? 0),
      lock_days: p.lock_days ?? 0,
      is_active: !!p.is_active,
      sort_order: p.sort_order ?? 0,
      active_accounts: per.get(p.id)?.active ?? 0,
      total_balance: per.get(p.id)?.balance ?? 0,
      created_at: p.created_at,
    }));
  });

const PlanSchema = z.object({
  name: z.string().trim().min(2).max(120),
  schedule: z.string().trim().min(2).max(60),
  interest_rate: z.number().min(0).max(100),
  description: z.string().max(1000).optional().nullable(),
  min_contribution: z.number().min(0).max(100_000_000),
  contribution_amount: z.number().min(0).max(100_000_000),
  lock_days: z.number().int().min(0).max(3650),
  is_active: z.boolean(),
  sort_order: z.number().int().min(0).max(9999),
});

export const createPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PlanSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { roles } = await assertPlanAdmin(context.supabase, context.userId);
    const { data: inserted, error } = await context.supabase
      .from("savings_plans")
      .insert({ ...data, description: data.description ?? null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await auditLog(context.supabase, context.userId, roles, "savings_plan.created", inserted!.id, { ...data });
    return { id: inserted!.id };
  });

const UpdateSchema = PlanSchema.partial().extend({
  id: z.string().uuid(),
  reason: z.string().max(500).optional().nullable(),
});

export const updatePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { roles } = await assertPlanAdmin(context.supabase, context.userId);
    const { id, reason, ...patch } = data;

    if (patch.is_active === false) {
      const { count } = await context.supabase
        .from("savings_accounts")
        .select("id", { count: "exact", head: true })
        .eq("plan_id", id)
        .eq("status", "active");
      if ((count ?? 0) > 0 && !reason?.trim()) {
        throw new Error("reason_required_deactivate_with_active_accounts");
      }
    }

    const { error } = await context.supabase.from("savings_plans").update(patch as never).eq("id", id);
    if (error) throw new Error(error.message);
    await auditLog(context.supabase, context.userId, roles, "savings_plan.updated", id, {
      changes: patch,
      reason: reason ?? null,
    });
    return { ok: true };
  });

export const reorderPlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ order: z.array(z.object({ id: z.string().uuid(), sort_order: z.number().int().min(0).max(9999) })).max(50) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { roles } = await assertPlanAdmin(context.supabase, context.userId);
    for (const o of data.order) {
      const { error } = await context.supabase.from("savings_plans").update({ sort_order: o.sort_order }).eq("id", o.id);
      if (error) throw new Error(error.message);
    }
    await auditLog(context.supabase, context.userId, roles, "savings_plan.reordered", "batch", {
      count: data.order.length,
    });
    return { ok: true };
  });
