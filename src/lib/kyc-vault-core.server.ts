/**
 * Server-only core for the KYC account vault.
 *
 * Both the single-record admin actions and the bulk console actions share
 * these routines so archive/restore semantics can never drift apart:
 *  - `archiveKycReview` moves documents into the vault prefix, snapshots the
 *    profile KYC columns into `recycle_bin` and resets the live review.
 *  - `restoreVaultEntry` validates the snapshot, moves documents back and
 *    re-hydrates the profile.
 *
 * Every call writes its own per-member audit entry, so bulk operations produce
 * one audit row per user rather than a single aggregate row.
 */
import { writeAudit } from "@/lib/audit-log";
import { KYC_SNAPSHOT_FIELDS, VAULT_PREFIX, type VaultEntry } from "@/lib/kyc-vault.shared";

const BUCKET = "kyc-documents";

/** Valid values of the `kyc_status` enum — a restore may not write anything else. */
export const VALID_KYC_STATES = ["pending", "active", "rejected"] as const;
export type ValidKycState = (typeof VALID_KYC_STATES)[number];

export type Actor = {
  userId: string;
  email: string | null;
  role: string | null;
};

export function toVaultEntry(row: any): VaultEntry {
  const p = (row.payload ?? {}) as any;
  const docs = (p.documents ?? []) as VaultEntry["documents"];
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

/**
 * Guards a vault entry before anything is written back.
 *
 * Restoring into an invalid state would either break the `kyc_status` enum or
 * silently overwrite a newer submission the member has made since deletion, so
 * both are refused with an explanation instead.
 */
export async function assertRestorable(
  admin: any,
  entry: VaultEntry,
): Promise<{ target: ValidKycState }> {
  const snapshotState = (entry.profile_snapshot?.["kyc"] ?? entry.previous_kyc ?? null) as
    | string
    | null;
  if (!snapshotState) {
    throw new Error("Archived snapshot has no verification status — cannot restore");
  }
  if (!(VALID_KYC_STATES as readonly string[]).includes(snapshotState)) {
    throw new Error(`Archived verification status "${snapshotState}" is not a valid KYC state`);
  }

  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, kyc, kyc_submitted_at, kyc_resubmitted_at")
    .eq("id", entry.member_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!profile) throw new Error("Member profile no longer exists — cannot restore");

  // A newer live review must never be clobbered by an older archive.
  if (profile.kyc && profile.kyc !== "pending") {
    throw new Error(
      `Member already has a live "${profile.kyc}" verification — review it before restoring the archive`,
    );
  }
  const { count } = await admin
    .from("kyc_documents")
    .select("id", { count: "exact", head: true })
    .eq("member_id", entry.member_id);
  if ((count ?? 0) > 0) {
    throw new Error("Member has re-submitted documents since deletion — restore would overwrite them");
  }
  if (profile.kyc_submitted_at || profile.kyc_resubmitted_at) {
    throw new Error("Member has a newer submission in progress — restore blocked");
  }

  return { target: snapshotState as ValidKycState };
}

/** Restores one vault entry. Throws on any safeguard violation. */
export async function restoreVaultEntry(
  admin: any,
  row: any,
  actor: Actor,
  reason: string,
): Promise<{ member_id: string; member_name: string | null; documents_restored: number }> {
  const entry = toVaultEntry(row);
  const { target } = await assertRestorable(admin, entry);

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
    const { error } = await admin.from("kyc_documents").upsert(restoredDocs, { onConflict: "id" });
    if (error) throw new Error(error.message);
  }

  const update: Record<string, unknown> = {};
  for (const f of KYC_SNAPSHOT_FIELDS) {
    if (f in entry.profile_snapshot) update[f] = (entry.profile_snapshot as any)[f];
  }
  update["kyc"] = target; // always a validated enum value
  const { error: uErr } = await admin.from("profiles").update(update).eq("id", entry.member_id);
  if (uErr) throw new Error(uErr.message);

  const { error: dErr } = await admin.from("recycle_bin").delete().eq("id", entry.id);
  if (dErr) throw new Error(dErr.message);

  await writeAudit({
    actor_id: actor.userId,
    actor_email: actor.email,
    actor_role: actor.role,
    action: "kyc.review_restored",
    target: entry.member_id,
    meta: {
      vault_id: entry.id,
      member_id: entry.member_id,
      member_no: entry.member_no,
      member_name: entry.member_name,
      restored_kyc: target,
      documents_restored: restoredDocs.length,
      reason,
    },
  });

  // Tell the affected member what came back and who did it.
  try {
    const { notifyUser } = await import("@/lib/notify.server");
    const who =
      actor.email ?? (actor.role ? `a ${String(actor.role).replace(/_/g, " ")}` : "an administrator");
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
      body: `Your identity verification record was restored from the account vault by ${who}. Verification status restored to "${target}".${docLine} Reason: ${reason}`,
      link: "/app/kyc",
      meta: {
        vault_id: entry.id,
        restored_kyc: target,
        documents_restored: restoredDocs.length,
        document_types: restoredDocs.map((d) => d.doc_type),
        restored_by_email: actor.email,
        restored_by_role: actor.role,
        reason,
      },
      dedupeKey: `kyc.restored:${entry.id}`,
    });
  } catch (err) {
    console.error("vault restore notification failed", err);
  }

  return {
    member_id: entry.member_id,
    member_name: entry.member_name,
    documents_restored: restoredDocs.length,
  };
}

/**
 * Archives one member's KYC review into the vault (never destructive) and
 * resets the live review to a clean `pending` state.
 */
export async function archiveKycReview(
  admin: any,
  memberId: string,
  actor: Actor,
  reason: string,
): Promise<{
  archive_id: string;
  member_id: string;
  member_name: string | null;
  member_no: string | null;
  previous_kyc: string | null;
  documents_archived: number;
  document_types: string[];
}> {
  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select(["id", "full_name", "member_no", ...KYC_SNAPSHOT_FIELDS].join(", "))
    .eq("id", memberId)
    .maybeSingle();
  if (pErr) throw new Error(pErr.message);
  if (!profile) throw new Error("Member not found");

  const { data: docs, error: dErr } = await admin
    .from("kyc_documents")
    .select("*")
    .eq("member_id", memberId);
  if (dErr) throw new Error(dErr.message);

  const archiveId = crypto.randomUUID();
  const archivedDocs: any[] = [];
  for (const d of docs ?? []) {
    const from = d.storage_path as string;
    if (!from) continue;
    const to = `${VAULT_PREFIX}/${archiveId}/${from}`;
    const { error: mvErr } = await admin.storage.from(BUCKET).move(from, to);
    archivedDocs.push({ ...d, vault_path: mvErr ? null : to, original_path: from });
  }
  if ((docs ?? []).length > 0) {
    const { error: delErr } = await admin
      .from("kyc_documents")
      .delete()
      .eq("member_id", memberId);
    if (delErr) throw new Error(delErr.message);
  }

  const snapshot: Record<string, unknown> = {};
  for (const f of KYC_SNAPSHOT_FIELDS) snapshot[f] = (profile as any)[f] ?? null;

  const { error: vErr } = await admin.from("recycle_bin").insert({
    id: archiveId,
    entity_table: "kyc_review",
    entity_id: memberId,
    deleted_by: actor.userId,
    payload: {
      member_id: memberId,
      member_no: (profile as any).member_no ?? null,
      member_name: (profile as any).full_name ?? null,
      previous_kyc: (profile as any).kyc ?? null,
      reason,
      deleted_by_role: actor.role,
      deleted_by_email: actor.email,
      profile_snapshot: snapshot,
      documents: archivedDocs,
    },
  });
  if (vErr) throw new Error(vErr.message);

  const { error: uErr } = await admin
    .from("profiles")
    .update({
      kyc: "pending",
      kyc_notes: null,
      kyc_reviewed_by: null,
      kyc_reviewed_at: null,
      kyc_assigned_to: null,
      kyc_assigned_at: null,
      kyc_submitted_at: null,
      kyc_resubmitted_at: null,
      kyc_resubmission_deadline: null,
      kyc_attempts: 0,
      kyc_remediation_items: [],
      kyc_rejection_snapshot: null,
      kyc_risk_level: null,
      kyc_risk_flags: null,
      kyc_flagged_at: null,
      kyc_flag_reason: null,
      kyc_deadline_reminded_at: null,
      kyc_final_reminded_at: null,
      kyc_low_attempts_reminded_at: null,
      kyc_deadline_expired_notified_at: null,
    })
    .eq("id", memberId);
  if (uErr) throw new Error(uErr.message);

  await writeAudit({
    actor_id: actor.userId,
    actor_email: actor.email,
    actor_role: actor.role,
    action: "kyc.review_deleted",
    target: memberId,
    meta: {
      vault_id: archiveId,
      member_id: memberId,
      member_no: (profile as any).member_no ?? null,
      member_name: (profile as any).full_name ?? null,
      previous_kyc: (profile as any).kyc ?? null,
      reason,
      documents_deleted: (docs ?? []).length,
      document_types: (docs ?? []).map((d: any) => d.doc_type),
    },
  });

  return {
    archive_id: archiveId,
    member_id: memberId,
    member_name: (profile as any).full_name ?? null,
    member_no: (profile as any).member_no ?? null,
    previous_kyc: (profile as any).kyc ?? null,
    documents_archived: (docs ?? []).length,
    document_types: (docs ?? []).map((d: any) => d.doc_type),
  };
}
