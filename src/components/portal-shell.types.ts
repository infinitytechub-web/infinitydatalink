import type { ReactNode } from "react";

export type NavItem = { to: string; label: string; icon?: ReactNode };
export type NavGroup = { label: string; items: NavItem[] };
