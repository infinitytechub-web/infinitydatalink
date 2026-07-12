import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STAFF_ROLES = new Set(["super_admin", "compliance_officer", "auditor"]);
const REVIEW_ROLES = new Set(["super_admin", "compliance_officer"]);

async function roles(supabase: any, userId: string): Promise<string[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: any) => r.role as string);
}
async function assertStaff(supabase: any, userId: string) {
  const r = await roles(supabase, userId);
  if (!r.some((x) => STAFF_ROLES.has(x))) throw new Error("Forbidden: staff role required");
}
async function assertReviewer(supabase: any, userId: string) {
  const r = await roles(supabase, userId);
  if (!r.some((x) => REVIEW_ROLES.has(x))) throw new Error("Forbidden: reviewer role required");
}

export type EntityType = "group" | "department" | "institution";
export type EntityStatus = "pending" | "active" | "suspended" | "closed";
export type EntityRole = "owner" | "admin" | "member";

export type EntityRow = {
  id: string;
  type: EntityType;
  name: string;
  registration_no: string | null;
  tax_id: string | null;
  parent_entity_id: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  region: string | null;
  address_line: string | null;
  digital_address: string | null;
  status: EntityStatus;
  kyc_notes: string | null;
  created_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  member_count?: number;
};

export const listEntities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        type: z.enum(["group", "department", "institution"]).optional(),
        status: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<EntityRow[]> => {
    await assertStaff(context.supabase, context.userId);
    let q = context.supabase.from("entities").select("*").order("created_at", { ascending: false }).limit(data.limit);
    if (data.type) q = q.eq("type", data.type);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    // add member counts
    const ids = (rows ?? []).map((r: any) => r.id);
    if (ids.length === 0) return [];
    const { data: em } = await context.supabase
      .from("entity_memberships")
      .select("entity_id")
      .in("entity_id", ids);
    const counts = new Map<string, number>();
    for (const r of (em ?? []) as Array<{ entity_id: string }>) counts.set(r.entity_id, (counts.get(r.entity_id) ?? 0) + 1);
    return (rows as EntityRow[]).map((r) => ({ ...r, member_count: counts.get(r.id) ?? 0 }));
  });

export type EntityMembership = {
  id: string;
  entity_id: string;
  profile_id: string;
  role: EntityRole;
  status: string;
  joined_at: string;
  member_name: string | null;
  member_no: string | null;
  email: string | null;
};

export const getEntity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ entity: EntityRow; members: EntityMembership[] }> => {
    await assertStaff(context.supabase, context.userId);
    const { data: entity, error } = await context.supabase.from("entities").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!entity) throw new Error("entity_not_found");
    const { data: em } = await context.supabase
      .from("entity_memberships")
      .select("id,entity_id,profile_id,role,status,joined_at,profiles!inner(full_name,member_no)")
      .eq("entity_id", data.id)
      .order("joined_at", { ascending: true });
    const members: EntityMembership[] = ((em ?? []) as any[]).map((r) => ({
      id: r.id,
      entity_id: r.entity_id,
      profile_id: r.profile_id,
      role: r.role,
      status: r.status,
      joined_at: r.joined_at,
      member_name: r.profiles?.full_name ?? null,
      member_no: r.profiles?.member_no ?? null,
      email: null,
    }));
    return { entity: entity as EntityRow, members };
  });

export const registerEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        type: z.enum(["group", "department", "institution"]),
        name: z.string().min(2).max(200),
        registration_no: z.string().max(100).nullable().optional(),
        tax_id: z.string().max(100).nullable().optional(),
        parent_entity_id: z.string().uuid().nullable().optional(),
        contact_email: z.string().email().nullable().optional(),
        contact_phone: z.string().max(50).nullable().optional(),
        region: z.string().max(100).nullable().optional(),
        address_line: z.string().max(300).nullable().optional(),
        digital_address: z.string().max(100).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: row, error } = await context.supabase.rpc("register_entity", {
      _type: data.type,
      _name: data.name,
      _registration_no: data.registration_no ?? null,
      _tax_id: data.tax_id ?? null,
      _parent_entity_id: data.parent_entity_id ?? null,
      _contact_email: data.contact_email ?? null,
      _contact_phone: data.contact_phone ?? null,
      _region: data.region ?? null,
      _address_line: data.address_line ?? null,
      _digital_address: data.digital_address ?? null,
    });
    if (error) throw new Error(error.message);
    const id = Array.isArray(row) ? (row[0] as any)?.id : (row as any)?.id;
    return { id };
  });

export const decideEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["approve", "suspend"]),
        note: z.string().min(3).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertReviewer(context.supabase, context.userId);
    const rpc = data.action === "approve" ? "approve_entity" : "suspend_entity";
    const argName = data.action === "approve" ? "_note" : "_reason";
    const { error } = await context.supabase.rpc(rpc, { _entity_id: data.id, [argName]: data.note });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addEntityMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        entity_id: z.string().uuid(),
        member_no: z.string().min(1).max(50),
        role: z.enum(["owner", "admin", "member"]).default("member"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // RLS on entity_memberships allows staff or entity managers to insert.
    const { data: profile, error: pErr } = await context.supabase
      .from("profiles")
      .select("id")
      .eq("member_no", data.member_no)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!profile) throw new Error("member_not_found");
    const { error } = await context.supabase.from("entity_memberships").insert({
      entity_id: data.entity_id,
      profile_id: (profile as any).id,
      role: data.role,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeEntityMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("entity_memberships").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
