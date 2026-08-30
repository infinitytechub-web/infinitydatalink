/**
 * Minor-specific KYC workflow rules.
 *
 * Members flagged `is_minor` (under 18, derived from date of birth by the
 * `profiles_set_minor_flag` trigger) cannot be decided with the ordinary
 * one-click compliance flow. Every admin decision on a minor must additionally:
 *
 *  1. name a verified guardian on file (next-of-kin with a guardian-type
 *     relationship and a reachable phone number),
 *  2. carry a guardian consent reference (the signed consent/undertaking on
 *     record) plus explicit guardian-identity and safeguarding attestations,
 *  3. carry a longer decision note than an adult review, and
 *  4. be individually reviewed and re-authenticated — bulk decisions are
 *     refused for minors.
 *
 * Pure module: shared by the server functions and the admin UI so both apply
 * exactly the same rules.
 */
import { z } from "zod";

/** Relationship values that qualify as a legal guardian for a minor. */
export const GUARDIAN_RELATIONSHIP_KEYWORDS = [
  "parent",
  "mother",
  "father",
  "guardian",
  "grandparent",
  "grandmother",
  "grandfather",
  "next of kin (guardian)",
] as const;

/** Minimum characters required in the decision note for a minor review. */
export const MINOR_DECISION_NOTE_MIN = 20;

export const minorReviewSchema = z.object({
  /** Which next-of-kin record was verified as the acting guardian. */
  guardian_nok_id: z.string().uuid(),
  /** Reference of the signed guardian consent held on file. */
  guardian_consent_ref: z.string().trim().min(4).max(120),
  /** Officer confirms the guardian's identity document was sighted. */
  guardian_id_verified: z.boolean(),
  /** Officer confirms the safeguarding checklist was completed. */
  safeguarding_ack: z.boolean(),
});

export type MinorReview = z.infer<typeof minorReviewSchema>;

export type GuardianCandidate = {
  id: string;
  full_name: string | null;
  relationship: string | null;
  phone: string | null;
};

export function isGuardianRelationship(relationship: string | null | undefined): boolean {
  const value = (relationship ?? "").trim().toLowerCase();
  if (!value) return false;
  return GUARDIAN_RELATIONSHIP_KEYWORDS.some((k) => value.includes(k));
}

/** Guardian-eligible next-of-kin records (guardian relationship + phone on file). */
export function eligibleGuardians<T extends GuardianCandidate>(nextOfKin: readonly T[]): T[] {
  return nextOfKin.filter(
    (n) => isGuardianRelationship(n.relationship) && !!(n.phone ?? "").trim(),
  );
}

export type MinorGuardrailInput = {
  isMinor: boolean;
  decision: "approved" | "rejected";
  notes: string;
  minorReview: Partial<MinorReview> | null | undefined;
  nextOfKin: readonly GuardianCandidate[];
};

export type MinorGuardrailResult = {
  /** True when the extra minor review steps apply at all. */
  required: boolean;
  /** Human-readable reasons the decision cannot proceed. Empty = may proceed. */
  blockers: string[];
};

/**
 * Single source of truth for "may this officer take this decision on a minor".
 * Returns every unmet requirement so the UI can list them and the server can
 * refuse with a precise message.
 */
export function evaluateMinorGuardrails(input: MinorGuardrailInput): MinorGuardrailResult {
  if (!input.isMinor) return { required: false, blockers: [] };

  const blockers: string[] = [];
  const guardians = eligibleGuardians(input.nextOfKin);

  if (guardians.length === 0) {
    blockers.push(
      "No guardian on file: add a next-of-kin with a parent/guardian relationship and a phone number.",
    );
  }

  if ((input.notes ?? "").trim().length < MINOR_DECISION_NOTE_MIN) {
    blockers.push(
      `Minor reviews need a decision note of at least ${MINOR_DECISION_NOTE_MIN} characters.`,
    );
  }

  const review = input.minorReview;
  if (!review) {
    blockers.push("Complete the guardian verification checklist before deciding.");
    return { required: true, blockers };
  }

  if (!review.guardian_nok_id || !guardians.some((g) => g.id === review.guardian_nok_id)) {
    blockers.push("Select the verified guardian from the member's next-of-kin records.");
  }
  if (
    !(review.guardian_consent_ref ?? "").trim() ||
    (review.guardian_consent_ref ?? "").trim().length < 4
  ) {
    blockers.push("Record the guardian consent reference held on file (min 4 characters).");
  }
  if (!review.guardian_id_verified) {
    blockers.push("Confirm the guardian's identity document was sighted.");
  }
  if (!review.safeguarding_ack) {
    blockers.push("Confirm the minor safeguarding checklist was completed.");
  }

  return { required: true, blockers };
}

/** Reason used when a bulk decision skips a minor. */
export const MINOR_BULK_BLOCKED_REASON =
  "Minor account: requires individual review with guardian verification and re-authentication.";
