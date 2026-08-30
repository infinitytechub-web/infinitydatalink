import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit } from "@/lib/audit-log";

/**
 * Super Admin document management.
 *
 * Consolidated register of every stored document (member KYC uploads and
 * entity documents) with view / download / print (signed URL), metadata edit
 * and delete. Every action is restricted to `super_admin` at the application
 * layer and executed with the privileged client only after that check.
 */

export type DocSource = "kyc" | "entity";

export type ManagedDocument = {
  id: string;
  source: DocSource;
  bucket: string;
  storage_path: string;
  filename: string;
  doc_type: string;
  mime_type: string;
  size_bytes: number;
  status: string | null;
  review_notes: string | null;
  owner_id: string | null;
  owner_label: string;
  created_at: string;
};

const KYC_BUCKET = "kyc-documents";
const ENTITY_BUCKET = "entity-documents";

export const DOC_FORMATS = {
  "application/pdf": "PDF",
  "text/csv": "CSV",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.ms-excel": "XLS",
  "image/jpeg": "JPEG",
  "image/png": "PNG",
} as const;

export function formatLabel(mime: string): string {
  return (
    (DOC_FORMATS as Record<string, string>)[mime] ?? mime.split("/").pop()?.toUpperCase() ?? "FILE"
  );
}

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: any) => r.role as string);
  if (!roles.includes("super_admin")) throw new Error("Forbidden: super_admin role required");
}

function baseName(path: string) {
  return path.split("/").pop() ?? path;
}

const listSchema = z.object({
  source: z.enum(["all", "kyc", "entity"]).default("all"),
  search: z.string().trim().max(120).optional(),
  format: z.string().trim().max(120).optional(),
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(5).max(100).default(25),
  sort: z.enum(["created_at", "size_bytes", "doc_type"]).default("created_at"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

async function collectDocuments(sb: any, source: "all" | DocSource): Promise<ManagedDocument[]> {
  const collected: ManagedDocument[] = [];

  if (source === "all" || source === "kyc") {
    const { data: rows, error } = await sb
      .from("kyc_documents")
      .select(
        "id, member_id, doc_type, storage_path, mime_type, size_bytes, status, review_notes, created_at, profiles:member_id(full_name, member_no)",
      )
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);
    for (const r of rows ?? []) {
      collected.push({
        id: r.id,
        source: "kyc",
        bucket: KYC_BUCKET,
        storage_path: r.storage_path,
        filename: baseName(r.storage_path),
        doc_type: r.doc_type,
        mime_type: r.mime_type,
        size_bytes: r.size_bytes ?? 0,
        status: r.status ?? null,
        review_notes: r.review_notes ?? null,
        owner_id: r.member_id,
        owner_label:
          [r.profiles?.full_name, r.profiles?.member_no].filter(Boolean).join(" · ") || "Member",
        created_at: r.created_at,
      });
    }
  }

  if (source === "all" || source === "entity") {
    const { data: rows, error } = await sb
      .from("entity_documents")
      .select(
        "id, entity_id, doc_type, storage_path, mime_type, size_bytes, created_at, entities:entity_id(name)",
      )
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);
    for (const r of rows ?? []) {
      collected.push({
        id: r.id,
        source: "entity",
        bucket: ENTITY_BUCKET,
        storage_path: r.storage_path,
        filename: baseName(r.storage_path),
        doc_type: r.doc_type ?? "other",
        mime_type: r.mime_type ?? "application/octet-stream",
        size_bytes: r.size_bytes ?? 0,
        status: null,
        review_notes: null,
        owner_id: r.entity_id,
        owner_label: r.entities?.name ?? "Entity",
        created_at: r.created_at,
      });
    }
  }

  return collected;
}

function applyFilters(
  rows: ManagedDocument[],
  f: {
    search?: string | undefined;
    format?: string | undefined;
    sort: string;
    dir: "asc" | "desc";
  },
) {
  let filtered = rows;
  if (f.search) {
    const q = f.search.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.owner_label.toLowerCase().includes(q) ||
        r.filename.toLowerCase().includes(q) ||
        r.doc_type.toLowerCase().includes(q),
    );
  }
  if (f.format) {
    filtered = filtered.filter((r) => formatLabel(r.mime_type) === f.format);
  }

  const dir = f.dir === "asc" ? 1 : -1;
  return [...filtered].sort((a, b) => {
    if (f.sort === "size_bytes") return (a.size_bytes - b.size_bytes) * dir;
    if (f.sort === "doc_type") return a.doc_type.localeCompare(b.doc_type) * dir;
    return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
  });
}

export const listManagedDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<{ rows: ManagedDocument[]; total: number }> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;

    const filtered = applyFilters(await collectDocuments(sb, data.source), data);
    const total = filtered.length;
    const start = (data.page - 1) * data.page_size;
    return { rows: filtered.slice(start, start + data.page_size), total };
  });

/**
 * Full filtered register for an export/print run. Super Admin only, capped at
 * 5,000 rows, and every run is written to the audit trail with the requested
 * output format so exfiltration attempts are traceable.
 */
export const exportManagedDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    listSchema
      .omit({ page: true, page_size: true })
      .extend({ output: z.enum(["pdf", "csv", "docx", "xlsx", "print"]) })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ rows: ManagedDocument[]; truncated: boolean }> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;

    const filtered = applyFilters(await collectDocuments(sb, data.source), data);
    const MAX = 5000;
    const rows = filtered.slice(0, MAX);

    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: "super_admin",
      action: `document.register_${data.output === "print" ? "print" : "export"}`,
      target: "document_register",
      meta: {
        output: data.output,
        source: data.source,
        search: data.search ?? null,
        format: data.format ?? null,
        sort: `${data.sort}:${data.dir}`,
        row_count: rows.length,
        truncated: filtered.length > MAX,
      },
    });

    return { rows, truncated: filtered.length > MAX };
  });

const refSchema = z.object({
  source: z.enum(["kyc", "entity"]),
  id: z.string().uuid(),
});

async function loadDoc(sb: any, source: DocSource, id: string) {
  const table = source === "kyc" ? "kyc_documents" : "entity_documents";
  const { data, error } = await sb
    .from(table)
    .select("id, storage_path, mime_type, doc_type")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Document not found");
  return data;
}

export const getManagedDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    refSchema.extend({ intent: z.enum(["view", "download", "print"]).default("view") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const doc = await loadDoc(sb, data.source, data.id);
    const bucket = data.source === "kyc" ? KYC_BUCKET : ENTITY_BUCKET;

    const { data: signed, error } = await sb.storage
      .from(bucket)
      .createSignedUrl(
        doc.storage_path,
        300,
        data.intent === "download" ? { download: baseName(doc.storage_path) } : undefined,
      );
    if (error) throw new Error(error.message);

    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: "super_admin",
      action: `document.${data.intent}`,
      target: data.id,
      meta: { source: data.source, doc_type: doc.doc_type, mime_type: doc.mime_type },
    });

    return {
      url: signed.signedUrl as string,
      mime_type: doc.mime_type as string,
      filename: baseName(doc.storage_path),
    };
  });

export const updateManagedDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    refSchema
      .extend({
        doc_type: z.string().trim().min(2).max(60).optional(),
        review_notes: z.string().trim().max(600).nullable().optional(),
        status: z.enum(["pending", "approved", "rejected"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;

    const patch: Record<string, unknown> = {};
    if (data.doc_type) patch.doc_type = data.doc_type;
    if (data.source === "kyc") {
      if (data.review_notes !== undefined) patch.review_notes = data.review_notes;
      if (data.status) patch.status = data.status;
    }
    if (Object.keys(patch).length === 0) return { updated: false };

    const table = data.source === "kyc" ? "kyc_documents" : "entity_documents";
    const { error } = await sb.from(table).update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);

    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: "super_admin",
      action: "document.updated",
      target: data.id,
      meta: { source: data.source, patch },
    });
    return { updated: true };
  });

export const deleteManagedDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    refSchema.extend({ reason: z.string().trim().min(5).max(400) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const doc = await loadDoc(sb, data.source, data.id);
    const bucket = data.source === "kyc" ? KYC_BUCKET : ENTITY_BUCKET;

    await sb.storage.from(bucket).remove([doc.storage_path]);
    const table = data.source === "kyc" ? "kyc_documents" : "entity_documents";
    const { error } = await sb.from(table).delete().eq("id", data.id);
    if (error) throw new Error(error.message);

    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: "super_admin",
      action: "document.deleted",
      target: data.id,
      meta: {
        source: data.source,
        doc_type: doc.doc_type,
        storage_path: doc.storage_path,
        reason: data.reason,
      },
    });
    return { deleted: true };
  });
