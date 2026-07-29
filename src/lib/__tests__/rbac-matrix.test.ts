import { describe, expect, it } from "vitest";
import { canDecide, assertDecisionPermission, requiresStepUp } from "@/lib/rbac-matrix";
import type { Role } from "@/lib/role-guards";

const set = (...r: Role[]) => new Set<Role>(r);

describe("fine-grained decision RBAC", () => {
  it("lets the right officer take the right decision", () => {
    expect(canDecide(set("loan_officer"), "loan", "approved")).toBe(true);
    expect(canDecide(set("finance_officer"), "withdrawal", "paid")).toBe(true);
    expect(canDecide(set("compliance_officer"), "kyc", "approved")).toBe(true);
  });

  it("blocks cross-module decisions", () => {
    expect(canDecide(set("loan_officer"), "withdrawal", "approved")).toBe(false);
    expect(canDecide(set("finance_officer"), "loan", "approved")).toBe(false);
    expect(canDecide(set("auditor"), "loan", "rejected")).toBe(false);
    expect(canDecide(set("member"), "loan", "approved")).toBe(false);
  });

  it("always allows super_admin and restricts settings to them", () => {
    expect(canDecide(set("super_admin"), "settings", "approved")).toBe(true);
    expect(canDecide(set("finance_officer"), "settings", "approved")).toBe(false);
  });

  it("throws with the allowed roles listed", () => {
    expect(() => assertDecisionPermission(set("auditor"), "loan", "approved")).toThrow(
      /loan_officer/,
    );
  });

  it("requires step-up for audited decisions", () => {
    expect(requiresStepUp("loan", "approved")).toBe(true);
    expect(requiresStepUp("withdrawal", "paid")).toBe(true);
  });
});
