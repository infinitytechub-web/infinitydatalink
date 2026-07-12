import { describe, expect, it } from "vitest";
import {
  ADMIN_ROLES,
  FINANCE_ROLES,
  KYC_ADMIN_ROLES,
  LOAN_DECISION_ROLES,
  SUPER_ADMIN_ONLY,
  assertAnyRole,
  hasAnyRole,
  rolesFromRows,
  type Role,
} from "@/lib/role-guards";
import { ROLE_PERMISSIONS, type AppRole } from "@/lib/auth";

// The full universe of role identifiers the server may see.
const EVERY_ROLE: Role[] = [
  "super_admin",
  "compliance_officer",
  "loan_officer",
  "finance_officer",
  "auditor",
  "member",
];

// Which routes/endpoints each role should be allowed to reach.
// Sourced from server-fn assertAdmin / assertKycAdmin / policy layers.
const ENDPOINT_MATRIX: Record<string, readonly Role[]> = {
  // Any admin surface (portal shell + read-only admin RPCs)
  "/admin/*": ADMIN_ROLES,
  // Loan decisioning + disbursement + repayment recording
  "loans:decide/disburse/repay": [...LOAN_DECISION_ROLES, "finance_officer"],
  // Finance-only settlement flow
  "transactions:finalize": FINANCE_ROLES,
  // KYC review queue + document decisions
  "kyc:review": KYC_ADMIN_ROLES,
  // Super-admin governance surfaces
  "/admin/super-admins + role grant/revoke": SUPER_ADMIN_ONLY,
};

describe("role-guards: hasAnyRole / assertAnyRole", () => {
  it("recognises admin roles", () => {
    for (const r of ADMIN_ROLES) {
      expect(hasAnyRole(new Set([r]), ADMIN_ROLES)).toBe(true);
    }
  });

  it("rejects members from admin gates", () => {
    expect(hasAnyRole(new Set(["member"]), ADMIN_ROLES)).toBe(false);
    expect(() => assertAnyRole(new Set(["member"]), ADMIN_ROLES)).toThrow(/Forbidden/);
  });

  it("rejects empty role sets", () => {
    expect(hasAnyRole(new Set(), ADMIN_ROLES)).toBe(false);
    expect(() => assertAnyRole(new Set(), SUPER_ADMIN_ONLY, "super_admin")).toThrow(
      /super_admin role required/,
    );
  });

  it("rolesFromRows filters unknown values", () => {
    const rows = [{ role: "super_admin" }, { role: "not_a_role" }, { role: "member" }];
    const set = rolesFromRows(rows);
    expect(set.has("super_admin")).toBe(true);
    expect(set.has("member")).toBe(true);
    expect(set.size).toBe(2);
  });
});

describe("Endpoint access matrix — enforce super_admin & role boundaries", () => {
  for (const [endpoint, allowed] of Object.entries(ENDPOINT_MATRIX)) {
    for (const role of EVERY_ROLE) {
      const shouldAllow = allowed.includes(role);
      it(`${role} ${shouldAllow ? "CAN" : "CANNOT"} reach ${endpoint}`, () => {
        const roles = new Set<Role>([role]);
        if (shouldAllow) {
          expect(() => assertAnyRole(roles, allowed, "role")).not.toThrow();
        } else {
          expect(() => assertAnyRole(roles, allowed, "role")).toThrow(/Forbidden/);
        }
      });
    }
  }

  it("super_admin can reach every guarded endpoint", () => {
    const roles = new Set<Role>(["super_admin"]);
    for (const allowed of Object.values(ENDPOINT_MATRIX)) {
      expect(hasAnyRole(roles, allowed)).toBe(true);
    }
  });

  it("member cannot reach any admin endpoint", () => {
    const roles = new Set<Role>(["member"]);
    for (const [endpoint, allowed] of Object.entries(ENDPOINT_MATRIX)) {
      expect(hasAnyRole(roles, allowed), `expected member to be blocked from ${endpoint}`).toBe(
        false,
      );
    }
  });
});

describe("Permission map — super_admin is a strict superset of every admin permission", () => {
  const sa = new Set(ROLE_PERMISSIONS.super_admin);
  const admin: AppRole[] = ["compliance_officer", "loan_officer", "finance_officer", "auditor"];

  for (const r of admin) {
    it(`${r} permissions are all present in super_admin`, () => {
      for (const p of ROLE_PERMISSIONS[r]) expect(sa.has(p)).toBe(true);
    });
  }

  it("member permissions are only self-scoped", () => {
    for (const p of ROLE_PERMISSIONS.member) expect(p.startsWith("export:own_")).toBe(true);
  });

  it("no role has both admin export and self-only member exports blended", () => {
    for (const r of admin) {
      for (const p of ROLE_PERMISSIONS[r]) expect(p.startsWith("export:own_")).toBe(false);
    }
  });
});
