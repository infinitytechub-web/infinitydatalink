import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const ASSIGNABLE_ROLES = [
  "compliance_officer",
  "loan_officer",
  "finance_officer",
  "auditor",
] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];
export type AppRole = AssignableRole | "super_admin" | "member";

export const ROLE_PERMISSIONS: Record<AppRole, string[]> = {
  super_admin: [
    "Full system access",
    "Assign and revoke all roles (incl. super admin)",
    "Manage branding, settings, security centre",
    "View & export all audit logs",
  ],
  compliance_officer: [
    "Review KYC submissions",
    "Approve / reject member verification",
    "Read audit logs",
  ],
  loan_officer: [
    "Review loan applications",
    "Approve / reject / disburse loans",
    "View member savings & repayment history",
  ],
  finance_officer: [
    "Post income, expenses & balance adjustments",
    "Approve transfers",
    "Access financial reports & exports",
  ],
  auditor: [
    "Read-only access to all financial data",
    "View audit logs & exports",
    "No mutation permissions",
  ],
  member: [
    "Manage own savings, loans, transfers",
    "Update own profile & KYC documents",
    "No admin access",
  ],
};

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: any) => r.role as string);
  if (!roles.includes("super_admin")) {
    throw new Error("Forbidden: super_admin role required");
  }
}

export type UserWithRolesRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  member_no: string | null;
  roles: AppRole[];
  created_at: string;
};

export const listUsersWithRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        search: z.string().trim().max(200).optional().default(""),
        role: z.enum(["all", "super_admin", ...ASSIGNABLE_ROLES, "member"]).optional().default("all"),
        page: z.number().int().min(1).optional().default(1),
        pageSize: z.number().int().min(5).max(100).optional().default(25),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ rows: UserWithRolesRow[]; total: number }> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, member_no, created_at", { count: "exact" });

    if (data.search) {
      const s = `%${data.search}%`;
      q = q.or(`email.ilike.${s},full_name.ilike.${s},member_no.ilike.${s}`);
    }

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: profiles, count, error } = await q
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw new Error(error.message);

    const ids = (profiles ?? []).map((p: any) => p.id);
    let rolesByUser = new Map<string, AppRole[]>();
    if (ids.length) {
      const { data: rolesRows, error: rErr } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", ids);
      if (rErr) throw new Error(rErr.message);
      for (const r of rolesRows ?? []) {
        const list = rolesByUser.get(r.user_id) ?? [];
        list.push(r.role as AppRole);
        rolesByUser.set(r.user_id, list);
      }
    }

    let rows: UserWithRolesRow[] = (profiles ?? []).map((p: any) => ({
      user_id: p.id,
      email: p.email,
      full_name: p.full_name,
      member_no: p.member_no,
      created_at: p.created_at,
      roles: rolesByUser.get(p.id) ?? [],
    }));

    if (data.role !== "all") {
      rows = rows.filter((r) => r.roles.includes(data.role as AppRole));
    }

    return { rows, total: count ?? rows.length };
  });

export const assignRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        role: z.enum(ASSIGNABLE_ROLES),
        note: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("admin_assign_role", {
      _target_user: data.user_id,
      _role: data.role,
      _actor_id: context.userId,
      _note: data.note ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const revokeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        role: z.enum(ASSIGNABLE_ROLES),
        reason: z.string().trim().min(3, "Reason is required").max(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("admin_revoke_role", {
      _target_user: data.user_id,
      _role: data.role,
      _actor_id: context.userId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export type BulkRoleResult = {
  ok: string[];
  failed: { user_id: string; error: string }[];
};

export const bulkAssignRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        user_ids: z.array(z.string().uuid()).min(1).max(200),
        role: z.enum(ASSIGNABLE_ROLES),
        note: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<BulkRoleResult> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ok: string[] = [];
    const failed: { user_id: string; error: string }[] = [];
    for (const uid of data.user_ids) {
      const { error } = await supabaseAdmin.rpc("admin_assign_role", {
        _target_user: uid,
        _role: data.role,
        _actor_id: context.userId,
        _note: data.note ?? undefined,
      });
      if (error) failed.push({ user_id: uid, error: error.message });
      else ok.push(uid);
    }
    return { ok, failed };
  });

export const bulkRevokeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        user_ids: z.array(z.string().uuid()).min(1).max(200),
        role: z.enum(ASSIGNABLE_ROLES),
        reason: z.string().trim().min(3, "Reason is required").max(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<BulkRoleResult> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ok: string[] = [];
    const failed: { user_id: string; error: string }[] = [];
    for (const uid of data.user_ids) {
      const { error } = await supabaseAdmin.rpc("admin_revoke_role", {
        _target_user: uid,
        _role: data.role,
        _actor_id: context.userId,
        _reason: data.reason,
      });
      if (error) failed.push({ user_id: uid, error: error.message });
      else ok.push(uid);
    }
    return { ok, failed };
  });
