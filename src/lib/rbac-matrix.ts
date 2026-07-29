/**
 * Fine-grained RBAC matrix for staff decisions.
 *
 * `role-guards.ts` answers "is this person staff?" — this module answers
 * "may THIS role take THIS specific decision on THIS module?", and whether the
 * decision is sensitive enough to require a fresh re-authentication (step-up).
 */
import type { Role } from "@/lib/role-guards";
import type { DecisionModule, DecisionOutcome } from "@/lib/decision-audit";

export type Capability = `${DecisionModule}.${DecisionOutcome}`;

const SUPER = "super_admin" as const;

/** Roles allowed to take each decision. `super_admin` is always implicitly allowed. */
export const DECISION_PERMISSIONS: Partial<Record<Capability, readonly Role[]>> = {
  "loan.approved": ["loan_officer"],
  "loan.rejected": ["loan_officer"],

  "withdrawal.approved": ["finance_officer"],
  "withdrawal.rejected": ["finance_officer"],
  "withdrawal.paid": ["finance_officer"],
  "withdrawal.cancelled": ["finance_officer"],

  "payment.approved": ["finance_officer"],
  "payment.rejected": ["finance_officer"],
  "payment.paid": ["finance_officer"],

  "expense.approved": ["finance_officer"],
  "expense.rejected": ["finance_officer"],
  "expense.paid": ["finance_officer"],

  "transfer.approved": ["finance_officer"],
  "transfer.rejected": ["finance_officer"],

  "dividend.approved": ["finance_officer"],
  "dividend.rejected": ["finance_officer"],

  "kyc.approved": ["compliance_officer"],
  "kyc.rejected": ["compliance_officer"],
  "kyc.cleared": ["compliance_officer"],

  "user.approved": ["compliance_officer"],
  "user.rejected": ["compliance_officer"],
  "user.activated": ["compliance_officer"],
  "user.deactivated": ["compliance_officer"],

  "entity.approved": ["compliance_officer"],
  "entity.rejected": ["compliance_officer"],
  "entity.activated": ["compliance_officer"],
  "entity.deactivated": ["compliance_officer"],

  "settings.approved": [],
  "settings.rejected": [],
};

export function capability(module: DecisionModule, outcome: DecisionOutcome): Capability {
  return `${module}.${outcome}` as Capability;
}

export function rolesForDecision(module: DecisionModule, outcome: DecisionOutcome): readonly Role[] {
  return [SUPER, ...(DECISION_PERMISSIONS[capability(module, outcome)] ?? [])];
}

export function canDecide(
  roles: ReadonlySet<Role>,
  module: DecisionModule,
  outcome: DecisionOutcome,
): boolean {
  return rolesForDecision(module, outcome).some((r) => roles.has(r));
}

export function assertDecisionPermission(
  roles: ReadonlySet<Role>,
  module: DecisionModule,
  outcome: DecisionOutcome,
): void {
  if (!canDecide(roles, module, outcome)) {
    const allowed = rolesForDecision(module, outcome).join(", ");
    throw new Error(
      `Forbidden: ${capability(module, outcome)} requires one of these roles: ${allowed}`,
    );
  }
}

/**
 * Every decision that writes an approval/rejection audit entry requires a
 * fresh re-authentication. Listed explicitly so the set is auditable.
 */
export const STEP_UP_CAPABILITIES: readonly Capability[] = Object.keys(
  DECISION_PERMISSIONS,
) as Capability[];

export function requiresStepUp(module: DecisionModule, outcome: DecisionOutcome): boolean {
  return STEP_UP_CAPABILITIES.includes(capability(module, outcome));
}

/** How long a successful re-authentication stays valid, in minutes. */
export const STEP_UP_TTL_MINUTES = 10;
