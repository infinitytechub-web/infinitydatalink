import { describe, expect, it } from "vitest";
import {
  MINOR_DECISION_NOTE_MIN,
  eligibleGuardians,
  evaluateMinorGuardrails,
  isGuardianRelationship,
} from "@/lib/kyc-minor-rules";

const guardian = { id: "11111111-1111-1111-1111-111111111111", full_name: "Ama", relationship: "Mother", phone: "0244000000" };
const sibling = { id: "22222222-2222-2222-2222-222222222222", full_name: "Kojo", relationship: "Brother", phone: "0244000001" };

const goodReview = {
  guardian_nok_id: guardian.id,
  guardian_consent_ref: "CONSENT-2026-001",
  guardian_id_verified: true,
  safeguarding_ack: true,
};

describe("minor KYC guardrails", () => {
  it("recognises guardian relationships only", () => {
    expect(isGuardianRelationship("Legal Guardian")).toBe(true);
    expect(isGuardianRelationship("father")).toBe(true);
    expect(isGuardianRelationship("Brother")).toBe(false);
    expect(isGuardianRelationship(null)).toBe(false);
  });

  it("requires a guardian with a phone number", () => {
    expect(eligibleGuardians([guardian, sibling, { ...guardian, id: "x", phone: "" }])).toHaveLength(1);
  });

  it("does not apply to adults", () => {
    const res = evaluateMinorGuardrails({
      isMinor: false,
      decision: "approved",
      notes: "",
      minorReview: null,
      nextOfKin: [],
    });
    expect(res).toEqual({ required: false, blockers: [] });
  });

  it("blocks a minor decision with no checklist", () => {
    const res = evaluateMinorGuardrails({
      isMinor: true,
      decision: "approved",
      notes: "ok",
      minorReview: null,
      nextOfKin: [guardian],
    });
    expect(res.required).toBe(true);
    expect(res.blockers.length).toBeGreaterThan(0);
  });

  it("blocks when no guardian is on file", () => {
    const res = evaluateMinorGuardrails({
      isMinor: true,
      decision: "approved",
      notes: "x".repeat(MINOR_DECISION_NOTE_MIN),
      minorReview: goodReview,
      nextOfKin: [sibling],
    });
    expect(res.blockers.some((b) => /No guardian on file/.test(b))).toBe(true);
  });

  it("blocks a short note and missing attestations", () => {
    const res = evaluateMinorGuardrails({
      isMinor: true,
      decision: "rejected",
      notes: "too short",
      minorReview: { ...goodReview, safeguarding_ack: false, guardian_id_verified: false },
      nextOfKin: [guardian],
    });
    expect(res.blockers).toHaveLength(3);
  });

  it("passes a complete minor review", () => {
    const res = evaluateMinorGuardrails({
      isMinor: true,
      decision: "approved",
      notes: "Guardian consent sighted and safeguarding checks completed.",
      minorReview: goodReview,
      nextOfKin: [guardian, sibling],
    });
    expect(res).toEqual({ required: true, blockers: [] });
  });
});
