import { describe, it, expect } from "vitest";
import { validateNationalId, normalizeNationalId, NATIONAL_ID_TYPES } from "@/lib/ghana-id-types";

const ok = (t: string, v: string) => expect(validateNationalId(t, v), `${t}:${v}`).toBeNull();
const bad = (t: string, v: string) => expect(validateNationalId(t, v), `${t}:${v}`).toBeTruthy();

describe("national id validation", () => {
  it("accepts valid samples for every type", () => {
    for (const t of NATIONAL_ID_TYPES) ok(t.code, t.example);
  });
  it("normalises ghana card variants to canonical", () => {
    for (const raw of ["1234567890", "gha-123456789-0", " GHA 123456789 0 ", "GHA1234567890"])
      expect(normalizeNationalId("ghana_card", raw)).toBe("GHA-123456789-0");
  });
  it("rejects malformed values", () => {
    bad("ghana_card", "GHA-12345-0");
    bad("ghana_card", "ABC-123456789-0");
    bad("voter_id", "12345");
    bad("voter_id", "12345678901234");
    bad("passport", "GG123456");
    bad("ssnit", "C12345");
    bad("tin", "P123");
    bad("nhis", "123");
    bad("other", "ab");
    bad("unknown_type", "GHA-123456789-0");
  });
  it("treats empty as optional", () => {
    ok("ghana_card", "");
    ok("ghana_card", "   ");
  });
});
