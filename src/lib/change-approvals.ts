/**
 * Shared (client-safe) constants for the Change Approvals module.
 *
 * A change request is a staged, reviewable mutation of sensitive configuration.
 * Nothing is written to live tables until a *second* person approves it — the
 * database enforces the two-person rule inside `approve_settings_change`.
 */

export const CHANGE_KINDS = [
  "branding",
  "institution",
  "role_grant",
  "role_revoke",
  "permission_matrix",
  "payment_config",
] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

export const CHANGE_STATUSES = ["pending", "approved", "rejected", "applied", "failed"] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

export const KIND_LABELS: Record<ChangeKind, string> = {
  branding: "Branding & institution identity",
  institution: "Institution profile",
  role_grant: "Grant a role",
  role_revoke: "Revoke a role",
  permission_matrix: "Permission matrix",
  payment_config: "Payment provider configuration",
};

export const KIND_HINTS: Record<ChangeKind, string> = {
  branding: 'Branding fields to write, e.g. {"org_display_name":"IT-360 Cash","primary_color":"#0f766e"}',
  institution: 'Institution profile fields, e.g. {"org_legal_name":"IT-360 Financial Services Ltd"}',
  role_grant: 'Target user and role, e.g. {"user_id":"<uuid>","role":"manager","note":"promotion"}',
  role_revoke: 'Target user and role, e.g. {"user_id":"<uuid>","role":"manager","note":"left the team"}',
  permission_matrix:
    'Role capabilities, e.g. {"role":"manager","capabilities":["loans.view","loans.approve"]}',
  payment_config:
    'Provider record, e.g. {"code":"paystack","label":"Paystack","mode":"sandbox","enabled":true,"config":{}}',
};

export const STATUS_TONE: Record<ChangeStatus, string> = {
  pending: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  approved: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  applied: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
  failed: "bg-rose-600/15 text-rose-700 dark:text-rose-300",
};

export const STATUS_LABELS: Record<ChangeStatus, string> = {
  pending: "Awaiting review",
  approved: "Approved — not applied",
  applied: "Applied",
  rejected: "Rejected",
  failed: "Apply failed",
};

/** Requests in these states can still be (re)applied by an approver. */
export function isAppliable(status: ChangeStatus): boolean {
  return status === "approved" || status === "failed";
}

export function describeChange(kind: ChangeKind, payload: unknown): string {
  const p = (payload ?? {}) as Record<string, unknown>;
  switch (kind) {
    case "role_grant":
    case "role_revoke":
      return [p["role"], p["user_id"]].filter(Boolean).join(" → ") || KIND_LABELS[kind];
    case "payment_config":
      return [p["code"], p["mode"]].filter(Boolean).join(" · ") || KIND_LABELS[kind];
    case "permission_matrix":
      return typeof p["role"] === "string" ? `role: ${p["role"]}` : KIND_LABELS[kind];
    default:
      return Object.keys(p).slice(0, 4).join(", ") || KIND_LABELS[kind];
  }
}
