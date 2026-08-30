import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit } from "@/lib/audit-log";

/**
 * Relationship types (next of kin / guarantor relationships).
 *
 * Readable by any signed-in user; only Super Admins may add, rename,
 * re-order or deactivate options.
 */

export type RelationshipType = {
  id: string;
  code: string;
  label: string;
  is_active: boolean;
  sort_order: number;
};

/** Fallback list mirrors the seeded rows so forms never render empty. */
export const DEFAULT_RELATIONSHIPS: { code: string; label: string }[] = [
  { code: "father", label: "Father" },
  { code: "mother", label: "Mother" },
  { code: "brother", label: "Brother" },
  { code: "sister", label: "Sister" },
  { code: "husband", label: "Husband" },
  { code: "wife", label: "Wife" },
  { code: "spouse", label: "Spouse" },
  { code: "son", label: "Son" },
  { code: "daughter", label: "Daughter" },
  { code: "guardian", label: "Guardian" },
  { code: "other", label: "Other" },
];

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: any) => r.role as string);
  if (!roles.includes("super_admin")) throw new Error("Forbidden: super_admin role required");
}

export const listRelationshipTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RelationshipType[]> => {
    const { data, error } = await context.supabase
      .from("relationship_types")
      .select("id, code, label, is_active, sort_order")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as RelationshipType[];
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9_]+$/, "Use lowercase letters, digits and underscores"),
  label: z.string().trim().min(2).max(60),
  sort_order: z.number().int().min(1).max(9999).default(500),
  is_active: z.boolean().default(true),
});

export const upsertRelationshipType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }): Promise<RelationshipType> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const payload = {
      code: data.code,
      label: data.label,
      sort_order: data.sort_order,
      is_active: data.is_active,
    };

    const query = data.id
      ? (supabaseAdmin as any).from("relationship_types").update(payload).eq("id", data.id)
      : (supabaseAdmin as any).from("relationship_types").insert(payload);

    const { data: row, error } = await query
      .select("id, code, label, is_active, sort_order")
      .single();
    if (error) {
      if (/duplicate key/i.test(error.message))
        throw new Error("That relationship code already exists.");
      throw new Error(error.message);
    }

    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: "super_admin",
      action: data.id ? "relationship_type.updated" : "relationship_type.created",
      target: row.id,
      meta: payload,
    });

    return row as RelationshipType;
  });

export const setRelationshipTypeActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("relationship_types")
      .update({ is_active: data.is_active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: "super_admin",
      action: data.is_active ? "relationship_type.activated" : "relationship_type.deactivated",
      target: data.id,
      meta: { is_active: data.is_active },
    });
    return { ok: true };
  });
