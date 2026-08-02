import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  nationalIdKey,
  normalizeNationalId,
  isSameNationalId,
  validateNationalId,
} from "@/lib/ghana-id-types";

/**
 * Normalization must be identical in the UI, the server functions and the
 * database triggers, otherwise the same document typed with different spacing,
 * dashes or case slips past duplicate detection.
 */

const CASES: Array<{ type: string; raw: string; normalized: string }> = [
  { type: "ghana_card", raw: "  gha-123456789-0 ", normalized: "GHA-123456789-0" },
  { type: "ghana_card", raw: "GHA1234567890", normalized: "GHA-123456789-0" },
  { type: "ghana_card", raw: "gha 123 456 789 0", normalized: "GHA-123456789-0" },
  { type: "ghana_card", raw: "1234567890", normalized: "GHA-123456789-0" },
  { type: "passport", raw: " g-123 4567 ", normalized: "G1234567" },
  { type: "passport", raw: "g1234567", normalized: "G1234567" },
  { type: "ssnit", raw: "c-123 456 789 012", normalized: "C123456789012" },
  { type: "tin", raw: "p 0012345678", normalized: "P0012345678" },
  { type: "voter_id", raw: " 123-456-7890 ", normalized: "1234567890" },
  { type: "nhis", raw: "1234 5678", normalized: "12345678" },
];

describe("national ID normalization", () => {
  it.each(CASES)("$type: '$raw' → $normalized", ({ type, raw, normalized }) => {
    expect(normalizeNationalId(type, raw)).toBe(normalized);
    expect(validateNationalId(type, raw)).toBeNull();
  });

  it("treats formatting variants of the same document as duplicates", () => {
    expect(isSameNationalId("ghana_card", "GHA-123456789-0", "ghana_card", "gha 1234567890")).toBe(true);
    expect(isSameNationalId("passport", "G1234567", "passport", " g-123 4567 ")).toBe(true);
    expect(isSameNationalId("ghana_card", "GHA-123456789-0", "ghana_card", "GHA-123456789-1")).toBe(false);
    expect(isSameNationalId("passport", "G1234567", "ssnit", "G1234567")).toBe(false);
  });

  it("returns no comparison key for blank values", () => {
    expect(nationalIdKey("ghana_card", "   ")).toBeNull();
    expect(nationalIdKey("passport", null)).toBeNull();
  });

  it("does not rewrite an invalid Ghana Card prefix", () => {
    expect(normalizeNationalId("ghana_card", "abc-123456789-0")).toBe("ABC1234567890");
    expect(validateNationalId("ghana_card", "abc-123456789-0")).toMatch(/Invalid/);
  });
});

const hasDb = !!process.env.PGHOST;
const d = hasDb ? describe : describe.skip;

function q(sql: string): string {
  return execFileSync("psql", ["-tAX", "-c", sql], { encoding: "utf8" }).trim().split("\n").pop()!.trim();
}

d("database normalization matches the UI helpers", () => {
  it.each(CASES)("normalize_national_id($type, '$raw')", ({ type, raw, normalized }) => {
    expect(q(`select public.normalize_national_id('${type}', '${raw}');`)).toBe(normalized);
  });

  it.each(CASES)("national_id_key parity for $type '$raw'", ({ type, raw }) => {
    expect(q(`select public.national_id_key('${type}', '${raw}');`)).toBe(nationalIdKey(type, raw));
  });

  it("collapses dashes for non-Ghana-Card comparison keys", () => {
    expect(q(`select public.national_id_key('passport', 'G-123 4567');`)).toBe("passport:G1234567");
  });

  it("normalizes profile and next-of-kin writes via triggers", () => {
    const out = execFileSync(
      "psql",
      [
        "-tAX",
        "-c",
        `select tgname from pg_trigger where not tgisinternal and tgname in ('profiles_normalize_ids_trg','next_of_kin_normalize_ids_trg');`,
      ],
      { encoding: "utf8" },
    );
    expect(out).toContain("profiles_normalize_ids_trg");
    expect(out).toContain("next_of_kin_normalize_ids_trg");
  });

  it("has no stored IDs left in non-canonical form", () => {
    expect(
      q(
        `select count(*) from public.profiles where ghana_card is not null and ghana_card <> public.normalize_national_id('ghana_card', ghana_card);`,
      ),
    ).toBe("0");
    expect(
      q(
        `select count(*) from public.profiles where national_id is not null and national_id <> public.normalize_national_id(coalesce(national_id_type,'ghana_card'), national_id);`,
      ),
    ).toBe("0");
    expect(
      q(
        `select count(*) from public.next_of_kin where national_id is not null and national_id <> public.normalize_national_id(coalesce(national_id_type,'ghana_card'), national_id);`,
      ),
    ).toBe("0");
  });
});
