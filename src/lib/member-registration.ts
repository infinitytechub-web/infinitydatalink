/**
 * Shared registration biodata helpers (client-safe).
 *
 * Ghana Card is stored canonically as `GHA-XXXXXXXXXX` (10 digits). Forms
 * capture only the digits; the `GHA-` prefix is fixed in the UI.
 */
export const GHANA_CARD_DIGITS = 10;
export const GHANA_CARD_PREFIX = "GHA-";
export const GHANA_CARD_REGEX = /^GHA-\d{10}$/;

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
  return `${GHANA_CARD_PREFIX}${digits}`;
}

export function isValidGhanaCard(value: string): boolean {
  return GHANA_CARD_REGEX.test(value.trim());
}

/**
 * Normalize a Ghana telephone number to `+233XXXXXXXXX`.
 * Accepts `0XXXXXXXXX`, `233XXXXXXXXX`, `+233XXXXXXXXX` with any spacing.
 */
export function normalizePhone(input: string): string | null {
  const raw = input.replace(/[\s()-]/g, "");
  if (/^0\d{9}$/.test(raw)) return `+233${raw.slice(1)}`;
  if (/^\+233\d{9}$/.test(raw)) return raw;
  if (/^233\d{9}$/.test(raw)) return `+${raw}`;
  return null;
}
