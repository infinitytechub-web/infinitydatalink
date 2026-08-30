import { writeAudit } from "@/lib/audit-log";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STAFF_ROLES = new Set(["super_admin", "compliance_officer", "auditor"]);
const REVIEW_ROLES = new Set(["super_admin", "compliance_officer"]);

const BUCKET = "entity-documents";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "application/pdf"]);

async function roles(supabase: any, userId: string): Promise<string[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: any) => r.role as string);
}
async function isStaff(supabase: any, userId: string): Promise<boolean> {
  const r = await roles(supabase, userId);
  return r.some((x) => STAFF_ROLES.has(x));
}
async function assertStaff(supabase: any, userId: string) {
  if (!(await isStaff(supabase, userId))) throw new Error("Forbidden: staff role required");
}
async function assertReviewer(supabase: any, userId: string) {
  const r = await roles(supabase, userId);
  if (!r.some((x) => REVIEW_ROLES.has(x))) throw new Error("Forbidden: reviewer role required");
}
async function assertEntityAccess(supabase: any, userId: string, entityId: string) {
  if (await isStaff(supabase, userId)) return;
  const { data } = await supabase
    .from("entity_memberships")
    .select("role")
    .eq("entity_id", entityId)
    .eq("profile_id", userId)
    .in("role", ["owner", "admin"])
    .maybeSingle();
  if (!data) throw new Error("Forbidden: not a manager of this entity");
}

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80);
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
        q: z.string().max(120).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(100).default(20),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ rows: EntityRow[]; total: number }> => {
    await assertStaff(context.supabase, context.userId);
    const pageSize = data.limit ?? data.pageSize;
    const from = (data.page - 1) * pageSize;
    const to = from + pageSize - 1;
    // Contact / tax / KYC-note columns are revoked from `authenticated` at the
    // column level, so staff reads run through the privileged client *after*
    // the role check above.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q: any = (supabaseAdmin as any)
      .from("entities")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });
    if (data.type) q = q.eq("type", data.type);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.q && data.q.trim()) {
      const term = data.q.trim().replace(/[%,]/g, "");
      q = q.or(`name.ilike.%${term}%,registration_no.ilike.%${term}%`);
    }
    q = q.range(from, to);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r: any) => r.id);
    if (ids.length === 0) return { rows: [], total: count ?? 0 };
    const { data: em } = await context.supabase
      .from("entity_memberships")
      .select("entity_id")
      .in("entity_id", ids);
    const counts = new Map<string, number>();
    for (const r of (em ?? []) as Array<{ entity_id: string }>)
      counts.set(r.entity_id, (counts.get(r.entity_id) ?? 0) + 1);
    return {
      rows: (rows as EntityRow[]).map((r) => ({ ...r, member_count: counts.get(r.id) ?? 0 })),
      total: count ?? rows!.length,
    };
  });

export const listInstitutions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Array<{ id: string; name: string }>> => {
    const { data, error } = await context.supabase
      .from("entities")
      .select("id,name")
      .eq("type", "institution")
      .in("status", ["pending", "active"])
      .order("name", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ id: string; name: string }>;
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
    const { data: entity, error } = await context.supabase
      .from("entities")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
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

export const lookupMemberByNumber = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ member_no: z.string().min(1).max(50) }).parse(d))
  .handler(async ({ data, context }): Promise<{ id: string; full_name: string | null; member_no: string | null } | null> => {
    await assertStaff(context.supabase, context.userId);
    const { data: p } = await context.supabase
      .from("profiles")
      .select("id, full_name, member_no")
      .eq("member_no", data.member_no)
      .maybeSingle();
    return (p as any) ?? null;
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
    const { data: row, error } = await (context.supabase as any).rpc("register_entity", {
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
    const args: Record<string, any> =
      data.action === "approve"
        ? { _entity_id: data.id, _note: data.note, _actor_id: context.userId }
        : { _entity_id: data.id, _reason: data.note, _actor_id: context.userId };
    const rpc = data.action === "approve" ? "approve_entity" : "suspend_entity";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).rpc(rpc, args);
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

/* -------------------------- Documents & timeline -------------------------- */

export type EntityDocumentRow = {
  id: string;
  entity_id: string;
  doc_type: string;
  storage_path: string;
  original_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
};

export const listEntityDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ entity_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<EntityDocumentRow[]> => {
    await assertEntityAccess(context.supabase, context.userId, data.entity_id);
    const { data: rows, error } = await context.supabase
      .from("entity_documents")
      .select("*")
      .eq("entity_id", data.entity_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as EntityDocumentRow[];
  });

export const uploadEntityDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        entity_id: z.string().uuid(),
        doc_type: z.enum(["registration_cert", "tax_cert", "mandate_letter", "id_document", "other"]),
        filename: z.string().min(1).max(160),
        mime_type: z.string().min(3).max(80),
        content_base64: z.string().min(4),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<EntityDocumentRow> => {
    await assertEntityAccess(context.supabase, context.userId, data.entity_id);
    if (!ALLOWED_MIMES.has(data.mime_type)) throw new Error("Only JPEG, PNG or PDF files are accepted.");
    // decode base64
    const b64 = data.content_base64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(b64, "base64");
    if (buffer.byteLength > MAX_UPLOAD_BYTES) throw new Error("File exceeds 10 MB limit.");
    const safe = sanitizeFilename(data.filename);
    const uniq = crypto.randomUUID();
    const storage_path = `${data.entity_id}/${uniq}-${safe}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await (supabaseAdmin as any).storage
      .from(BUCKET)
      .upload(storage_path, buffer, { contentType: data.mime_type, upsert: false });
    if (upErr) throw new Error(upErr.message);
    const { data: row, error } = await context.supabase
      .from("entity_documents")
      .insert({
        entity_id: data.entity_id,
        doc_type: data.doc_type,
        storage_path,
        original_name: data.filename,
        mime_type: data.mime_type,
        size_bytes: buffer.byteLength,
        uploaded_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: (await isStaff(context.supabase, context.userId)) ? "staff" : "member",
      action: "entity.document.uploaded",
      target: (row as any).id,
      meta: { entity_id: data.entity_id, doc_type: data.doc_type, size_bytes: buffer.byteLength },
    });
    return row as EntityDocumentRow;
  });

export const getEntityDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const { data: doc, error } = await context.supabase
      .from("entity_documents")
      .select("storage_path, entity_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("document_not_found");
    await assertEntityAccess(context.supabase, context.userId, (doc as any).entity_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: sErr } = await (supabaseAdmin as any).storage
      .from(BUCKET)
      .createSignedUrl((doc as any).storage_path, 300);
    if (sErr) throw new Error(sErr.message);
    return { url: signed.signedUrl };
  });

export type EntityTimelineEvent = {
  id: string;
  action: string;
  actor_email: string | null;
  actor_role: string | null;
  created_at: string;
  meta: any;
};

export const listEntityTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ entity_id: z.string().uuid(), limit: z.number().int().min(1).max(200).default(100) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<EntityTimelineEvent[]> => {
    await assertStaff(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("audit_log")
      .select("id, action, actor_email, actor_role, created_at, meta")
      .filter("meta->>entity_id", "eq", data.entity_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []) as EntityTimelineEvent[];
  });
