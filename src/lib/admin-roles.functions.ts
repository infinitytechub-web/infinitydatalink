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
      { _email: data.email, _note: data.note ?? null },
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

export function friendlyRoleError(raw: string): string {
  if (/last_super_admin/i.test(raw)) return "Cannot revoke the last Super Admin.";
  if (/cannot_revoke_self/i.test(raw)) return "You cannot revoke your own Super Admin role.";
  if (/user_not_found_or_unconfirmed/i.test(raw))
    return "No confirmed account exists for that email address.";
  if (/not_authenticated/i.test(raw)) return "You must sign in.";
  if (/forbidden/i.test(raw)) return "Super Admin role required.";
  return raw;
}
