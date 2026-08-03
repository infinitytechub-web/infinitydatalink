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
    const { restoreVaultEntry } = await import("@/lib/kyc-vault-core.server");

    const { data: row, error } = await admin
      .from("recycle_bin")
      .select("*")
      .eq("id", data.id)
      .eq("entity_table", "kyc_review")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Vault entry not found");

    const res = await restoreVaultEntry(
      admin,
      row,
      { userId: context.userId, email, role: actorRole },
      data.reason,
    );
    return { restored: true, documents_restored: res.documents_restored };
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

// ============================================================================
// Bulk console actions
// ============================================================================

const BULK_LIMIT = 50;

/**
 * Restore several vault entries in one pass.
 *
 * Each entry is validated independently (valid `kyc_status` snapshot, member
 * still exists, no newer submission that would be overwritten) and gets its own
 * audit row plus member notification. One failure never aborts the batch — the
 * per-entry outcome is returned so the console can report exactly what happened.
 */
export const bulkRestoreKycVault = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(BULK_LIMIT),
        reason: z.string().trim().min(5).max(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { admin, actorRole, email } = await ctx(context, "edit");
    const { restoreVaultEntry } = await import("@/lib/kyc-vault-core.server");
    const actor = { userId: context.userId, email, role: actorRole };

    const { data: rows, error } = await admin
      .from("recycle_bin")
      .select("*")
      .eq("entity_table", "kyc_review")
      .in("id", data.ids);
    if (error) throw new Error(error.message);

    const byId = new Map<string, any>((rows ?? []).map((r: any) => [r.id, r]));
    const results: {
      id: string;
      ok: boolean;
      member_id?: string;
      member_name?: string | null;
      documents_restored?: number;
      error?: string;
    }[] = [];

    for (const id of data.ids) {
      const row = byId.get(id);
      if (!row) {
        results.push({ id, ok: false, error: "Vault entry not found" });
        continue;
      }
      try {
        const res = await restoreVaultEntry(admin, row, actor, data.reason);
        results.push({ id, ok: true, ...res });
      } catch (err: any) {
        results.push({ id, ok: false, error: err?.message ?? "Restore failed" });
        await writeAudit({
          actor_id: context.userId,
          actor_email: email,
          actor_role: actorRole,
          action: "kyc.review_restore_blocked",
          target: (row.payload?.member_id ?? row.entity_id) as string,
          meta: { vault_id: id, reason: data.reason, error: err?.message ?? "unknown" },
        });
      }
    }

    return {
      restored: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  });

/**
 * Archive (soft-delete into the vault) several members' KYC reviews at once.
 * Requires admin/super_admin plus the `kyc.delete` capability, mirroring the
 * single-record action, and writes one audit row per member.
 */
export const bulkArchiveKycReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        member_ids: z.array(z.string().uuid()).min(1).max(BULK_LIMIT),
        reason: z.string().trim().min(5).max(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { admin, actorRole, email } = await ctx(context, "delete");
    if (actorRole !== "super_admin" && actorRole !== "admin") {
      throw new Error("Forbidden: super_admin or admin role required");
    }
    const { archiveKycReview } = await import("@/lib/kyc-vault-core.server");
    const { notifyStaff } = await import("@/lib/notify.server");
    const actor = { userId: context.userId, email, role: actorRole };

    const results: {
      member_id: string;
      ok: boolean;
      member_name?: string | null;
      documents_archived?: number;
      error?: string;
    }[] = [];

    for (const memberId of data.member_ids) {
      try {
        const res = await archiveKycReview(admin, memberId, actor, data.reason);
        results.push({
          member_id: memberId,
          ok: true,
          member_name: res.member_name,
          documents_archived: res.documents_archived,
        });
      } catch (err: any) {
        results.push({ member_id: memberId, ok: false, error: err?.message ?? "Archive failed" });
      }
    }

    const archived = results.filter((r) => r.ok);
    if (archived.length > 0) {
      await notifyStaff({
        roles: ["super_admin", "compliance_officer"],
        category: "kyc.review.deleted",
        title: `${archived.length} KYC review${archived.length === 1 ? "" : "s"} archived to the vault`,
        body: `${archived
          .map((r) => r.member_name ?? r.member_id)
          .join(", ")} archived by ${actorRole}. Reason: ${data.reason}`,
        link: "/admin/vault",
        meta: { member_ids: archived.map((r) => r.member_id), reason: data.reason },
        dedupeKey: `kyc.review.bulk_deleted:${context.userId}:${Date.now()}`,
        excludeUserId: context.userId,
      });
    }

    return {
      archived: archived.length,
      failed: results.length - archived.length,
      results,
    };
  });

/**
 * Detail view for one vault entry: full metadata (previous status, reviewer /
 * archiver context, per-document type, upload date, size, reviewer notes) plus
 * short-lived signed URLs so an admin can preview the actual archived files
 * before restoring. Read-only — requires the `kyc.view` capability.
 */
export const getKycVaultEntry = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { admin } = await ctx(context, "view");

    const { data: row, error } = await admin
      .from("recycle_bin")
      .select("*")
      .eq("id", data.id)
      .eq("entity_table", "kyc_review")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Vault entry not found");

    const entry = toEntry(row);

    const documents = await Promise.all(
      entry.documents.map(async (d) => {
        const path = d.vault_path ?? d.storage_path;
        let signed_url: string | null = null;
        if (path) {
          const { data: s } = await admin.storage.from(BUCKET).createSignedUrl(path, 300);
          signed_url = s?.signedUrl ?? null;
        }
        return { ...d, signed_url };
      }),
    );

    // Reviewer / archiver context
    const snap = entry.profile_snapshot ?? {};
    const staffIds = [snap.kyc_reviewed_by, snap.kyc_assigned_to]
      .filter(Boolean)
      .map((v: any) => String(v));
    const staff: Record<string, { full_name: string | null; email: string | null }> = {};
    if (staffIds.length > 0) {
      const { data: rows } = await admin
        .from("profiles")
        .select("id, full_name")
        .in("id", staffIds);
      for (const r of rows ?? []) {
        staff[r.id] = { full_name: r.full_name ?? null, email: null };
      }
    }

    let restorable = true;
    let restore_blocker: string | null = null;
    try {
      const { assertRestorable } = await import("@/lib/kyc-vault-core.server");
      await assertRestorable(admin, entry);
    } catch (err: any) {
      restorable = false;
      restore_blocker = err?.message ?? "Not restorable";
    }

    return {
      entry: { ...entry, documents },
      review: {
        previous_kyc: entry.previous_kyc,
        kyc_notes: snap.kyc_notes ?? null,
        reviewed_at: snap.kyc_reviewed_at ?? null,
        reviewed_by: snap.kyc_reviewed_by
          ? (staff[String(snap.kyc_reviewed_by)] ?? null)
          : null,
        assigned_at: snap.kyc_assigned_at ?? null,
        assigned_to: snap.kyc_assigned_to
          ? (staff[String(snap.kyc_assigned_to)] ?? null)
          : null,
        submitted_at: snap.kyc_submitted_at ?? null,
        resubmitted_at: snap.kyc_resubmitted_at ?? null,
        attempts: snap.kyc_attempts ?? null,
        risk_level: snap.kyc_risk_level ?? null,
        risk_flags: Array.isArray(snap.kyc_risk_flags) ? snap.kyc_risk_flags : [],
        remediation_items: Array.isArray(snap.kyc_remediation_items)
          ? snap.kyc_remediation_items
          : [],
      },
      restorable,
      restore_blocker,
    };
  });
