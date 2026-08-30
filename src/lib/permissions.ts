/**
 * Enterprise permission matrix — single source of truth shared by the UI and the
 * server functions. The database mirrors this in `public.role_permissions` and
 * enforces it through `private.has_permission(uid, module, action)`, so a client
 * that lies about its capabilities still cannot write.
 */
import type { Role } from "@/lib/role-guards";

export const MODULES = [
  "kyc",
  "members",
  "entities",
  "savings",
  "loans",
  "payments",
  "approvals",
  "reports",
  "security",
  "settings",
  "documents",
  "users",
  "notifications",
  "teller",
  "support",
  "files",
] as const;
export type PermModule = (typeof MODULES)[number];

export const ACTIONS = [
  "view",
  "create",
  "edit",
  "delete",
  "approve",
  "reject",
  "export",
  "print",
  "download",
  "manage",
] as const;
export type PermAction = (typeof ACTIONS)[number];

export type Capability = `${PermModule}.${PermAction}`;

export const MODULE_LABELS: Record<PermModule, string> = {
  kyc: "KYC",
  members: "Membership",
  entities: "Groups & institutions",
  savings: "Savings",
  loans: "Lending",
  payments: "Payments",
  approvals: "Change approvals",
  reports: "Reports",
  security: "Security centre",
  settings: "System settings",
  documents: "Documents",
  users: "Users & roles",
  notifications: "Notifications",
  teller: "Teller operations",
  support: "Support centre",
  files: "File management",
};

export const ACTION_LABELS: Record<PermAction, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  approve: "Approve",
  reject: "Reject",
  export: "Export",
  print: "Print",
  download: "Download",
  manage: "Manage",
};

/** Enterprise role tiers, ordered most → least privileged. */
export const ROLE_TIERS: Array<{ role: Role; label: string; tier: string }> = [
  { role: "super_admin", label: "Super Admin", tier: "Platform owner" },
  { role: "admin", label: "Admin", tier: "Administrator" },
  { role: "manager", label: "Manager", tier: "Management" },
  { role: "compliance_officer", label: "Compliance Officer", tier: "Staff / Officer" },
  { role: "loan_officer", label: "Loan Officer", tier: "Staff / Officer" },
  { role: "finance_officer", label: "Finance Officer", tier: "Staff / Officer" },
  { role: "teller", label: "Teller", tier: "Front office" },
  { role: "support_officer", label: "Support Officer", tier: "Service desk" },
  { role: "auditor", label: "Auditor", tier: "Read-only assurance" },
  { role: "member", label: "Member", tier: "End user" },
];

const ALL_MODULES = MODULES as readonly PermModule[];
const READ_ONLY: PermAction[] = ["view", "export", "print", "download"];
const DECIDE: PermAction[] = ["view", "edit", "approve", "reject", "export", "print", "download"];

function grid(modules: readonly PermModule[], actions: readonly PermAction[]): Capability[] {
  const out: Capability[] = [];
  for (const m of modules) for (const a of actions) out.push(`${m}.${a}` as Capability);
  return out;
}

/**
 * Fallback matrix used before the database matrix has loaded (and mirrored by
 * the seed migration). `super_admin` is always implicitly allowed everything.
 */
export const DEFAULT_ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  super_admin: grid(ALL_MODULES, ACTIONS),
  admin: grid(
    ALL_MODULES.filter((m) => m !== "settings"),
    ["view", "create", "edit", "approve", "reject", "export", "print", "download"],
  ),
  manager: grid(
    [
      "kyc",
      "members",
      "entities",
      "savings",
      "loans",
      "payments",
      "approvals",
      "reports",
      "documents",
      "notifications",
    ],
    DECIDE,
  ),
  compliance_officer: grid(
    ["kyc", "members", "entities", "documents", "notifications", "reports"],
    DECIDE,
  ),
  loan_officer: grid(["loans", "members", "reports"], [...DECIDE, "create"]),
  finance_officer: grid(["savings", "payments", "loans", "reports"], [...DECIDE, "create"]),
  auditor: grid(
    [
      "kyc",
      "members",
      "entities",
      "savings",
      "loans",
      "payments",
      "approvals",
      "reports",
      "security",
      "documents",
    ],
    READ_ONLY,
  ),
  teller: [
    "teller.view",
    "teller.create",
    "teller.print",
    "members.view",
    "savings.view",
    "savings.create",
    "loans.view",
    "payments.view",
    "payments.create",
    "files.view",
    "reports.view",
    "reports.print",
  ],
  support_officer: [
    "support.view",
    "support.create",
    "support.edit",
    "support.manage",
    "members.view",
    "notifications.view",
    "files.view",
    "files.create",
    "files.download",
    "reports.view",
  ],
  member: [],
};

export type CapabilitySet = ReadonlySet<Capability>;

export function capabilityOf(module: PermModule, action: PermAction): Capability {
  return `${module}.${action}` as Capability;
}

export function capabilitiesForRoles(roles: readonly Role[]): Set<Capability> {
  const set = new Set<Capability>();
  for (const r of roles) for (const c of DEFAULT_ROLE_CAPABILITIES[r] ?? []) set.add(c);
  return set;
}

export function can(caps: CapabilitySet, module: PermModule, action: PermAction): boolean {
  return caps.has(capabilityOf(module, action));
}

/** Loads the caller's effective capabilities from the database matrix. */
export async function loadCapabilities(
  supabase: any,
  roles: readonly Role[],
): Promise<Set<Capability>> {
  const set = new Set<Capability>();
  try {
    const { data, error } = await supabase.rpc("my_permissions");
    if (!error && Array.isArray(data)) {
      for (const row of data as Array<{ module: string; action: string }>) {
        set.add(`${row.module}.${row.action}` as Capability);
      }
    }
  } catch {
    /* fall through to the static matrix */
  }
  if (roles.includes("super_admin"))
    for (const c of DEFAULT_ROLE_CAPABILITIES.super_admin) set.add(c);
  if (set.size === 0) for (const c of capabilitiesForRoles(roles)) set.add(c);
  return set;
}

/**
 * Server-side gate. Uses the security-definer database check so the decision is
 * identical to the one RLS makes.
 */
export async function assertPermission(
  supabase: any,
  userId: string,
  module: PermModule,
  action: PermAction,
): Promise<void> {
  const { data, error } = await supabase.rpc("has_permission_for", {
    _module: module,
    _action: action,
  });
  if (error) {
    // Fall back to reading roles directly so a missing RPC never fails open.
    const { data: rows } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const roles = ((rows ?? []) as Array<{ role: Role }>).map((r) => r.role);
    if (!can(capabilitiesForRoles(roles), module, action)) {
      throw new Error(`Forbidden: ${module}.${action} permission required`);
    }
    return;
  }
  if (data !== true) {
    throw new Error(`Forbidden: ${module}.${action} permission required`);
  }
}
