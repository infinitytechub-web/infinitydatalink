/**
 * Centralised Ghana mobile-number validation and network detection.
 *
 * Single source of truth used by every form (registration, KYC, profile,
 * next-of-kin, teller, payments) AND by the matching server-side validators, so
 * the rule cannot be bypassed by a crafted request.
 *
 * Canonical stored form: exactly 10 digits, leading `0` (e.g. `0241234567`).
 */
import { z } from "zod";

export const GH_NETWORKS = ["mtn", "telecel", "airteltigo", "glo"] as const;
export type GhNetwork = (typeof GH_NETWORKS)[number];

export const NETWORK_LABELS: Record<GhNetwork, string> = {
  mtn: "MTN",
  telecel: "Telecel",
  airteltigo: "AirtelTigo / AT",
  glo: "Glo",
};

/** Prefix → network. Source: NCA Ghana numbering plan. */
const PREFIX_NETWORK: Record<string, GhNetwork> = {
  "024": "mtn",
  "025": "mtn",
  "053": "mtn",
  "054": "mtn",
  "055": "mtn",
  "059": "mtn",
  "020": "telecel",
  "050": "telecel",
  "026": "airteltigo",
  "027": "airteltigo",
  "056": "airteltigo",
  "057": "airteltigo",
  "023": "glo",
};

export const SUPPORTED_PREFIXES = Object.keys(PREFIX_NETWORK).sort();

/**
 * Strip formatting and international prefixes down to the canonical local form.
 * Returns digits only; may still be an invalid length (caller validates).
 */
export function normalizeGhPhone(input: string | null | undefined): string {
  let digits = String(input ?? "").replace(/[^\d+]/g, "");
  digits = digits.replace(/^\+/, "");
  if (digits.startsWith("00233")) digits = digits.slice(5);
  else if (digits.startsWith("233")) digits = digits.slice(3);
  // National significant number is 9 digits; restore the trunk zero.
  if (digits.length === 9 && !digits.startsWith("0")) digits = `0${digits}`;
  return digits;
}

export function detectNetwork(input: string | null | undefined): GhNetwork | null {
  const n = normalizeGhPhone(input);
  if (n.length !== 10) return null;
  return PREFIX_NETWORK[n.slice(0, 3)] ?? null;
}

export type PhoneCheck =
  | { valid: true; phone: string; network: GhNetwork; networkLabel: string }
  | { valid: false; phone: string; error: string };

/** Full validation + network detection in one call. */
export function checkGhPhone(input: string | null | undefined): PhoneCheck {
  const phone = normalizeGhPhone(input);
  if (phone.length === 0) return { valid: false, phone, error: "Enter a mobile number" };
  if (!/^\d+$/.test(phone)) return { valid: false, phone, error: "Digits only" };
  if (phone.length < 10) {
    return { valid: false, phone, error: `Too short — ${phone.length}/10 digits` };
  }
  if (phone.length > 10) {
    return { valid: false, phone, error: `Too long — ${phone.length}/10 digits` };
  }
  if (!phone.startsWith("0")) {
    return { valid: false, phone, error: "Ghanaian numbers start with 0" };
  }
  const network = PREFIX_NETWORK[phone.slice(0, 3)];
  if (!network) {
    return { valid: false, phone, error: `Unsupported network prefix ${phone.slice(0, 3)}` };
  }
  return { valid: true, phone, network, networkLabel: NETWORK_LABELS[network] };
}

export function isValidGhPhone(input: string | null | undefined): boolean {
  return checkGhPhone(input).valid;
}

/** Display form: 024 123 4567 */
export function formatGhPhone(input: string | null | undefined): string {
  const n = normalizeGhPhone(input);
  if (n.length !== 10) return n;
  return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
}

/** Zod schema producing the canonical 10-digit form. Use in every validator. */
export const ghPhoneSchema = z
  .string()
  .trim()
  .transform((v) => normalizeGhPhone(v))
  .superRefine((val, ctx) => {
    const res = checkGhPhone(val);
    if (!res.valid) ctx.addIssue({ code: "custom", message: res.error });
  });

/** Optional variant: empty string / null passes through as null. */
export const ghPhoneOptionalSchema = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v == null || v.trim() === "" ? null : normalizeGhPhone(v)))
  .superRefine((val, ctx) => {
    if (val == null) return;
    const res = checkGhPhone(val);
    if (!res.valid) ctx.addIssue({ code: "custom", message: res.error });
  });
