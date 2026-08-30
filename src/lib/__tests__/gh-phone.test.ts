import { describe, expect, it } from "vitest";
import {
  checkGhPhone,
  detectNetwork,
  formatGhPhone,
  ghPhoneOptionalSchema,
  ghPhoneSchema,
  normalizeGhPhone,
} from "@/lib/gh-phone";

describe("normalizeGhPhone", () => {
  it("strips formatting", () => {
    expect(normalizeGhPhone(" 024-123 4567 ")).toBe("0241234567");
  });
  it("handles +233 / 233 / 00233", () => {
    expect(normalizeGhPhone("+233241234567")).toBe("0241234567");
    expect(normalizeGhPhone("233241234567")).toBe("0241234567");
    expect(normalizeGhPhone("00233241234567")).toBe("0241234567");
  });
});

describe("detectNetwork", () => {
  const cases: Array<[string, string]> = [
    ["0241234567", "mtn"],
    ["0541234567", "mtn"],
    ["0591234567", "mtn"],
    ["0201234567", "telecel"],
    ["0501234567", "telecel"],
    ["0271234567", "airteltigo"],
    ["0561234567", "airteltigo"],
    ["0231234567", "glo"],
  ];
  for (const [num, net] of cases) {
    it(`${num} → ${net}`, () => expect(detectNetwork(num)).toBe(net));
  }
  it("rejects unsupported prefix", () => expect(detectNetwork("0221234567")).toBeNull());
});

describe("checkGhPhone", () => {
  it("accepts exactly 10 digits", () => {
    const r = checkGhPhone("0241234567");
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.networkLabel).toBe("MTN");
  });
  it("rejects 9 digits", () => {
    const r = checkGhPhone("024123456");
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toMatch(/short/i);
  });
  it("rejects 11 digits", () => {
    const r = checkGhPhone("02412345678");
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toMatch(/long/i);
  });
  it("rejects unsupported prefix", () => {
    expect(checkGhPhone("0221234567").valid).toBe(false);
  });
  it("rejects empty", () => expect(checkGhPhone("").valid).toBe(false));
});

describe("schemas", () => {
  it("canonicalises valid input", () => {
    expect(ghPhoneSchema.parse("+233 24 123 4567")).toBe("0241234567");
  });
  it("throws on short input", () => {
    expect(() => ghPhoneSchema.parse("024123")).toThrow();
  });
  it("optional passes null through", () => {
    expect(ghPhoneOptionalSchema.parse("")).toBeNull();
    expect(ghPhoneOptionalSchema.parse(null)).toBeNull();
    expect(() => ghPhoneOptionalSchema.parse("0221234567")).toThrow();
  });
});

describe("formatGhPhone", () => {
  it("groups digits", () => expect(formatGhPhone("0241234567")).toBe("024 123 4567"));
});
