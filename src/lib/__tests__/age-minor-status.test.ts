import { describe, expect, it } from "vitest";
import { resolveMinorStatus } from "@/lib/age";

const on = new Date("2026-08-02T00:00:00Z");

describe("resolveMinorStatus", () => {
  it("agrees with the DB flag for a minor", () => {
    const s = resolveMinorStatus("2010-01-01", true, on);
    expect(s.age).toBe(16);
    expect(s.effective).toBe(true);
    expect(s.mismatch).toBe(false);
  });

  it("prefers the date of birth and flags a stale DB flag", () => {
    const s = resolveMinorStatus("2008-01-01", true, on); // turned 18
    expect(s.age).toBe(18);
    expect(s.effective).toBe(false);
    expect(s.mismatch).toBe(true);
  });

  it("flags the reverse drift too", () => {
    const s = resolveMinorStatus("2012-06-01", false, on);
    expect(s.effective).toBe(true);
    expect(s.mismatch).toBe(true);
  });

  it("falls back to the DB flag with no date of birth", () => {
    expect(resolveMinorStatus(null, true, on).effective).toBe(true);
    expect(resolveMinorStatus(null, null, on).effective).toBe(false);
    expect(resolveMinorStatus(null, true, on).mismatch).toBe(false);
  });

  it("uses the calculation when no DB flag is supplied", () => {
    const s = resolveMinorStatus("2015-03-04", undefined, on);
    expect(s.effective).toBe(true);
    expect(s.stored).toBeNull();
    expect(s.mismatch).toBe(false);
  });

  it("treats an exact 18th birthday as an adult", () => {
    expect(resolveMinorStatus("2008-08-02", null, on).effective).toBe(false);
    expect(resolveMinorStatus("2008-08-03", null, on).effective).toBe(true);
  });
});
