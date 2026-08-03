import type { ReactNode } from "react";
import type { Capability } from "@/lib/permissions";

/**
 * `cap` is an optional RBAC gate: when present, the item only renders for a
 * user holding that `module.action` capability (super admins always pass).
 */
export type NavItem = { to: string; label: string; icon?: ReactNode; cap?: Capability };
export type NavGroup = { label: string; items: NavItem[] };
