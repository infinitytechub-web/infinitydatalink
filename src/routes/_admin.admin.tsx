import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { PortalShell, type NavGroup } from "@/components/portal-shell";

const groups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { to: "/admin", label: "Analytics" },
      { to: "/admin/reports", label: "Reports" },
      { to: "/admin/audit", label: "Audit & Activity" },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/admin/members", label: "Membership" },
      { to: "/admin/savings", label: "Savings" },
      { to: "/admin/loans", label: "Loans & Approvals" },
      { to: "/admin/payments", label: "Payments" },
    ],
  },
  {
    label: "Governance",
    items: [
      { to: "/admin/security", label: "Security Centre" },
      { to: "/admin/settings", label: "Settings" },
    ],
  },
];

const CRUMBS: Record<string, string> = {
  "/admin": "Analytics",
  "/admin/reports": "Reports",
  "/admin/audit": "Audit & Activity",
  "/admin/members": "Membership",
  "/admin/savings": "Savings",
  "/admin/loans": "Loans & Approvals",
  "/admin/payments": "Payments",
  "/admin/security": "Security Centre",
  "/admin/settings": "Settings",
};

function crumbFor(pathname: string) {
  if (pathname.startsWith("/admin/members/")) return "Member review";
  return CRUMBS[pathname] ?? "Administration";
}

export const Route = createFileRoute("/_admin/admin")({
  head: () => ({
    meta: [{ title: "Administrator — Infinity Wealth" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const breadcrumb = crumbFor(pathname);
  return (
    <PortalShell
      brand="Infinity Admin"
      groups={groups}
      breadcrumb={breadcrumb}
      action={
        <button className="rounded bg-gold px-4 py-2 text-xs font-semibold uppercase tracking-widest text-emerald-deep hover:opacity-90">
          System Report
        </button>
      }
    >
      <Outlet />
    </PortalShell>
  );
}
