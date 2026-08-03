import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/permissions";
import { ACTIONS, MODULES } from "@/lib/permissions";

const EDITABLE_ROLES = [
  "admin",
  "manager",
  "compliance_officer",
  "loan_officer",
  "finance_officer",
  "auditor",
  "member",
] as const;

export type EditableRole = (typeof EDITABLE_ROLES)[number];

const CapabilitySchema = z
  .string()
  .refine((c) => {
    const [m, a] = c.split(".");
    return (
      (MODULES as readonly string[]).includes(m ?? "") &&
      (ACTIONS as readonly string[]).includes(a ?? "")
    );
  }, "Unknown capability");

export type RoleMatrixRow = { role: string; capabilities: string[] };

/** Reads the persisted permission matrix (all roles). */
export const getPermissionMatrix = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ rows: RoleMatrixRow[] }> => {
    await assertPermission(context.supabase, context.userId, "users", "view");
    const { data, error } = await context.supabase
      .from("role_permissions")
      .select("role, module, action");
    if (error) throw new Error(error.message);
    const byRole = new Map<string, string[]>();
    for (const r of (data ?? []) as Array<{ role: string; module: string; action: string }>) {
      const list = byRole.get(r.role) ?? [];
      list.push(`${r.module}.${r.action}`);
      byRole.set(r.role, list);
    }
    return {
      rows: [...byRole.entries()].map(([role, capabilities]) => ({
        role,
        capabilities: capabilities.sort(),
      })),
    };
  });

/** Replaces the whole capability set for one role. Backend-enforced via users.manage. */
export const saveRolePermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        role: z.enum(EDITABLE_ROLES),
        capabilities: z.array(CapabilitySchema).max(400),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ count: number }> => {
    await assertPermission(context.supabase, context.userId, "users", "manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const unique = [...new Set(data.capabilities)];
    const { data: count, error } = await (supabaseAdmin as any).rpc("admin_set_role_permissions", {
      _role: data.role,
      _capabilities: unique,
      _actor: context.userId,
    });
    if (error) throw new Error(error.message);
    return { count: (count as number) ?? unique.length };
  });

export { EDITABLE_ROLES };
