import { ACTIONS, MODULES, type PermAction, type PermModule } from "@/lib/permissions";
import type { Role } from "@/lib/role-guards";

/** Roles whose capability grid can be edited. `super_admin` is immutable. */
export const EDITABLE_ROLES = [
  "admin",
  "manager",
  "compliance_officer",
  "loan_officer",
  "finance_officer",
  "auditor",
  "teller",
  "support_officer",
  "member",
] as const;

export type EditableRole = (typeof EDITABLE_ROLES)[number];

export function isEditableRole(role: string): role is EditableRole {
  return (EDITABLE_ROLES as readonly string[]).includes(role);
}

export function isValidCapability(cap: string): boolean {
  const [m, a] = cap.split(".");
  return (
    (MODULES as readonly string[]).includes(m ?? "") &&
    (ACTIONS as readonly string[]).includes(a ?? "")
  );
}

export function capabilityKey(module: PermModule, action: PermAction): string {
  return `${module}.${action}`;
}

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  compliance_officer: "Compliance Officer",
  loan_officer: "Loan Officer",
  finance_officer: "Finance Officer",
  auditor: "Auditor",
  teller: "Teller",
  support_officer: "Support Officer",
  member: "Member",
};
