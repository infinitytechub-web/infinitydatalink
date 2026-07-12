import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server functions for managing the Super Admin role.
 *
 * All mutations here are additionally guarded at the database layer:
 *   - The `guard_super_admin_role` trigger blocks any INSERT/DELETE of a
 *     `super_admin` row unless the caller already holds `super_admin` (or is
 *     the target user and their confirmed email is on the seed allow-list).
 *   - The `grant_super_admin_by_email` / `revoke_super_admin` /
 *     `list_super_admins` RPCs re-check `private.has_role(auth.uid(),'super_admin')`.
 *
 * The application-layer check in `assertSuperAdmin` gives a nicer error to
 * clients before we spend a round-trip on the RPC.
 */

async function assertSuperAdmin(supabase: any, userId: string) {
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

export type SuperAdminRow = {
  user_id: string;
  email: string;
  full_name: string | null;
  member_no: string | null;
  granted_at: string;
  granted_by: string | null;
  granted_by_email: string | null;
  seeded: boolean;
};

export const listSuperAdmins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SuperAdminRow[]> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.rpc("list_super_admins");
    if (error) throw new Error(error.message);
    return (data ?? []) as SuperAdminRow[];
  });

export const grantSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        email: z.string().trim().toLowerCase().email().max(320),
        note: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase.rpc(
      "grant_super_admin_by_email",
      { _email: data.email, _note: data.note ?? undefined },
    );
    if (error) throw new Error(friendlyRoleError(error.message));
    return (rows ?? [])[0] as { user_id: string; email: string; granted_at: string } | undefined;
  });

export const revokeSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        reason: z.string().trim().min(3, "Reason is required").max(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("revoke_super_admin", {
      _user_id: data.user_id,
      _reason: data.reason,
    });
    if (error) throw new Error(friendlyRoleError(error.message));
    return { ok: true as const };
  });

export type SeedEmailRow = {
  email: string;
  note: string | null;
  created_at: string;
};

export const listSeedEmails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SeedEmailRow[]> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("super_admin_seed_emails")
      .select("email, note, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as SeedEmailRow[];
  });

export type RoleHistoryRow = {
  id: string;
  occurred_at: string;
  event: "grant" | "revoke";
  actor_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  target_user_id: string;
  target_email: string | null;
  note: string | null;
  reason: string | null;
  meta: Record<string, string | number | boolean | null>;
  currently_super_admin: boolean;
};

export const listSuperAdminRoleHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        event: z.enum(["all", "grant", "revoke"]).default("all"),
        emailContains: z.string().trim().max(320).optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
        sortBy: z.enum(["occurred_at", "actor_email", "action"]).default("occurred_at"),
        sortDir: z.enum(["asc", "desc"]).default("desc"),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ rows: RoleHistoryRow[]; total: number }> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const actions =
      data.event === "grant"
        ? ["role.super_admin.grant"]
        : data.event === "revoke"
          ? ["role.super_admin.revoke"]
          : ["role.super_admin.grant", "role.super_admin.revoke"];

    const sortColumn =
      data.sortBy === "occurred_at"
        ? "created_at"
        : data.sortBy === "actor_email"
          ? "actor_email"
          : "action";

    let q = context.supabase
      .from("audit_log")
      .select("id, created_at, actor_id, actor_email, actor_role, action, target, meta", {
        count: "exact",
      })
      .in("action", actions)
      .order(sortColumn, { ascending: data.sortDir === "asc", nullsFirst: false })
      .range(data.offset, data.offset + data.limit - 1);

    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);

    const { data: entries, error, count } = await q;
    if (error) throw new Error(error.message);

    const rows = (entries ?? []) as Array<{
      id: string;
      created_at: string;
      actor_id: string | null;
      actor_email: string | null;
      actor_role: string | null;
      action: string;
      target: string | null;
      meta: Record<string, unknown> | null;
    }>;

    // Enrich with current super_admin status per target.
    const targetIds = Array.from(new Set(rows.map((r) => r.target).filter(Boolean))) as string[];
    let stillSA = new Set<string>();
    if (targetIds.length > 0) {
      const { data: cur } = await context.supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "super_admin")
        .in("user_id", targetIds);
      stillSA = new Set(((cur ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
    }

    let out: RoleHistoryRow[] = rows.map((r) => {
      const meta = (r.meta ?? {}) as Record<string, string | number | boolean | null>;
      const target_user_id = r.target ?? "";
      return {
        id: r.id,
        occurred_at: r.created_at,
        event: r.action === "role.super_admin.grant" ? "grant" : "revoke",
        actor_id: r.actor_id,
        actor_email: r.actor_email,
        actor_role: r.actor_role,
        target_user_id,
        target_email: (meta.email as string | undefined) ?? null,
        note: (meta.note as string | undefined) ?? null,
        reason: (meta.reason as string | undefined) ?? null,
        meta,
        currently_super_admin: target_user_id ? stillSA.has(target_user_id) : false,
      };
    });

    if (data.emailContains) {
      const q = data.emailContains.toLowerCase();
      out = out.filter((r) => (r.target_email ?? "").toLowerCase().includes(q));
    }

    return { rows: out, total: count ?? out.length };
  });

/**
 * Export up to 10,000 rows matching the given filters. Keeps the paginated
 * listing bounded (200) while still supporting bulk CSV downloads.
 */
export const exportSuperAdminRoleHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        event: z.enum(["all", "grant", "revoke"]).default("all"),
        emailContains: z.string().trim().max(320).optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        sortBy: z.enum(["occurred_at", "actor_email", "action"]).default("occurred_at"),
        sortDir: z.enum(["asc", "desc"]).default("desc"),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ rows: RoleHistoryRow[] }> => {
    let all: RoleHistoryRow[] = [];
    const pageSize = 200;
    for (let offset = 0; offset < 10_000; offset += pageSize) {
      const res = await listSuperAdminRoleHistory({
        data: { ...data, limit: pageSize, offset },
      });
      all = all.concat(res.rows);
      if (res.rows.length < pageSize) break;
    }
    return { rows: all };
  });

export type WhoAmI = { user_id: string; email: string | null; roles: string[] };

/** Small helper used by e2e tests to introspect the caller's role set. */
export const whoAmI = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WhoAmI> => {
    const { data: roleRows } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = ((roleRows ?? []) as Array<{ role: string }>).map((r) => r.role);
    return {
      user_id: context.userId,
      email: (context.claims?.email as string | undefined) ?? null,
      roles,
    };
  });

export function friendlyRoleError(raw: string): string {
  if (/last_super_admin/i.test(raw)) return "Cannot revoke the last Super Admin.";
  if (/cannot_revoke_self/i.test(raw)) return "You cannot revoke your own Super Admin role.";
  if (/user_not_found_or_unconfirmed/i.test(raw))
    return "No confirmed account exists for that email address.";
  if (/not_authenticated/i.test(raw)) return "You must sign in.";
  if (/forbidden/i.test(raw)) return "Super Admin role required.";
  return raw;
}
