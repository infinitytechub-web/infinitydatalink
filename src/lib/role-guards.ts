// Shared role-check helpers, extracted so we can unit-test enforcement
// independently of Supabase middleware.
export const ALL_ROLES = [
  "super_admin",
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
export type Role = (typeof ALL_ROLES)[number];

export const ADMIN_ROLES: readonly Role[] = [
  "super_admin",
  "admin",
  "manager",
  "compliance_officer",
  "loan_officer",
  "finance_officer",
  "auditor",
  "teller",
  "support_officer",
];

export const TELLER_ROLES: readonly Role[] = [
  "super_admin",
  "admin",
  "manager",
  "finance_officer",
  "teller",
];
export const SUPPORT_ROLES: readonly Role[] = [
  "super_admin",
  "admin",
  "manager",
  "support_officer",
];

export const KYC_ADMIN_ROLES: readonly Role[] = [
  "super_admin",
  "admin",
  "manager",
  "compliance_officer",
];
export const FINANCE_ROLES: readonly Role[] = [
  "super_admin",
  "admin",
  "manager",
  "finance_officer",
];
export const LOAN_DECISION_ROLES: readonly Role[] = [
  "super_admin",
  "admin",
  "manager",
  "loan_officer",
];
export const SUPER_ADMIN_ONLY: readonly Role[] = ["super_admin"];

export type RoleSet = ReadonlySet<Role>;

export function rolesFromRows(rows: Array<{ role: string }> | null | undefined): RoleSet {
  const set = new Set<Role>();
  for (const r of rows ?? []) {
    if ((ALL_ROLES as readonly string[]).includes(r.role)) set.add(r.role as Role);
  }
  return set;
}

export function hasAnyRole(roles: RoleSet, allowed: readonly Role[]): boolean {
  for (const r of allowed) if (roles.has(r)) return true;
  return false;
}

/**
 * Throws `Forbidden` if the caller does not hold one of the allowed roles.
 * Used by server functions to gate protected endpoints uniformly.
 */
export function assertAnyRole(roles: RoleSet, allowed: readonly Role[], label = "admin"): void {
  if (!hasAnyRole(roles, allowed)) {
    throw new Error(`Forbidden: ${label} role required`);
  }
}

export async function loadRoleSet(supabase: any, userId: string): Promise<RoleSet> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return rolesFromRows(data as Array<{ role: string }> | null);
}
