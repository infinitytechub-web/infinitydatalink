/**
 * Ghanaian national identification types with per-type validation.
 * Shared by registration, Profile & KYC, next of kin and admin review.
 */

export type NationalIdType = {
  code: string;
  label: string;
  /** Canonical example shown as placeholder / helper text */
  example: string;
  pattern: RegExp;
  /** Normalises user input before validation & storage (uppercase, trim). */
  normalize: (raw: string) => string;
  hint: string;
};

/** Trim, drop all whitespace (incl. non-breaking) and uppercase. */
const upper = (raw: string) => raw.trim().replace(/[\s\u00a0]+/g, "").toUpperCase();

/**
 * Strict compaction for ID types whose printed form never contains separators
 * (passport, SSNIT, TIN): trim, remove spaces, dashes, dots, slashes and
 * underscores, then uppercase. Guarantees "g-123 456 7" === "G1234567".
 */
const compact = (raw: string) => upper(raw).replace(/[-–—_./\\]+/g, "");


export const NATIONAL_ID_TYPES: NationalIdType[] = [
  {
    code: "ghana_card",
    label: "Ghana Card (National ID)",
    example: "GHA-123456789-0",
    pattern: /^GHA-\d{9}-\d$/,
    normalize: (raw) => {
      const value = upper(raw);
      // Only reformat digit-only input, or input already prefixed with GHA.
      // Any other letters (e.g. "ABC-123456789-0") must stay untouched so
      // validation rejects them instead of silently rewriting the prefix.
      if (/^(GHA)?[0-9-]+$/.test(value)) {
        const digits = value.replace(/[^0-9]/g, "");
        if (digits.length === 10) return `GHA-${digits.slice(0, 9)}-${digits.slice(9)}`;
      }
      return value;
    },
    hint: "Format: GHA-XXXXXXXXX-X",
  },
  {
    code: "voter_id",
    label: "Voter ID",
    example: "1234567890",
    pattern: /^\d{10,12}$/,
    normalize: (raw) => upper(raw).replace(/[^0-9]/g, ""),
    hint: "10 to 12 digits",
  },
  {
    code: "passport",
    label: "Ghanaian Passport",
    example: "G1234567",
    pattern: /^[A-Z]\d{7,8}$/,
    normalize: upper,
    hint: "One letter followed by 7-8 digits",
  },
  {
    code: "ssnit",
    label: "SSNIT Number",
    example: "C123456789012",
    pattern: /^[A-Z]\d{12}$/,
    normalize: upper,
    hint: "One letter followed by 12 digits",
  },
  {
    code: "drivers_license",
    label: "Driver's Licence",
    example: "AS-12345-20",
    pattern: /^[A-Z0-9-]{6,20}$/,
    normalize: upper,
    hint: "6 to 20 letters, digits or dashes",
  },
  {
    code: "nhis",
    label: "NHIS Card",
    example: "12345678",
    pattern: /^\d{8,10}$/,
    normalize: (raw) => upper(raw).replace(/[^0-9]/g, ""),
    hint: "8 to 10 digits",
  },
  {
    code: "tin",
    label: "Tax Identification Number (TIN)",
    example: "P0012345678",
    pattern: /^[A-Z]\d{10}$/,
    normalize: upper,
    hint: "One letter followed by 10 digits",
  },
  {
    code: "birth_certificate",
    label: "Birth Certificate (under 18)",
    example: "BC-2015-004521",
    pattern: /^[A-Z0-9/-]{6,24}$/,
    normalize: upper,
    hint: "Certificate number as printed",
  },
  {
    code: "other",
    label: "Other government ID",
    example: "ID-000123",
    pattern: /^[A-Z0-9/-]{4,40}$/,
    normalize: upper,
    hint: "4 to 40 letters, digits, slashes or dashes",
  },
];

export const DEFAULT_NATIONAL_ID_TYPE = "ghana_card";

export function findIdType(code: string | null | undefined): NationalIdType | null {
  if (!code) return null;
  return NATIONAL_ID_TYPES.find((t) => t.code === code) ?? null;
}

export function idTypeLabel(code: string | null | undefined): string {
  return findIdType(code)?.label ?? (code ? code : "—");
}

export function normalizeNationalId(code: string | null | undefined, value: string): string {
  const type = findIdType(code) ?? findIdType(DEFAULT_NATIONAL_ID_TYPE)!;
  return type.normalize(value);
}

/** Returns null when valid, otherwise a human-readable error message. */
export function validateNationalId(
  code: string | null | undefined,
  value: string | null | undefined,
): string | null {
  if (!value || !value.trim()) return null; // optional until KYC submission
  const type = findIdType(code);
  if (!type) return "Select a valid national ID type.";
  const normalized = type.normalize(value);
  if (!type.pattern.test(normalized)) {
    return `Invalid ${type.label}. ${type.hint} (e.g. ${type.example}).`;
  }
  return null;
}
