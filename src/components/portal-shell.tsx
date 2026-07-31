import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Menu, X, LogOut, Search, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { SIDEBAR_GROUP_CHIPS } from "@/lib/theme-tokens";
import { useBranding } from "@/components/branding-provider";
import {
  SidebarWidget,
  SidebarWidgetHeader,
  SidebarNavItem,
  SidebarWidgetEmpty,
  SidebarWidgetSkeleton,
} from "@/components/sidebar-widgets";
import { OnlinePresencePill, SidebarOnlinePanel } from "@/components/online-presence-indicators";
import type { NavGroup, NavItem } from "@/components/portal-shell.types";

export type { NavGroup, NavItem };

const GROUP_ACCENTS = SIDEBAR_GROUP_CHIPS;


const COLLAPSE_KEY = "it360:sidebar-collapsed";

export function PortalShell({
  brand,
  groups,
  breadcrumb,
  action,
  loading = false,
  children,
}: {
  brand: string;
  groups: NavGroup[];
  breadcrumb: string;
  action?: ReactNode;
  loading?: boolean;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(false); // desktop rail
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { branding } = useBranding();
  const displayName = branding.app_name || brand;

  // Hydrate desktop collapse preference
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {}
  }, [collapsed]);

  // Close mobile drawer when the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on Escape for keyboard users; lock body scroll while drawer open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Keyboard shortcut: [ toggles desktop rail.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (target?.isContentEditable) return;
      if (e.key === "[") setCollapsed((c) => !c);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleSignOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

  const handleNavClick = () => {
    setOpen(false);
    // Auto-collapse desktop rail after a nav selection
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      setCollapsed(true);
    }
  };

  return (
    <div className="flex min-h-dvh bg-background font-sans text-foreground">
      {/* Mobile scrim */}
      {open ? (
        <button
          type="button"
          aria-label="Close menu overlay"
          className="fixed inset-0 z-20 bg-foreground/40 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      {/* Sidebar — colorful navigation drawer (offcanvas < lg, fixed ≥ lg) */}
      <aside
        aria-label="Primary navigation"
        aria-modal={open ? true : undefined}
        role={open ? "dialog" : undefined}
        className={cn(
          "fixed left-0 top-0 z-30 h-full w-[min(88vw,17rem)] flex-col text-white transition-[transform,width] duration-300 lg:flex lg:translate-x-0",
          collapsed ? "lg:w-20" : "lg:w-64",
          "bg-linear-to-b from-[#0a1a33] via-[#123a6b] to-[#081428]",
          "shadow-[var(--shadow-nav)] ring-1 ring-inset ring-white/5",
          open ? "flex translate-x-0" : "flex -translate-x-full lg:translate-x-0",
        )}
      >
        <div
          className={cn(
            "flex items-center border-b border-white/10 p-4",
            collapsed ? "lg:justify-center lg:p-3" : "justify-between p-6",
          )}
        >
          <Link
            to="/"
            className="flex items-center gap-2 font-serif text-xl tracking-tight text-white drop-shadow-[0_1px_0_rgba(0,0,0,0.35)]"
          >
            {branding.logo_url ? (
              <img
                src={branding.logo_url}
                alt=""
                className="h-8 w-8 shrink-0 rounded-md bg-white/10 object-contain p-1"
              />
            ) : (
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/10 font-serif text-xs">
                IT
              </span>
            )}
            {!collapsed && <span className="truncate lg:inline">{displayName}</span>}
          </Link>
          <button
            type="button"
            aria-label="Close menu"
            className="rounded-md p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
            onClick={() => setOpen(false)}
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto p-3" aria-busy={loading || undefined}>
          {loading ? (
            <>
              <SidebarWidgetSkeleton rows={4} collapsed={collapsed} />
              <SidebarWidgetSkeleton rows={5} collapsed={collapsed} />
              <SidebarWidgetSkeleton rows={3} collapsed={collapsed} />
            </>
          ) : groups.length === 0 ? (
            <SidebarWidgetEmpty
              label="Navigation"
              message="No sections available"
              collapsed={collapsed}
            />
          ) : (
            groups.map((g, gi) => {
              const accent = GROUP_ACCENTS[gi % GROUP_ACCENTS.length];
              return (
                <SidebarWidget key={g.label} collapsed={collapsed}>
                  <SidebarWidgetHeader label={g.label} accent={accent} collapsed={collapsed} />
                  {g.items.length === 0 ? (
                    <SidebarWidgetEmpty message="No items" collapsed={collapsed} />
                  ) : (
                    <div className="space-y-1">
                      {g.items.map((item) => {
                        const active =
                          pathname === item.to ||
                          (item.to !== "/app" &&
                            item.to !== "/admin" &&
                            pathname.startsWith(item.to));
                        return (
                          <SidebarNavItem
                            key={item.to}
                            item={item}
                            accent={accent}
                            active={active}
                            collapsed={collapsed}
                            onNavigate={handleNavClick}
                          />
                        );
                      })}
                    </div>
                  )}
                </SidebarWidget>
              );
            })
          )}
        </nav>

        <div className={cn("px-3 pb-3", collapsed && "lg:px-2")}>
          <SidebarOnlinePanel collapsed={collapsed} />
        </div>


        <div className={cn("border-t border-white/10 p-4", collapsed && "lg:p-2")}>
          <div className={cn("flex items-center gap-3", collapsed && "lg:justify-center")}>
            <div
              className="grid size-9 shrink-0 place-items-center rounded-lg bg-linear-to-br from-white/20 to-white/5 font-serif text-white shadow-inner"
              aria-hidden="true"
            >
              {(user?.fullName || "?").slice(0, 2).toUpperCase()}
            </div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1 text-xs">
                  <p className="truncate font-medium text-white">{user?.fullName ?? "Guest"}</p>
                  <p className="truncate capitalize text-white/60">
                    {user?.roles?.[0]?.replace(/_/g, " ") ?? "no role"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  aria-label="Sign out"
                  className="grid size-8 place-items-center rounded-md text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <LogOut className="size-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main
        className={cn(
          "flex min-w-0 flex-1 flex-col transition-[margin] duration-300",
          collapsed ? "lg:ml-20" : "lg:ml-64",
        )}
      >
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/70 px-4 backdrop-blur-xl lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Open menu"
              className="grid size-9 place-items-center rounded-md text-foreground transition-colors hover:bg-muted lg:hidden"
              onClick={() => setOpen(true)}
            >
              <Menu className="size-4" />
            </button>
            <button
              type="button"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar ( [ )" : "Collapse sidebar ( [ )"}
              className="hidden size-9 place-items-center rounded-md text-foreground transition-colors hover:bg-muted lg:grid"
              onClick={() => setCollapsed((c) => !c)}
            >
              {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </button>
            <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
              <span className="hidden truncate text-muted-foreground sm:inline">{displayName}</span>
              <span className="hidden text-muted-foreground/60 sm:inline">/</span>
              <span className="truncate">{breadcrumb}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden h-9 w-56 items-center gap-2 rounded-full border border-border bg-muted/60 px-4 text-xs text-muted-foreground backdrop-blur md:flex">
              <Search className="size-3.5" />
              <span>Search…</span>
            </div>
            <OnlinePresencePill />
            <ThemeToggle />
            {action}
          </div>
        </header>

        <div className="mx-auto w-full max-w-7xl flex-1 animate-fade-in space-y-8 p-4 lg:p-8">
          {children}
        </div>

        <footer className="border-t border-border px-4 py-6 text-[11px] text-muted-foreground lg:px-8">
          {displayName} · Confidential financial data · © {new Date().getFullYear()}
        </footer>
      </main>
    </div>
  );
}
