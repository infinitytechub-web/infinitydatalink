import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Menu, X, LogOut, Search, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { SIDEBAR_GROUP_CHIPS } from "@/lib/theme-tokens";
import { useBranding } from "@/components/branding-provider";

const GROUP_ACCENTS = SIDEBAR_GROUP_CHIPS;

export type NavItem = { to: string; label: string; icon?: ReactNode };
export type NavGroup = { label: string; items: NavItem[] };

const COLLAPSE_KEY = "it360:sidebar-collapsed";

export function PortalShell({
  brand,
  groups,
  breadcrumb,
  action,
  children,
}: {
  brand: string;
  groups: NavGroup[];
  breadcrumb: string;
  action?: ReactNode;
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
          "bg-linear-to-b from-[#083344] via-[#0e7490] to-[#083344]",
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

        <nav className="flex-1 space-y-5 overflow-y-auto p-3">
          {groups.map((g, gi) => {
            const accent = GROUP_ACCENTS[gi % GROUP_ACCENTS.length];
            return (
              <div
                key={g.label}
                className={cn(
                  "rounded-2xl bg-white/[0.04] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
                  collapsed ? "lg:bg-transparent lg:p-0 lg:ring-0 lg:shadow-none" : "p-2",
                )}
              >
                {!collapsed && (
                  <div className="mb-2 flex items-center gap-2 px-2 pt-1">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "h-2 w-2 rounded-full bg-linear-to-br shadow-[0_0_10px_rgba(255,255,255,0.35)]",
                        accent,
                      )}
                    />
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">
                      {g.label}
                    </div>
                  </div>
                )}
                <div className="space-y-1">
                  {g.items.map((item) => {
                    const active =
                      pathname === item.to ||
                      (item.to !== "/app" && item.to !== "/admin" && pathname.startsWith(item.to));
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={handleNavClick}
                        aria-current={active ? "page" : undefined}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm transition-all duration-200 lg:py-2",
                          collapsed && "lg:justify-center lg:px-1.5",
                          active
                            ? "bg-white/15 text-white ring-1 ring-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.32),0_10px_24px_-12px_rgba(255,255,255,0.35)]"
                            : "text-white/80 hover:bg-white/10 hover:text-white",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "grid size-9 shrink-0 place-items-center rounded-lg text-white ring-1 ring-white/25 shadow-[0_6px_14px_-6px_rgba(0,0,0,0.55)] bg-linear-to-br lg:size-8",
                            accent,
                            active ? "scale-105" : "opacity-95 group-hover:opacity-100",
                          )}
                        >
                          <span className="size-1.5 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)]" />
                        </span>
                        {!collapsed && (
                          <span className={cn("min-w-0 truncate", active && "font-semibold")}>
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
                  })}
                </div>
              </div>
            );
          })}
        </nav>

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
