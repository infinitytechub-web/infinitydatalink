import type { ReactNode } from "react";
import type { Capability } from "@/lib/permissions";
import type { AppRole } from "@/lib/auth";

/**
 * `cap` is an optional RBAC gate: when present, the item only renders for a
 * user holding that `module.action` capability (super admins always pass).
 * `roles` widens that gate to named roles for destinations the capability
 * matrix does not model (e.g. platform configuration owned by admins).
 * `hint` is surfaced as the row tooltip; `disabled` renders the row inert,
 * which the member portal uses while KYC is still incomplete.
 */
export type NavItem = {
  to: string;
  label: string;
  icon?: ReactNode;
  cap?: Capability;
  roles?: AppRole[];
  hint?: string;
  disabled?: boolean;
};
export type NavGroup = { label: string; items: NavItem[] };
