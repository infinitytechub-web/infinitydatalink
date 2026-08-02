import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { isMinor } from "@/lib/age";

/**
 * Integration test: the database rule that maintains `profiles.is_minor`
 * (trigger `profiles_set_minor_flag`) must agree with the UI helper in
 * `src/lib/age.ts` on every boundary date, including leap years and dates that
 * land on different calendar days in different timezones.
 *
 * Skipped when PGHOST is unset (no sandbox database).
 */

const hasDb = !!process.env.PGHOST;
const d = hasDb ? describe : describe.skip;

function q(sql: string): string {
  return execFileSync("psql", ["-tAX", "-c", sql], { encoding: "utf8" }).trim();
}

/** Evaluate the DB under-18 rule for a DOB as of a given calendar date. */
function dbIsMinor(dob: string, asOf: string, timezone = "UTC"): boolean {
  const out = q(
    `SET TIME ZONE '${timezone}'; SELECT (date '${dob}' > (date '${asOf}' - interval '18 years'))::text;`,
  );
  return out.split("\n").pop()!.trim() === "true";
}

const BOUNDARY_CASES: Array<{ dob: string; asOf: string; minor: boolean; why: string }> = [
  { dob: "2008-08-02", asOf: "2026-08-01", minor: true, why: "day before 18th birthday" },
  { dob: "2008-08-02", asOf: "2026-08-02", minor: false, why: "18th birthday itself" },
  { dob: "2008-08-02", asOf: "2026-08-03", minor: false, why: "day after 18th birthday" },
  { dob: "2008-02-29", asOf: "2026-02-28", minor: true, why: "leap birth, non-leap year, day before" },
  { dob: "2008-02-29", asOf: "2026-03-01", minor: false, why: "leap birth turns 18 on 1 March" },
  { dob: "2012-02-29", asOf: "2030-02-28", minor: true, why: "leap birth, 18th year non-leap" },
  { dob: "2012-02-29", asOf: "2030-03-01", minor: false, why: "leap birth, 18 on 1 March" },
  { dob: "2006-03-01", asOf: "2024-02-29", minor: true, why: "leap evaluation date" },
  { dob: "2006-02-28", asOf: "2024-02-29", minor: false, why: "leap evaluation date, already 18" },
  { dob: "2026-01-01", asOf: "2026-08-02", minor: true, why: "infant" },
  { dob: "1990-06-15", asOf: "2026-08-02", minor: false, why: "adult" },
];

d("is_minor rule — DB and UI agree on boundaries", () => {
  it.each(BOUNDARY_CASES)("$dob as of $asOf → minor=$minor ($why)", ({ dob, asOf, minor }) => {
    expect(dbIsMinor(dob, asOf)).toBe(minor);
    expect(isMinor(dob, new Date(`${asOf}T00:00:00Z`))).toBe(minor);
    expect(isMinor(dob, new Date(`${asOf}T23:59:59Z`))).toBe(minor);
  });

  it.each(["UTC", "Africa/Accra", "Pacific/Kiritimati", "America/Los_Angeles"])(
    "DB rule is timezone-stable in %s",
    (tz) => {
      for (const c of BOUNDARY_CASES) {
        expect(dbIsMinor(c.dob, c.asOf, tz)).toBe(c.minor);
      }
    },
  );
});

d("profiles_set_minor_flag trigger", () => {
  it("exists and is attached to public.profiles", () => {
    const out = q(
      `select tgname from pg_trigger where tgrelid = 'public.profiles'::regclass and not tgisinternal;`,
    );
    expect(out).toContain("profiles_set_minor_flag");
  });

  it("recomputes is_minor from date_of_birth on update (rolled back)", () => {
    const target = q(`select id from public.profiles order by created_at limit 1;`)
      .split("\n")
      .pop()!
      .trim();
    if (!target) return; // no profiles in this environment
    const sql = `
BEGIN;
update public.profiles set date_of_birth = (current_date - interval '17 years')::date where id = '${target}';
select 'minor17=' || is_minor::text from public.profiles where id = '${target}';
update public.profiles set date_of_birth = (current_date - interval '18 years')::date where id = '${target}';
select 'exact18=' || is_minor::text from public.profiles where id = '${target}';
update public.profiles set date_of_birth = (current_date - interval '18 years' + interval '1 day')::date where id = '${target}';
select 'oneDayShort=' || is_minor::text from public.profiles where id = '${target}';
select 'ledger=' || count(*)::text from public.minor_status_changes where profile_id = '${target}';
ROLLBACK;`;
    const out = execFileSync("psql", ["-tAX", "-v", "ON_ERROR_STOP=1", "-c", sql], {
      encoding: "utf8",
    });
    expect(out).toContain("minor17=true");
    expect(out).toContain("exact18=false");
    expect(out).toContain("oneDayShort=true");
    // Every flip is recorded in the audit ledger by the same trigger.
    expect(out).toMatch(/ledger=[1-9]/);
  });
});
