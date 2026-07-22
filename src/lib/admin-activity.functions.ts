import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ADMIN_ROLES = new Set([
  "super_admin",
  "compliance_officer",
  "loan_officer",
  "finance_officer",
  "auditor",
]);

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role as string);
  if (!roles.some((r: string) => ADMIN_ROLES.has(r))) {
    throw new Error("Forbidden: admin role required");
  }
}

export type ActivityEntry = {
  id: string;
  created_at: string;
  action: string;
  target: string | null;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  meta: Record<string, unknown> | null;
};

export type ActivityListResult = {
  rows: ActivityEntry[];
  total: number;
  page: number;
  pageSize: number;
  actions: string[];
};

export const listAdminActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        action: z.string().optional(),
        actor: z.string().optional(),
        target: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(500).default(50),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<ActivityListResult> => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    let q = supabase
      .from("audit_log")
      .select("id, created_at, action, target, actor_id, actor_email, actor_role, meta", {
        count: "exact",
      })
      .order("created_at", { ascending: false });

    if (data.action && data.action !== "all") q = q.eq("action", data.action);
    if (data.actor) q = q.ilike("actor_email", `%${data.actor}%`);
    if (data.target) q = q.ilike("target", `%${data.target}%`);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: rows, count, error } = await q.range(from, to);
    if (error) throw new Error(error.message);

    // Distinct actions for filter dropdown (bounded)
    const { data: allActions } = await supabase
      .from("audit_log")
      .select("action")
      .order("action", { ascending: true })
      .limit(1000);
    const actions = Array.from(new Set((allActions ?? []).map((r: any) => r.action as string)));

    return {
      rows: (rows ?? []) as ActivityEntry[],
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
      actions,
    };
  });
