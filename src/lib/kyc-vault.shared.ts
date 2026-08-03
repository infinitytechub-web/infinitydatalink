/**
 * Shared constants for the KYC account vault.
 *
 * Deleting a KYC review never destroys data: the review snapshot is written to
 * `public.recycle_bin` (`entity_table = 'kyc_review'`) and the uploaded
 * documents are MOVED inside the storage bucket under `VAULT_PREFIX`, so an
 * authorised admin can restore the whole record for 30 days.
 */

export const VAULT_PREFIX = "_vault";

/** Profile columns captured in the vault snapshot and written back on restore. */
export const KYC_SNAPSHOT_FIELDS = [
  "kyc",
  "kyc_notes",
  "kyc_reviewed_by",
  "kyc_reviewed_at",
  "kyc_assigned_to",
  "kyc_assigned_at",
  "kyc_submitted_at",
  "kyc_resubmitted_at",
  "kyc_resubmission_deadline",
  "kyc_attempts",
  "kyc_remediation_items",
  "kyc_rejection_snapshot",
  "kyc_risk_level",
  "kyc_risk_flags",
  "kyc_flagged_at",
  "kyc_flag_reason",
] as const;

export type VaultDocument = {
  id: string;
  member_id: string;
  doc_type: string;
  storage_path: string;
  original_path?: string | null;
  vault_path?: string | null;
  mime_type: string;
  size_bytes: number;
  status: string;
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type VaultEntry = {
  id: string;
  member_id: string;
  member_no: string | null;
  member_name: string | null;
  previous_kyc: string | null;
  reason: string | null;
  deleted_by_role: string | null;
  deleted_by_email: string | null;
  deleted_at: string;
  purge_after: string;
  document_count: number;
  documents: VaultDocument[];
  profile_snapshot: Record<string, any>;
};
