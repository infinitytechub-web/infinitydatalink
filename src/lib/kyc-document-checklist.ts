/**
 * Client-safe catalogue of the KYC documents a reviewer must see before
 * deciding. The server-side transition gate (`kyc-transition.server.ts`)
 * imports the same required list so the checklist shown in the review panel
 * can never drift from the rule that blocks an approval.
 */

export const KYC_REQUIRED_DOC_TYPES = ["national_id_front", "national_id_back", "selfie"] as const;

/** Extra attachments required only when the member is under 18. */
export const KYC_MINOR_DOC_TYPES = ["guardian_consent", "safeguarding_attestation"] as const;

/** Helpful but never blocking. */
export const KYC_OPTIONAL_DOC_TYPES = ["proof_of_address", "other"] as const;

export const KYC_DOC_LABEL: Record<string, string> = {
  national_id_front: "Ghana Card / National ID — front",
  national_id_back: "Ghana Card / National ID — back",
  selfie: "Selfie photo (liveness)",
  guardian_consent: "Guardian consent form",
  safeguarding_attestation: "Safeguarding attestation",
  proof_of_address: "Proof of address",
  other: "Other supporting document",
};

export const KYC_DOC_HINT: Record<string, string> = {
  national_id_front: "Front of the card — name, ID number and photo must be legible.",
  national_id_back: "Back of the card — check the machine-readable zone and expiry.",
  selfie: "Face must match the card photo.",
  guardian_consent: "Signed consent from the verified guardian.",
  safeguarding_attestation: "Officer attestation for the minor account.",
  proof_of_address: "Utility bill or tenancy letter, under 3 months old.",
  other: "Any additional evidence supplied by the member.",
};

export function kycDocLabel(docType: string): string {
  return KYC_DOC_LABEL[docType] ?? docType.replace(/_/g, " ");
}

export type ChecklistItem = {
  doc_type: string;
  label: string;
  hint: string;
  requirement: "required" | "optional";
  present: boolean;
  status: string | null;
};

/**
 * Builds the ordered checklist for a member's submission. Required rows come
 * first, then the minor-only rows when applicable, then anything optional the
 * member actually uploaded.
 */
export function buildKycChecklist(
  documents: readonly { doc_type: string; status?: string | null }[],
  opts: { isMinor?: boolean } = {},
): ChecklistItem[] {
  const byType = new Map<string, { doc_type: string; status?: string | null }>();
  for (const d of documents) if (!byType.has(d.doc_type)) byType.set(d.doc_type, d);

  const required = [
    ...KYC_REQUIRED_DOC_TYPES,
    ...(opts.isMinor ? KYC_MINOR_DOC_TYPES : []),
  ] as readonly string[];

  const rows: ChecklistItem[] = required.map((t) => ({
    doc_type: t,
    label: kycDocLabel(t),
    hint: KYC_DOC_HINT[t] ?? "",
    requirement: "required" as const,
    present: byType.has(t),
    status: byType.get(t)?.status ?? null,
  }));

  for (const t of KYC_OPTIONAL_DOC_TYPES) {
    if (required.includes(t)) continue;
    rows.push({
      doc_type: t,
      label: kycDocLabel(t),
      hint: KYC_DOC_HINT[t] ?? "",
      requirement: "optional",
      present: byType.has(t),
      status: byType.get(t)?.status ?? null,
    });
  }

  return rows;
}

export function missingRequiredDocs(
  documents: readonly { doc_type: string }[],
  opts: { isMinor?: boolean } = {},
): string[] {
  return buildKycChecklist(documents, opts)
    .filter((r) => r.requirement === "required" && !r.present)
    .map((r) => r.label);
}
