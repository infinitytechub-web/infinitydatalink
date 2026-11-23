import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit-log";
import {
  FILE_BUCKET,
  FILE_CATEGORIES,
  MEMBER_QUOTA_BYTES,
  validateUpload,
} from "@/lib/files.shared";

/**
 * Secure file store.
 *
 * Members upload straight into the private bucket under their own `<uid>/` prefix
 * (storage RLS pins the first path segment), then register the metadata here so
 * the server can re-validate type/size/quota and write the audit trail. Signed
 * URLs are minted server-side with a short expiry.
 */

export type MemberFile = {
  id: string;
  owner_id: string;
  owner_label: string;
  category: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  shared_with_staff: boolean;
  review_status: "pending" | "approved" | "rejected";
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

const SELECT_COLS =
  "id, owner_id, category, filename, mime_type, size_bytes, shared_with_staff, review_status, review_note, reviewed_at, created_at";

function mapRow(r: any, ownerLabel = ""): MemberFile {
  return {
    id: r.id,
    owner_id: r.owner_id,
    owner_label: ownerLabel,
    category: r.category,
    filename: r.filename,
    mime_type: r.mime_type,
    size_bytes: Number(r.size_bytes ?? 0),
    shared_with_staff: Boolean(r.shared_with_staff),
    review_status: (r.review_status ?? "pending") as MemberFile["review_status"],
    review_note: r.review_note ?? null,
    reviewed_at: r.reviewed_at ?? null,
    created_at: r.created_at,
  };
}

async function logScan(
  userId: string,
  filename: string,
  mime: string,
  size: number,
  verdict: string,
  reasons: string[],
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("upload_scan_log").insert({
    user_id: userId,
    filename,
    mime_type: mime,
    size_bytes: size,
    verdict,
    reasons,
  } as never);
}

// ============================================================================
// Member
// ============================================================================

export const listMyFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{ files: MemberFile[]; used_bytes: number; quota_bytes: number }> => {
      const { data, error } = await context.supabase
        .from("member_files")
        .select(SELECT_COLS)
        .eq("owner_id", context.userId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      const files = (data ?? []).map((r) => mapRow(r));
      return {
        files,
        used_bytes: files.reduce((s, f) => s + f.size_bytes, 0),
        quota_bytes: MEMBER_QUOTA_BYTES,
      };
    },
  );

const RegisterSchema = z.object({
  storage_path: z.string().min(3).max(400),
  filename: z.string().trim().min(3).max(200),
  mime_type: z.string().trim().min(3).max(160),
  size_bytes: z.number().int().positive(),
  category: z.enum(FILE_CATEGORIES).default("general"),
  shared_with_staff: z.boolean().default(true),
  checksum: z.string().trim().max(128).optional().nullable(),
});

export const registerMyFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RegisterSchema.parse(d))
  .handler(async ({ data, context }): Promise<MemberFile> => {
    const verdict = validateUpload({
      filename: data.filename,
      mime: data.mime_type,
      size: data.size_bytes,
    });
    if (!verdict.ok) {
      await logScan(
        context.userId,
        data.filename,
        data.mime_type,
        data.size_bytes,
        "rejected",
        verdict.reasons,
      );
      throw new Error(`Upload rejected: ${verdict.reasons.join(", ")}`);
    }
    if (!data.storage_path.startsWith(`${context.userId}/`)) {
      throw new Error("Upload rejected: illegal_storage_path");
    }

    const { data: existing, error: qErr } = await context.supabase
      .from("member_files")
      .select("size_bytes")
      .eq("owner_id", context.userId)
      .is("deleted_at", null);
    if (qErr) throw new Error(qErr.message);
    const used = (existing ?? []).reduce((s, r: any) => s + Number(r.size_bytes ?? 0), 0);
    if (used + data.size_bytes > MEMBER_QUOTA_BYTES) {
      await logScan(context.userId, data.filename, data.mime_type, data.size_bytes, "rejected", [
        "quota_exceeded",
      ]);
      throw new Error("Upload rejected: quota_exceeded");
    }

    const { data: row, error } = await context.supabase
      .from("member_files")
      .insert({
        owner_id: context.userId,
        uploaded_by: context.userId,
        storage_path: data.storage_path,
        filename: data.filename,
        mime_type: data.mime_type,
        size_bytes: data.size_bytes,
        category: data.category,
        shared_with_staff: data.shared_with_staff,
        checksum: data.checksum ?? null,
      } as never)
      .select(SELECT_COLS)
      .single();
    if (error) throw new Error(error.message);

    await logScan(context.userId, data.filename, data.mime_type, data.size_bytes, "accepted", []);
    await writeAudit({
      actor_id: context.userId,
      actor_role: "member",
      action: "file.uploaded",
      target: (row as any).id,
      meta: {
        filename: data.filename,
        category: data.category,
        size_bytes: data.size_bytes,
        mime_type: data.mime_type,
        shared_with_staff: data.shared_with_staff,
      },
    });
    return mapRow(row);
  });

export const updateMyFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        filename: z.string().trim().min(3).max(200).optional(),
        category: z.enum(FILE_CATEGORIES).optional(),
        shared_with_staff: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const patch: Record<string, unknown> = {};
    if (data.filename !== undefined) {
      if (/[\\/]|\.\./.test(data.filename)) throw new Error("illegal_filename");
      patch["filename"] = data.filename;
    }
    if (data.category !== undefined) patch["category"] = data.category;
    if (data.shared_with_staff !== undefined) patch["shared_with_staff"] = data.shared_with_staff;
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await context.supabase
      .from("member_files")
      .update(patch as never)
      .eq("id", data.id)
      .eq("owner_id", context.userId)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    await writeAudit({
      actor_id: context.userId,
      actor_role: "member",
      action: "file.metadata_changed",
      target: data.id,
      meta: patch,
    });
    return { ok: true };
  });

export const deleteMyFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { data: row, error: rErr } = await context.supabase
      .from("member_files")
      .select("id, filename, storage_path")
      .eq("id", data.id)
      .eq("owner_id", context.userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!row) throw new Error("File not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("member_files")
      .update({ deleted_at: new Date().toISOString(), deleted_by: context.userId } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (!String((row as any).storage_path).startsWith(`${(row as any).owner_id ?? context.userId}/`)) {
      throw new Error("File path is invalid");
    }
    await supabaseAdmin.storage.from(FILE_BUCKET).remove([(row as any).storage_path]);

    await writeAudit({
      actor_id: context.userId,
      actor_role: "member",
      action: "file.deleted",
      target: data.id,
      meta: { filename: (row as any).filename, deleted_by_role: "member" },
    });
    return { ok: true };
  });

// ============================================================================
// Signed URLs (shared)
// ============================================================================

export const signFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        purpose: z.enum(["preview", "download"]).default("preview"),
      })
      .parse(d),
  )
  .handler(
    async ({ data, context }): Promise<{ url: string; mime_type: string; filename: string }> => {
      // RLS decides visibility: owners see their own rows, staff with files.view
      // see shared rows. A row that comes back is a row the caller may read.
      const { data: row, error } = await context.supabase
        .from("member_files")
        .select("id, owner_id, storage_path, filename, mime_type")
        .eq("id", data.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error("File not found");

      if (!String((row as any).storage_path).startsWith(`${(row as any).owner_id}/`)) {
        throw new Error("File path is invalid");
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: signed, error: sErr } = await supabaseAdmin.storage
        .from(FILE_BUCKET)
        .createSignedUrl((row as any).storage_path, 120, {
          download: data.purpose === "download" ? (row as any).filename : undefined,
        });
      if (sErr || !signed?.signedUrl) throw new Error(sErr?.message ?? "Could not sign file");

      await writeAudit({
        actor_id: context.userId,
        action: data.purpose === "download" ? "file.downloaded" : "file.previewed",
        target: data.id,
        meta: {
          filename: (row as any).filename,
          owner_id: (row as any).owner_id,
          self: (row as any).owner_id === context.userId,
        },
      });
      return {
        url: signed.signedUrl,
        mime_type: (row as any).mime_type,
        filename: (row as any).filename,
      };
    },
  );

// ============================================================================
// Admin / staff
// ============================================================================

export type AdminFileList = {
  rows: MemberFile[];
  total: number;
  page: number;
  page_size: number;
};

const AdminFilterSchema = z.object({
  status: z.enum(["all", "pending", "approved", "rejected"]).default("all"),
  category: z.string().trim().max(60).default("all"),
  search: z.string().trim().max(120).optional().nullable(),
  date_from: z.string().date().optional().nullable(),
  date_to: z.string().date().optional().nullable(),
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(5).max(200).default(25),
});

async function ownerLabels(sb: any, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data } = await sb.from("profiles").select("id, full_name, member_no").in("id", ids);
  for (const p of (data ?? []) as any[]) {
    map.set(p.id, [p.full_name, p.member_no].filter(Boolean).join(" · ") || p.id);
  }
  return map;
}

export const adminListFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AdminFilterSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<AdminFileList> => {
    await assertPermission(context.supabase, context.userId, "files", "view");

    let q = context.supabase
      .from("member_files")
      .select(SELECT_COLS, { count: "exact" })
      .is("deleted_at", null)
      .eq("shared_with_staff", true);

    if (data.status !== "all") q = q.eq("review_status", data.status);
    if (data.category !== "all") q = q.eq("category", data.category);
    if (data.date_from) q = q.gte("created_at", `${data.date_from}T00:00:00Z`);
    if (data.date_to) q = q.lte("created_at", `${data.date_to}T23:59:59Z`);
    if (data.search) {
      const safe = data.search.replace(/[%,()]/g, " ").trim();
      if (safe) q = q.ilike("filename", `%${safe}%`);
    }

    const from = (data.page - 1) * data.page_size;
    const {
      data: rows,
      count,
      error,
    } = await q.order("created_at", { ascending: false }).range(from, from + data.page_size - 1);
    if (error) throw new Error(error.message);

    const labels = await ownerLabels(context.supabase, [
      ...new Set((rows ?? []).map((r: any) => r.owner_id as string)),
    ]);
    return {
      rows: (rows ?? []).map((r: any) => mapRow(r, labels.get(r.owner_id) ?? r.owner_id)),
      total: count ?? 0,
      page: data.page,
      page_size: data.page_size,
    };
  });

export const adminReviewFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        note: z.string().trim().min(10).max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertPermission(
      context.supabase,
      context.userId,
      "files",
      data.decision === "approved" ? "approve" : "reject",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("member_files")
      .update({
        review_status: data.decision,
        review_note: data.note,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      } as never)
      .eq("id", data.id)
      .is("deleted_at", null)
      .select("id, owner_id, filename, loan_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("File not found");

    await writeAudit({
      actor_id: context.userId,
      action: `file.${data.decision}`,
      target: data.id,
      meta: { note: data.note, owner_id: (row as any).owner_id, filename: (row as any).filename },
    });
    try {
      const { notifyUser } = await import("@/lib/notify.server");
      await notifyUser({
        userId: (row as any).owner_id,
        category: data.decision === "approved" ? "file.approved" : "file.rejected",
        title: data.decision === "approved" ? "Document approved" : "Document needs attention",
        body: `${(row as any).filename}: ${data.note}`,
        link: (row as any).loan_id ? "/app/loan-documents" : "/app/files",
      });
    } catch (err) {
      console.error("file review notification failed", (err as Error)?.message);
    }
    return { ok: true };
  });

export const adminDeleteFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), reason: z.string().trim().min(10).max(1000) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertPermission(context.supabase, context.userId, "files", "delete");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("member_files")
      .update({ deleted_at: new Date().toISOString(), deleted_by: context.userId } as never)
      .eq("id", data.id)
      .is("deleted_at", null)
      .select("id, owner_id, filename, storage_path")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("File not found");
    if (!String((row as any).storage_path).startsWith(`${(row as any).owner_id ?? context.userId}/`)) {
      throw new Error("File path is invalid");
    }
    await supabaseAdmin.storage.from(FILE_BUCKET).remove([(row as any).storage_path]);

    await writeAudit({
      actor_id: context.userId,
      action: "file.deleted",
      target: data.id,
      meta: {
        reason: data.reason,
        owner_id: (row as any).owner_id,
        filename: (row as any).filename,
        deleted_by_role: "staff",
      },
    });
    return { ok: true };
  });
