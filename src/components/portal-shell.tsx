import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

export type NavItem = { to: string; label: string };
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
    <div className="flex min-h-screen bg-cream font-sans text-emerald-deep">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-30 h-full w-64 flex-col bg-emerald-deep text-white transition-transform lg:flex lg:translate-x-0",
          open ? "flex translate-x-0" : "hidden -translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-emerald-mid/30 p-6">
          <Link to="/" className="font-serif text-xl tracking-tight text-gold">
            {brand}
          </Link>
          <button
            aria-label="Close menu"
            className="text-white/60 lg:hidden"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto p-4">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-emerald-mid">
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
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-emerald-mid/20 text-gold"
                          : "text-white/70 hover:bg-white/5 hover:text-white",
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          active ? "bg-gold" : "bg-transparent",
                        )}
                      />
                      <span className={cn(active && "font-medium")}>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-emerald-mid/30 p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded bg-gold/20 font-serif text-gold">
              {(user?.fullName || "?").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1 text-xs">
              <p className="truncate font-medium">{user?.fullName ?? "Guest"}</p>
              <p className="truncate capitalize text-white/50">
                {user?.roles?.[0]?.replace(/_/g, " ") ?? "no role"}
              </p>
            </div>
            <button
              onClick={handleSignOut}
              className="text-[10px] font-semibold uppercase tracking-widest text-white/60 hover:text-gold"
            >
              Exit
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex flex-1 flex-col lg:ml-64">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-emerald-deep/5 bg-card px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              aria-label="Open menu"
              className="rounded p-2 text-emerald-deep lg:hidden"
              onClick={() => setOpen(true)}
            >
              ☰
            </button>
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="text-emerald-deep/40">{brand}</span>
              <span className="text-emerald-deep/20">/</span>
              <span>{breadcrumb}</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden h-8 w-56 items-center rounded-full bg-cream px-4 text-xs text-emerald-deep/60 md:flex">
              Search…
            </div>
            <div className="size-2 animate-pulse rounded-full bg-gold" />
            {action}
          </div>
        </header>

        <div className="mx-auto w-full max-w-7xl flex-1 space-y-8 p-4 lg:p-8">{children}</div>

        <footer className="border-t border-emerald-deep/5 px-8 py-6 text-[11px] text-emerald-deep/40">
          Infinity Wealth App · Confidential financial data · © {new Date().getFullYear()}
        </footer>
      </main>
    </div>
  );
}
