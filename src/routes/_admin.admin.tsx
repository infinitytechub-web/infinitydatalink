import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { PortalShell, type NavGroup } from "@/components/portal-shell";

const groups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { to: "/admin", label: "Analytics" },
      { to: "/admin/reports", label: "Reports" },
      { to: "/admin/audit", label: "Audit & Activity" },
      { to: "/admin/audit/transfers", label: "Transfer Audit" },

    ],
  },
  {
    label: "Finance",
    items: [
      { to: "/admin/finance", label: "Financial Dashboard" },
      { to: "/admin/finance/summary", label: "Financial Summary" },
      { to: "/admin/finance/contributions", label: "Contributions" },
      { to: "/admin/finance/income", label: "Income" },
      { to: "/admin/finance/breakdown", label: "Expenses Breakdown" },
      { to: "/admin/finance/expenses", label: "Expense Ledger" },
      { to: "/admin/finance/transfers", label: "Transfers" },
      { to: "/admin/finance/adjustments", label: "Balance Mgmt" },
    ],
  },
  {
    label: "Membership",
    items: [
      { to: "/admin/members", label: "Individuals (KYC)" },
      { to: "/admin/entities?type=group", label: "Groups" },
      { to: "/admin/entities?type=department", label: "Departments" },
      { to: "/admin/entities?type=institution", label: "Institutions" },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/admin/savings", label: "Savings" },
      { to: "/admin/loans", label: "Loans & Approvals" },
      { to: "/admin/payments", label: "Payments" },
    ],
  },
  {
    label: "Governance",
    items: [
      { to: "/admin/security", label: "Security Centre" },
      { to: "/admin/health", label: "Integration Health" },
      { to: "/admin/super-admins", label: "Super Admins" },
      { to: "/admin/super-admins/history", label: "Grant history" },
      { to: "/admin/settings", label: "Settings" },

    ],
  },
];

const CRUMBS: Record<string, string> = {
  "/admin": "Analytics",
  "/admin/reports": "Reports",
  "/admin/audit": "Audit & Activity",
  "/admin/audit/transfers": "Transfer Audit",

  "/admin/finance": "Financial Dashboard",
  "/admin/finance/summary": "Financial Summary",
  "/admin/finance/contributions": "Contributions",
  "/admin/finance/income": "Income Breakdown",
  "/admin/finance/breakdown": "Expenses Breakdown",
  "/admin/finance/expenses": "Expense Ledger",
  "/admin/finance/transfers": "Transfers",
  "/admin/finance/adjustments": "Balance Management",
  "/admin/members": "KYC queue",
  "/admin/entities": "Entities",
  "/admin/savings": "Savings",
  "/admin/loans": "Loans & Approvals",
  "/admin/payments": "Payments",
  "/admin/security": "Security Centre",
  "/admin/super-admins": "Super Admins",
  "/admin/super-admins/history": "Grant history",
  "/admin/settings": "Settings",
};

function crumbFor(pathname: string) {
  if (pathname.startsWith("/admin/members/")) return "Member review";
  if (pathname.startsWith("/admin/entities/")) return "Entity details";
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
