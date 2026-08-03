/**
 * Account vault — restore or permanently purge deleted member KYC reviews.
 *
 * Access is capability-gated through the database permission matrix, so only
 * super admins, admins and the roles assigned the matching `kyc.*` capability
 * can list (`kyc.view`), restore (`kyc.edit`) or purge (`kyc.delete`) an entry.
 * Every action is written to the audit log.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit } from "@/lib/audit-log";
import {
  KYC_SNAPSHOT_FIELDS,
  type VaultDocument,
  type VaultEntry,
} from "@/lib/kyc-vault.shared";

const BUCKET = "kyc-documents";

async function ctx(context: any, action: "view" | "edit" | "delete") {
  const { assertCapability } = await import("@/lib/capability-guard.server");
  const sb = context.supabase;
  const { data: roleRows, error } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const roles = (roleRows ?? []).map((r: any) => r.role as string);
  await assertCapability(sb, "kyc", action);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return {
    admin: supabaseAdmin as any,
    actorRole: roles[0] ?? null,
    email: (context.claims as any)?.email ?? null,
  };
}

function toEntry(row: any): VaultEntry {
  const p = (row.payload ?? {}) as any;
  const docs = (p.documents ?? []) as VaultDocument[];
  return {
    id: row.id,
    member_id: p.member_id ?? row.entity_id,
    member_no: p.member_no ?? null,
    member_name: p.member_name ?? null,
    previous_kyc: p.previous_kyc ?? null,
    reason: p.reason ?? null,
    deleted_by_role: p.deleted_by_role ?? null,
    deleted_by_email: p.deleted_by_email ?? null,
    deleted_at: row.deleted_at,
    purge_after: row.purge_after,
    document_count: docs.length,
    documents: docs,
    profile_snapshot: p.profile_snapshot ?? {},
  };
}

export const listKycVault = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        q: z.string().trim().max(200).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(100).default(25),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { admin } = await ctx(context, "view");
    const from = (data.page - 1) * data.pageSize;
    const { data: rows, count, error } = await admin
      .from("recycle_bin")
      .select("*", { count: "exact" })
      .eq("entity_table", "kyc_review")
      .order("deleted_at", { ascending: false })
      .range(from, from + data.pageSize - 1);
    if (error) throw new Error(error.message);

    let entries: VaultEntry[] = (rows ?? []).map(toEntry);
    const q = data.q?.toLowerCase();
    if (q) {
      entries = entries.filter((e: VaultEntry) =>

        [e.member_name, e.member_no, e.member_id, e.deleted_by_email]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    return { entries, total: count ?? entries.length };
  });

export const restoreKycVault = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), reason: z.string().trim().min(5).max(500) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { admin, actorRole, email } = await ctx(context, "edit");

    const { data: row, error } = await admin
      .from("recycle_bin")
      .select("*")
      .eq("id", data.id)
      .eq("entity_table", "kyc_review")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Vault entry not found");

    const entry = toEntry(row);

    // Move archived documents back to their original paths, then re-insert rows.
    const restoredDocs: any[] = [];
    for (const d of entry.documents) {
      const original = d.original_path ?? d.storage_path;
      if (d.vault_path) {
        await admin.storage.from(BUCKET).move(d.vault_path, original);
      }
      restoredDocs.push({
        id: d.id,
        member_id: entry.member_id,
        doc_type: d.doc_type,
        storage_path: original,
        mime_type: d.mime_type,
        size_bytes: d.size_bytes,
        status: d.status,
        review_notes: d.review_notes,
        reviewed_by: d.reviewed_by,
        reviewed_at: d.reviewed_at,
        created_at: d.created_at,
      });
    }
    if (restoredDocs.length > 0) {
      const { error: iErr } = await admin
        .from("kyc_documents")
        .upsert(restoredDocs, { onConflict: "id" });
      if (iErr) throw new Error(iErr.message);
    }

    const update: Record<string, unknown> = {};
    for (const f of KYC_SNAPSHOT_FIELDS) {
      if (f in entry.profile_snapshot) update[f] = (entry.profile_snapshot as any)[f];
    }
    if (Object.keys(update).length > 0) {
      const { error: uErr } = await admin.from("profiles").update(update).eq("id", entry.member_id);
      if (uErr) throw new Error(uErr.message);
    }

    const { error: dErr } = await admin.from("recycle_bin").delete().eq("id", data.id);
    if (dErr) throw new Error(dErr.message);

    await writeAudit({
      actor_id: context.userId,
      actor_email: email,
      actor_role: actorRole,
      action: "kyc.review_restored",
      target: entry.member_id,
      meta: {
        vault_id: data.id,
        member_id: entry.member_id,
        member_no: entry.member_no,
        member_name: entry.member_name,
        restored_kyc: entry.previous_kyc,
        documents_restored: restoredDocs.length,
        reason: data.reason,
      },
    });

    // Tell the affected member their verification record is back, what came
    // back with it and who performed the restore. In-app always; email/SMS
    // follow the member's notification preferences.
    const { notifyUser } = await import("@/lib/notify.server");
    const actor = email ?? (actorRole ? `a ${String(actorRole).replace(/_/g, " ")}` : "an administrator");
    const restoredStatus = entry.previous_kyc ? ` Verification status restored to "${entry.previous_kyc}".` : "";
    const docLine =
      restoredDocs.length > 0
        ? ` ${restoredDocs.length} document${restoredDocs.length === 1 ? "" : "s"} (${restoredDocs
            .map((d) => String(d.doc_type).replace(/_/g, " "))
            .join(", ")}) were restored.`
        : " No documents were attached to the archive.";
    await notifyUser({
      userId: entry.member_id,
      category: "account.kyc.restored",
      title: "Your KYC record has been restored",
      body: `Your identity verification record was restored from the account vault by ${actor}.${restoredStatus}${docLine} Reason: ${data.reason}`,
      link: "/app/kyc",
      meta: {
        vault_id: data.id,
        restored_kyc: entry.previous_kyc,
        documents_restored: restoredDocs.length,
        document_types: restoredDocs.map((d) => d.doc_type),
        restored_by_email: email,
        restored_by_role: actorRole,
        reason: data.reason,
      },
      dedupeKey: `kyc.restored:${data.id}`,
    });

    return { restored: true, documents_restored: restoredDocs.length };
  });

export const purgeKycVaultEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), reason: z.string().trim().min(5).max(500) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { admin, actorRole, email } = await ctx(context, "delete");

    const { data: row, error } = await admin
      .from("recycle_bin")
      .select("*")
      .eq("id", data.id)
      .eq("entity_table", "kyc_review")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Vault entry not found");

    const entry = toEntry(row);
    const paths = entry.documents.map((d) => d.vault_path).filter(Boolean) as string[];
    if (paths.length > 0) await admin.storage.from(BUCKET).remove(paths);

    const { error: dErr } = await admin.from("recycle_bin").delete().eq("id", data.id);
    if (dErr) throw new Error(dErr.message);

    await writeAudit({
      actor_id: context.userId,
      actor_email: email,
      actor_role: actorRole,
      action: "kyc.vault_purged",
      target: entry.member_id,
      meta: {
        vault_id: data.id,
        member_id: entry.member_id,
        member_no: entry.member_no,
        documents_purged: paths.length,
        reason: data.reason,
      },
    });

    return { purged: true, documents_purged: paths.length };
  });
