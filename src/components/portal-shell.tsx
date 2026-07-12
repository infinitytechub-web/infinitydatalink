import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Menu, X, LogOut, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";

export type NavItem = { to: string; label: string; icon?: ReactNode };
export type NavGroup = { label: string; items: NavItem[] };

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
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const handleSignOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await signOut();
    navigate({ to: "/auth", replace: true });
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

      {/* Sidebar — 3D teal navigation */}
      <aside
        aria-label="Primary navigation"
        className={cn(
          "fixed left-0 top-0 z-30 h-full w-64 flex-col text-white transition-transform duration-300 lg:flex lg:translate-x-0",
          "bg-linear-to-b from-[#083344] via-[#0e7490] to-[#083344]",
          "shadow-[var(--shadow-nav)] ring-1 ring-inset ring-white/5",
          open ? "flex translate-x-0" : "hidden -translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-white/10 p-6">
          <Link
            to="/"
            className="font-serif text-xl tracking-tight text-white drop-shadow-[0_1px_0_rgba(0,0,0,0.35)]"
          >
            {brand}
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

        <nav className="flex-1 space-y-6 overflow-y-auto p-3">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-white/45">
                {g.label}
              </div>
              <div className="space-y-1">
                {g.items.map((item) => {
                  const active =
                    pathname === item.to ||
                    (item.to !== "/app" && item.to !== "/admin" && pathname.startsWith(item.to));
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-200",
                        active
                          ? "bg-white/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_8px_18px_-10px_rgba(45,212,191,0.65)] ring-1 ring-white/15"
                          : "text-white/70 hover:bg-white/6 hover:text-white",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded-lg text-white/80 transition-colors",
                          "bg-linear-to-br from-white/18 to-white/0 shadow-inner",
                          active && "text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]",
                        )}
                      >
                        <span className="size-1.5 rounded-full bg-current" />
                      </span>
                      <span className={cn("min-w-0 truncate", active && "font-medium")}>
                        {item.label}
                      </span>
                      {active ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-1 left-0 w-0.5 rounded-r-full bg-linear-to-b from-white/80 to-white/20"
                        />
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div
              className="grid size-9 shrink-0 place-items-center rounded-lg bg-linear-to-br from-white/20 to-white/5 font-serif text-white shadow-inner"
              aria-hidden="true"
            >
              {(user?.fullName || "?").slice(0, 2).toUpperCase()}
            </div>
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
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col lg:ml-64">
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
            <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
              <span className="hidden truncate text-muted-foreground sm:inline">{brand}</span>
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
          Infinity Wealth App · Confidential financial data · © {new Date().getFullYear()}
        </footer>
      </main>
    </div>
  );
}
