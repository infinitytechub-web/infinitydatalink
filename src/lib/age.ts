/**
 * Date-of-birth helpers: dynamic age calculation and the under-18 rule used by
 * Profile & KYC, the member dashboard and admin review screens.
 *
 * The authoritative `is_minor` flag is maintained by the database trigger
 * `profiles_set_minor_flag`; these helpers keep the UI in sync without a
 * round trip.
 */

export const MINOR_AGE_THRESHOLD = 18;

/** Whole years between the date of birth and `on` (defaults to today). */
export function calculateAge(
  dateOfBirth: string | Date | null | undefined,
  on: Date = new Date(),
): number | null {
  if (!dateOfBirth) return null;
  const dob = typeof dateOfBirth === "string" ? new Date(`${dateOfBirth}T00:00:00Z`) : dateOfBirth;
  if (Number.isNaN(dob.getTime())) return null;

  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = on.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && on.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  if (age < 0 || age > 130) return null;
  return age;
}

export function isMinor(dateOfBirth: string | Date | null | undefined, on: Date = new Date()): boolean {
  const age = calculateAge(dateOfBirth, on);
  return age !== null && age < MINOR_AGE_THRESHOLD;
}

/** "34 years" / "17 years (under 18)" — safe for member-facing display. */
export function formatAge(dateOfBirth: string | Date | null | undefined): string {
  const age = calculateAge(dateOfBirth);
  if (age === null) return "—";
  return age < MINOR_AGE_THRESHOLD ? `${age} years (under 18)` : `${age} years`;
}

/** Next birthday in days — used for the member dashboard age card. */
export function daysToNextBirthday(dateOfBirth: string | null | undefined): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), dob.getUTCMonth(), dob.getUTCDate()),
  );
  if (next.getTime() < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
  }
  return Math.round((next.getTime() - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86_400_000);
}

/** Validation guard for DOB inputs (no future dates, sane range). */
export function validateDateOfBirth(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Use the date picker (YYYY-MM-DD).";
  const dob = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) return "Enter a valid date of birth.";
  if (dob.getTime() > Date.now()) return "Date of birth cannot be in the future.";
  const age = calculateAge(value);
  if (age === null) return "Enter a valid date of birth.";
  if (age > 120) return "Enter a valid date of birth.";
  return null;
}
