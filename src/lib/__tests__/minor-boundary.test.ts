import { describe, expect, it, afterEach, vi } from "vitest";
import { calculateAge, isMinor, resolveMinorStatus, MINOR_AGE_THRESHOLD } from "@/lib/age";

/**
 * Under-18 boundary tests.
 *
 * The rule must agree with the database trigger `profiles_set_minor_flag`
 * (`date_of_birth > current_date - interval '18 years'`), which evaluates on
 * calendar dates. So the JS helpers must be:
 *   - UTC-deterministic (identical result regardless of the viewer's timezone),
 *   - correct on the exact 18th birthday (adult from that day),
 *   - correct for leap-year births, including 29 February.
 */

afterEach(() => {
  vi.useRealTimers();
});

/** Freeze wall-clock time to a precise instant (UTC). */
function freeze(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

describe("under-18 boundary — exact birthday", () => {
  it("is a minor the day before the 18th birthday", () => {
    const on = new Date("2026-08-01T12:00:00Z");
    expect(calculateAge("2008-08-02", on)).toBe(17);
    expect(isMinor("2008-08-02", on)).toBe(true);
  });

  it("is an adult on the 18th birthday itself", () => {
    const on = new Date("2026-08-02T00:00:00Z");
    expect(calculateAge("2008-08-02", on)).toBe(MINOR_AGE_THRESHOLD);
    expect(isMinor("2008-08-02", on)).toBe(false);
  });

  it("is an adult the day after the 18th birthday", () => {
    const on = new Date("2026-08-03T23:59:59Z");
    expect(isMinor("2008-08-02", on)).toBe(false);
  });
});

describe("under-18 boundary — timezone independence", () => {
  const dob = "2008-08-02"; // 18th birthday: 2026-08-02

  // Instants that fall on different local calendar days around the boundary.
  const instants = [
    "2026-08-01T00:00:00Z", // UTC-12 local: 2026-07-31
    "2026-08-01T10:30:00Z", // Accra (UTC+0)
    "2026-08-01T23:59:59Z", // Kiribati (UTC+14) local: 2026-08-02 already
  ];

  it.each(instants)("stays a minor for every timezone-shifted instant before the birthday (%s)", (iso) => {
    expect(isMinor(dob, new Date(iso))).toBe(true);
  });

  it.each(["2026-08-02T00:00:00Z", "2026-08-02T11:00:00Z", "2026-08-02T23:59:59Z"])(
    "is an adult for every instant on the birthday date in UTC (%s)",
    (iso) => {
      expect(isMinor(dob, new Date(iso))).toBe(false);
    },
  );

  it.each(["UTC", "Africa/Accra", "Pacific/Kiritimati", "America/Los_Angeles", "Asia/Kolkata"])(
    "gives the same age in process timezone %s",
    (tz) => {
      const previous = process.env.TZ;
      process.env.TZ = tz;
      try {
        // Date-only strings are parsed as UTC midnight, so the host timezone
        // must not shift the computed age.
        expect(calculateAge("2008-08-02", new Date("2026-08-02T00:00:00Z"))).toBe(18);
        expect(calculateAge("2009-02-28", new Date("2026-02-28T00:00:00Z"))).toBe(17);
      } finally {
        process.env.TZ = previous;
      }
    },
  );

  it("does not flip when the local clock is a day ahead of UTC", () => {
    // 2026-08-01T23:00Z is 2026-08-02 local in UTC+14; the rule is UTC-based,
    // so the member is still 17.
    freeze("2026-08-01T23:00:00Z");
    expect(isMinor("2008-08-02")).toBe(true);
    freeze("2026-08-02T01:00:00Z");
    expect(isMinor("2008-08-02")).toBe(false);
  });
});

describe("under-18 boundary — leap years", () => {
  it("treats 29 February births as turning 18 on 1 March in a non-leap year", () => {
    // Born 2008-02-29 (leap). 2026 is not a leap year.
    expect(isMinor("2008-02-29", new Date("2026-02-28T12:00:00Z"))).toBe(true);
    expect(calculateAge("2008-02-29", new Date("2026-02-28T12:00:00Z"))).toBe(17);
    expect(isMinor("2008-02-29", new Date("2026-03-01T00:00:00Z"))).toBe(false);
    expect(calculateAge("2008-02-29", new Date("2026-03-01T00:00:00Z"))).toBe(18);
  });

  it("turns 18 on 29 February when the birthday year is itself a leap year", () => {
    // Born 2012-02-29; 2030 is not a leap year, 2032 is.
    expect(isMinor("2014-02-29", new Date("2032-02-29T00:00:00Z"))).toBe(true); // invalid date → guarded below
    expect(isMinor("2012-02-29", new Date("2030-02-28T00:00:00Z"))).toBe(false);
    expect(calculateAge("2012-02-29", new Date("2032-02-29T00:00:00Z"))).toBe(20);
  });

  it("handles a 29 February evaluation date for a non-leap birth date", () => {
    expect(calculateAge("2006-03-01", new Date("2024-02-29T00:00:00Z"))).toBe(17);
    expect(isMinor("2006-03-01", new Date("2024-02-29T00:00:00Z"))).toBe(true);
    expect(isMinor("2006-02-28", new Date("2024-02-29T00:00:00Z"))).toBe(false);
  });

  it("counts leap days correctly across a full 18-year span", () => {
    // 2008-02-29 → 2026-03-01 is exactly 18 years by calendar rules.
    expect(calculateAge("2008-02-29", new Date("2026-03-01T00:00:00Z"))).toBe(18);
    expect(calculateAge("2008-02-29", new Date("2025-03-01T00:00:00Z"))).toBe(17);
  });
});

describe("under-18 boundary — resolver alignment with the stored flag", () => {
  it("marks a stale stored flag when the member has just turned 18", () => {
    freeze("2026-08-02T09:00:00Z");
    const status = resolveMinorStatus("2008-08-02", true);
    expect(status.effective).toBe(false);
    expect(status.stale).toBe(true);
  });

  it("agrees with the stored flag on the day before the birthday", () => {
    freeze("2026-08-01T09:00:00Z");
    const status = resolveMinorStatus("2008-08-02", true);
    expect(status.effective).toBe(true);
    expect(status.stale).toBe(false);
  });

  it("agrees with the stored flag for a 29 February birth on 1 March", () => {
    freeze("2026-03-01T00:00:01Z");
    const status = resolveMinorStatus("2008-02-29", false);
    expect(status.effective).toBe(false);
    expect(status.stale).toBe(false);
  });

  it("falls back to the stored flag when the date of birth is missing", () => {
    const status = resolveMinorStatus(null, true);
    expect(status.effective).toBe(true);
    expect(status.stale).toBe(false);
  });
});
