/**
 * Central masking helpers for contact PII (phone numbers, email addresses).
 *
 * Sensitive contact columns are revoked from `anon`/`authenticated` at the
 * database level, so they are only ever read through role-checked server
 * functions. Roles that need to *identify* a contact without needing to reach
 * them (read-only auditors, for example) receive a masked value produced here.
 */

export function maskPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D+/g, "");
  if (digits.length < 4) return "•••";
  return `${"•".repeat(Math.max(digits.length - 3, 3))}${digits.slice(-3)}`;
}

export function maskEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const at = value.indexOf("@");
  if (at < 1) return "•••";
  const user = value.slice(0, at);
  const domain = value.slice(at + 1);
  const head = user.slice(0, 1);
  return `${head}${"•".repeat(Math.max(user.length - 1, 2))}@${domain}`;
}

/** Roles allowed to see raw contact details on guarantor / entity records. */
const FULL_CONTACT_ROLES = new Set([
  "super_admin",
  "compliance_officer",
  "loan_officer",
  "finance_officer",
  "support_officer",
]);

export function canSeeRawContacts(roles: Iterable<string>): boolean {
  for (const r of roles) if (FULL_CONTACT_ROLES.has(r)) return true;
  return false;
}
