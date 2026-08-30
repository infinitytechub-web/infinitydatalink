import { checkGhPhone } from "@/lib/gh-phone";

/**
 * Shared registration biodata helpers (client-safe).
 *
 * Ghana Card is stored canonically as `GHA-XXXXXXXXX-X`. Forms
 * capture only the digits; the `GHA-` prefix is fixed in the UI. The canonical
 * storage form is `GHA-XXXXXXXXX-X`, matching the printed card and the shared
 * national-ID validator, so registration and KYC compare identically.
 */
export const GHANA_CARD_DIGITS = 10;
export const GHANA_CARD_PREFIX = "GHA-";
/** Canonical form; the legacy undashed form is still accepted on input. */
export const GHANA_CARD_REGEX = /^GHA-\d{9}-\d$/;
export const GHANA_CARD_INPUT_REGEX = /^GHA-(\d{10}|\d{9}-\d)$/;

export const MEMBERSHIP_TYPES = [
  "individual",
  "group",
  "department",
  "institution",
] as const;
export type MembershipType = (typeof MEMBERSHIP_TYPES)[number];

export const MEMBERSHIP_TYPE_LABEL: Record<MembershipType, string> = {
  individual: "Individual",
  group: "Group",
  department: "Department",
  institution: "Institution",
};

export function isMembershipType(v: unknown): v is MembershipType {
  return typeof v === "string" && (MEMBERSHIP_TYPES as readonly string[]).includes(v);
}

/** Keep digits only, capped at the Ghana Card length. */
export function ghanaCardDigits(input: string): string {
  return input.replace(/\D/g, "").slice(0, GHANA_CARD_DIGITS);
}

/** Canonical storage form, or null when the digits are incomplete. */
export function toCanonicalGhanaCard(input: string): string | null {
  const digits = ghanaCardDigits(input);
  if (digits.length !== GHANA_CARD_DIGITS) return null;
  return `${GHANA_CARD_PREFIX}${digits.slice(0, 9)}-${digits.slice(9)}`;
}

export function isValidGhanaCard(value: string): boolean {
  return GHANA_CARD_INPUT_REGEX.test(value.trim().toUpperCase());
}

/**
 * Normalize a Ghana telephone number to `+233XXXXXXXXX`.
 * Strict: the number must be a supported 10-digit Ghana mobile number on a
 * recognised network. Validation is delegated to `@/lib/gh-phone` so every
 * capture point in the app (registration, KYC, payments, teller) shares one rule.
 */
export function normalizePhone(input: string): string | null {
  const check = checkGhPhone(input);
  if (!check.valid) return null;
  return `+233${check.phone.slice(1)}`;
}
