import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/components/portal-shell.types";

/**
 * Shared visual tokens for the left-pane widgets. Kept here so the widget
 * container, group label, nav row, skeleton, and empty state all agree on
 * padding, ring, radius, and hover treatment.
 */
export const SIDEBAR_WIDGET_SURFACE =
  "nav-3d-panel rounded-2xl bg-white/[0.04] ring-1 ring-inset ring-white/10";
export const SIDEBAR_WIDGET_PADDING = "p-2";
export const SIDEBAR_ITEM_BASE =
  "nav-3d-item group relative flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm outline-none will-change-transform lg:py-2 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-0";
export const SIDEBAR_ITEM_IDLE = "text-white/80 hover:bg-white/10 hover:text-white";
export const SIDEBAR_ITEM_ACTIVE =
  "nav-3d-item-active bg-white/15 text-white ring-1 ring-white/25";

/** Group container — renders the padded card unless the rail is collapsed. */
export function SidebarWidget({
  collapsed,
  children,
  className,
}: {
  collapsed?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "nav-3d-scene",
        SIDEBAR_WIDGET_SURFACE,
        collapsed ? "lg:bg-transparent lg:p-0 lg:ring-0 lg:shadow-none" : SIDEBAR_WIDGET_PADDING,
        className,
      )}
    >
      {children}
    </section>
  );
}


/** Group label with the coloured accent dot. Hidden while collapsed. */
export function SidebarWidgetHeader({
  label,
  accent,
  collapsed,
}: {
  label: string;
  accent: string;
  collapsed?: boolean;
}) {
  if (collapsed) return null;
  return (
    <header className="mb-2 flex items-center gap-2 px-2 pt-1">
      <span
        aria-hidden="true"
        className={cn(
          "h-2 w-2 rounded-full bg-linear-to-br shadow-[0_0_10px_rgba(255,255,255,0.35)]",
          accent,
        )}
      />
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">
        {label}
      </div>
    </header>
  );
}

/** A single nav row. Encapsulates the icon chip, hover, active pill, and rail
 *  indicator so callers only pass data. */
export function SidebarNavItem({
  item,
  accent,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  accent: string;
  active: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        SIDEBAR_ITEM_BASE,
        collapsed && "lg:justify-center lg:px-1.5",
        active ? SIDEBAR_ITEM_ACTIVE : SIDEBAR_ITEM_IDLE,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "nav-3d-chip grid size-9 shrink-0 place-items-center rounded-lg text-white ring-1 ring-white/25 bg-linear-to-br lg:size-8",
          accent,
          active ? "scale-105" : "opacity-95 group-hover:opacity-100",
        )}
      >
        {item.icon ? (
          <span className="[&>svg]:size-4 [&>svg]:stroke-[2.25] text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]">
            {item.icon}
          </span>
        ) : (
          <span className="size-1.5 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)]" />
        )}
      </span>
      {!collapsed && (
        <span
          className={cn("nav-3d-label min-w-0 truncate", active && "font-semibold")}
        >
          {item.label}
        </span>
      )}

      {active && !collapsed ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-y-1 left-0 w-1 rounded-r-full bg-linear-to-b",
            accent,
          )}
        />
      ) : null}
    </Link>
  );
}

/** Shimmer skeleton matching the nav row footprint. Use while route groups
 *  are being fetched or gated by role. */
export function SidebarWidgetSkeleton({
  rows = 3,
  collapsed,
}: {
  rows?: number;
  collapsed?: boolean;
}) {
  return (
    <SidebarWidget collapsed={collapsed}>
      {!collapsed && (
        <div className="mb-2 flex items-center gap-2 px-2 pt-1">
          <span className="h-2 w-2 animate-pulse rounded-full bg-white/25" />
          <span className="h-2 w-16 animate-pulse rounded bg-white/15" />
        </div>
      )}
      <div className="space-y-1">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-3 rounded-xl px-2.5 py-2.5 lg:py-2",
              collapsed && "lg:justify-center lg:px-1.5",
            )}
          >
            <span className="size-9 shrink-0 animate-pulse rounded-lg bg-white/10 lg:size-8" />
            {!collapsed && (
              <span
                className="h-3 animate-pulse rounded bg-white/10"
                style={{ width: `${55 + ((i * 13) % 30)}%` }}
              />
            )}
          </div>
        ))}
      </div>
    </SidebarWidget>
  );
}

/** Empty state for a widget group when a user has no items available in it
 *  (e.g. RBAC filtered everything out). */
export function SidebarWidgetEmpty({
  label,
  message = "Nothing available",
  collapsed,
}: {
  label?: string;
  message?: string;
  collapsed?: boolean;
}) {
  if (collapsed) {
    return (
      <div
        className="mx-auto grid size-9 place-items-center rounded-lg bg-white/[0.04] text-white/75 ring-1 ring-inset ring-white/10 lg:size-8"
        title={message}
        aria-label={message}
      >
        <Inbox className="size-4" aria-hidden="true" />
      </div>
    );
  }
  return (
    <SidebarWidget>
      {label ? <SidebarWidgetHeader label={label} accent="from-white/20 to-white/5" /> : null}
      <div className="flex items-center gap-2 rounded-xl px-2.5 py-3 text-xs text-white/75">
        <Inbox className="size-3.5" aria-hidden="true" />
        <span className="truncate">{message}</span>
      </div>
    </SidebarWidget>
  );
}
