/**
 * Secure purge engine for the KYC account vault.
 *
 * Vault snapshots (`public.recycle_bin`, `entity_table = 'kyc_review'`) and the
 * archived storage objects under `_vault/` are destroyed only once the
 * configured retention window (`public.kyc_vault_retention`) has fully elapsed
 * — retention_years + legal_hold_days after the archive date.
 *
 * Every purged snapshot writes its own audit row (`kyc.vault_retention_purged`)
 * so the compliance trail survives the data it describes.
 */
import { writeAudit } from "@/lib/audit-log";
import type { VaultDocument } from "@/lib/kyc-vault.shared";

const BUCKET = "kyc-documents";

export type VaultRetentionPolicy = {
  auto_purge_enabled: boolean;
  retention_years: number;
  legal_hold_days: number;
  last_purge_at: string | null;
  last_purge_entries: number | null;
  last_purge_documents: number | null;
  last_purge_actor: string | null;
  updated_at: string;
};

export type VaultPurgeResult = {
  entries_purged: number;
  documents_purged: number;
  failed: number;
  results: {
    vault_id: string;
    member_id: string;
    ok: boolean;
    documents_purged?: number;
    error?: string;
  }[];
};

export async function loadVaultRetentionPolicy(admin: any): Promise<VaultRetentionPolicy> {
  const { data, error } = await admin
    .from("kyc_vault_retention")
    .select(
      "auto_purge_enabled, retention_years, legal_hold_days, last_purge_at, last_purge_entries, last_purge_documents, last_purge_actor, updated_at",
    )
    .eq("id", 1)
    .single();
  if (error) throw new Error(error.message);
  return data as VaultRetentionPolicy;
}

/** Vault snapshots whose retention window has elapsed (never touches live data). */
export async function listVaultPurgeCandidates(admin: any, limit = 200) {
  const { data, error } = await admin.rpc("kyc_vault_purge_candidates", { _limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []) as {
    id: string;
    entity_id: string;
    deleted_at: string;
    purge_after: string;
    payload: any;
  }[];
}

/**
 * Permanently remove expired vault snapshots and their archived documents.
 *
 * @param actor  who/what triggered the run — a scheduler run passes
 *               `{ label: "retention-scheduler" }` with no user id.
 */
export async function purgeExpiredVaultEntries(
  admin: any,
  actor: { userId?: string | null; email?: string | null; role?: string | null; label: string },
  options: { limit?: number; dryRun?: boolean } = {},
): Promise<VaultPurgeResult> {
  const policy = await loadVaultRetentionPolicy(admin);
  const candidates = await listVaultPurgeCandidates(admin, options.limit ?? 200);

  const results: VaultPurgeResult["results"] = [];
  let documentsPurged = 0;

  for (const row of candidates) {
    const payload = (row.payload ?? {}) as any;
    const memberId = (payload.member_id ?? row.entity_id) as string;
    const docs = (payload.documents ?? []) as VaultDocument[];
    const paths = docs.map((d) => d.vault_path).filter(Boolean) as string[];

    if (options.dryRun) {
      results.push({
        vault_id: row.id,
        member_id: memberId,
        ok: true,
        documents_purged: paths.length,
      });
      documentsPurged += paths.length;
      continue;
    }

    try {
      if (paths.length > 0) {
        const { error: sErr } = await admin.storage.from(BUCKET).remove(paths);
        if (sErr) throw new Error(sErr.message);
      }
      const { error: dErr } = await admin.from("recycle_bin").delete().eq("id", row.id);
      if (dErr) throw new Error(dErr.message);

      documentsPurged += paths.length;
      results.push({
        vault_id: row.id,
        member_id: memberId,
        ok: true,
        documents_purged: paths.length,
      });

      await writeAudit({
        actor_id: actor.userId ?? null,
        actor_email: actor.email ?? null,
        actor_role: actor.role ?? null,
        action: "kyc.vault_retention_purged",
        target: memberId,
        meta: {
          vault_id: row.id,
          member_id: memberId,
          member_no: payload.member_no ?? null,
          member_name: payload.member_name ?? null,
          documents_purged: paths.length,
          document_types: docs.map((d) => d.doc_type),
          archived_at: row.deleted_at,
          purge_after: row.purge_after,
          retention_years: policy.retention_years,
          legal_hold_days: policy.legal_hold_days,
          triggered_by: actor.label,
        },
      });
    } catch (err: any) {
      results.push({
        vault_id: row.id,
        member_id: memberId,
        ok: false,
        error: err?.message ?? "Purge failed",
      });
    }
  }

  const purged = results.filter((r) => r.ok).length;

  if (!options.dryRun) {
    await admin
      .from("kyc_vault_retention")
      .update({
        last_purge_at: new Date().toISOString(),
        last_purge_entries: purged,
        last_purge_documents: documentsPurged,
        last_purge_actor: actor.email ?? actor.label,
      })
      .eq("id", 1);

    await writeAudit({
      actor_id: actor.userId ?? null,
      actor_email: actor.email ?? null,
      actor_role: actor.role ?? null,
      action: "kyc.vault_retention_run",
      target: "kyc_vault_retention",
      meta: {
        entries_purged: purged,
        documents_purged: documentsPurged,
        failed: results.length - purged,
        retention_years: policy.retention_years,
        legal_hold_days: policy.legal_hold_days,
        triggered_by: actor.label,
      },
    });
  }

  return {
    entries_purged: purged,
    documents_purged: documentsPurged,
    failed: results.length - purged,
    results,
  };
}
