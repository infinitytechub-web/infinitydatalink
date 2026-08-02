/**
 * Shared catalogue of KYC remediation items.
 *
 * A remediation item is a single thing a compliance reviewer asks the member to
 * fix before resubmitting. Keys are namespaced so both sides of the flow agree:
 *   profile:<column>   — a personal-details field on the member profile
 *   document:<type>    — a KYC document that must be re-uploaded
 */
export const REMEDIATION_PROFILE_FIELDS = [
  "full_name",
  "phone",
  "date_of_birth",
  "gender",
  "region",
  "address_line",
  "digital_address",
  "occupation",
  "employer",
  "national_id",
] as const;

export const REMEDIATION_DOC_TYPES = [
  "national_id_front",
  "national_id_back",
  "selfie",
  "proof_of_address",
] as const;

export type RemediationProfileField = (typeof REMEDIATION_PROFILE_FIELDS)[number];
export type RemediationDocType = (typeof REMEDIATION_DOC_TYPES)[number];

export type RemediationItem =
  | { kind: "profile"; key: string; field: RemediationProfileField; label: string }
  | { kind: "document"; key: string; docType: RemediationDocType; label: string };

const PROFILE_LABELS: Record<RemediationProfileField, string> = {
  full_name: "Full name",
  phone: "Phone number",
  date_of_birth: "Date of birth",
  gender: "Gender",
  region: "Region",
  address_line: "Residential address",
  digital_address: "Ghana Post digital address",
  occupation: "Occupation",
  employer: "Employer",
  national_id: "Ghana Card / national ID number",
};

const DOC_LABELS: Record<RemediationDocType, string> = {
  national_id_front: "Ghana Card — front",
  national_id_back: "Ghana Card — back",
  selfie: "Selfie / liveness photo",
  proof_of_address: "Proof of address",
};

/** Every selectable item, in the order reviewers should see them. */
export const ALL_REMEDIATION_ITEMS: RemediationItem[] = [
  ...REMEDIATION_PROFILE_FIELDS.map((field) => ({
    kind: "profile" as const,
    key: `profile:${field}`,
    field,
    label: PROFILE_LABELS[field],
  })),
  ...REMEDIATION_DOC_TYPES.map((docType) => ({
    kind: "document" as const,
    key: `document:${docType}`,
    docType,
    label: DOC_LABELS[docType],
  })),
];

const BY_KEY = new Map(ALL_REMEDIATION_ITEMS.map((i) => [i.key, i]));

export const REMEDIATION_KEYS = ALL_REMEDIATION_ITEMS.map((i) => i.key);

export function isRemediationKey(key: unknown): key is string {
  return typeof key === "string" && BY_KEY.has(key);
}

/** Maps stored keys to rich items, dropping anything unknown (schema drift safe). */
export function parseRemediationItems(raw: unknown): RemediationItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: RemediationItem[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string" || seen.has(entry)) continue;
    const item = BY_KEY.get(entry);
    if (!item) continue;
    seen.add(entry);
    out.push(item);
  }
  return out;
}

export function remediationLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}
