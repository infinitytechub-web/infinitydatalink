/**
 * KYC status-transition rules shared by single and bulk admin decisions.
 *
 * A reviewer may only decide a submission that is actually reviewable, and an
 * approval may only be recorded once the member has supplied every required
 * profile field and identity document. This is the server-side gate that makes
 * "full access only after approval" meaningful: `profiles.kyc` can never reach
 * `active` from an incomplete submission.
 */

export const KYC_REQUIRED_PROFILE_FIELDS = [
  "full_name",
  "phone",
  "date_of_birth",
  "gender",
  "region",
  "district",
  "address_line",
  "national_id_type",
  "national_id",
] as const;

export const KYC_REQUIRED_DOC_TYPES = [
  "national_id_front",
  "national_id_back",
  "selfie",
] as const;

const FIELD_LABEL: Record<string, string> = {
  full_name: "Full name",
  phone: "Telephone number",
  date_of_birth: "Date of birth",
  gender: "Gender",
  region: "Region",
  district: "District",
  address_line: "Residential address",
  national_id_type: "National ID type",
  national_id: "National ID number",
};

const DOC_LABEL: Record<string, string> = {
  national_id_front: "National ID (front)",
  national_id_back: "National ID (back)",
  selfie: "Selfie photo",
};

export type KycTransitionCheck = {
  from: string;
  to: "active" | "rejected";
  missing_fields: string[];
  missing_documents: string[];
};

/**
 * Throws when the requested transition is not allowed; otherwise returns the
 * transition metadata for the audit trail.
 */
export async function assertKycDecidable(
  sb: { from: (t: string) => any },
  memberId: string,
  decision: "approved" | "rejected",
): Promise<KycTransitionCheck> {
  const [{ data: profile }, { data: docs }] = await Promise.all([
    sb
      .from("profiles")
      .select(
        "id, kyc, full_name, phone, date_of_birth, gender, region, district, address_line, national_id_type, national_id",
      )
      .eq("id", memberId)
      .maybeSingle(),
    sb.from("kyc_documents").select("doc_type").eq("member_id", memberId),
  ]);

  if (!profile) throw new Error("Member not found");

  const from = String((profile as any).kyc ?? "pending");
  const to: "active" | "rejected" = decision === "approved" ? "active" : "rejected";

  if (from === to) {
    throw new Error(
      to === "active"
        ? "This member is already verified. A new submission is required before re-approving."
        : "This submission is already rejected and awaiting the member's revisions.",
    );
  }

  const submittedTypes = new Set(((docs ?? []) as any[]).map((d) => String(d.doc_type)));
  const missingFields = KYC_REQUIRED_PROFILE_FIELDS.filter(
    (f) => !(profile as any)[f] || String((profile as any)[f]).trim() === "",
  ).map((f) => FIELD_LABEL[f] ?? f);
  const missingDocs = KYC_REQUIRED_DOC_TYPES.filter((t) => !submittedTypes.has(t)).map(
    (t) => DOC_LABEL[t] ?? t,
  );

  if (decision === "approved" && (missingFields.length > 0 || missingDocs.length > 0)) {
    const parts = [
      ...(missingFields.length ? [`details: ${missingFields.join(", ")}`] : []),
      ...(missingDocs.length ? [`documents: ${missingDocs.join(", ")}`] : []),
    ];
    throw new Error(
      `This submission is incomplete and cannot be approved — missing ${parts.join("; ")}. Reject with revision items instead.`,
    );
  }

  return { from, to, missing_fields: missingFields, missing_documents: missingDocs };
}
