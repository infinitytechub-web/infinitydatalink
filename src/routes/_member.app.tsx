import { createFileRoute, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { PortalShell, type NavGroup } from "@/components/portal-shell";
import { useAuth } from "@/lib/auth";

const groups: NavGroup[] = [
  {
    label: "Member Portal",
    items: [
      { to: "/app", label: "Overview" },
      { to: "/app/savings", label: "My Savings" },
      { to: "/app/loans", label: "Active Loans" },
      { to: "/app/transactions", label: "Transactions" },
      { to: "/app/payments", label: "Payments" },
      { to: "/app/transfers", label: "Transfers" },
      { to: "/app/profile", label: "Profile & KYC" },
      { to: "/app/kyc", label: "Verification status" },
      { to: "/app/entities/register", label: "Register organization" },
    ],
  },
  {
    label: "Support",
    items: [
      { to: "/app/support", label: "Help Centre" },
    ],
  },
];

const CRUMBS: Record<string, string> = {
  "/app": "Financial Summary",
  "/app/savings": "My Savings",
  "/app/loans": "Active Loans",
  "/app/transactions": "Transactions",
  "/app/payments": "Payments",
  "/app/transfers": "Transfers",
  "/app/profile": "Profile & KYC",
  "/app/kyc": "Verification status",
  "/app/entities/register": "Register organization",
  "/app/support": "Help Centre",
};

export const Route = createFileRoute("/_member/app")({
  head: () => ({
    meta: [{ title: "Member portal — IT-360 CashApp" }, { name: "robots", content: "noindex" }],
  }),
  component: MemberLayout,
});

function MemberLayout() {
  const { user, loading, isAdmin } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  // Staff land on the admin dashboard; the member shell is for members only.
  if (isAdmin) return <Navigate to="/admin" replace />;
  const breadcrumb = CRUMBS[pathname] ?? "Overview";
  return (
    <PortalShell
      brand="IT-360 CashApp"
      groups={groups}
      breadcrumb={breadcrumb}
      action={
        <button className="rounded bg-emerald-deep px-4 py-2 text-xs font-semibold uppercase tracking-widest text-cream shadow-sm hover:bg-emerald-mid">
          New Transaction
        </button>
      }
    >
      <Outlet />
    </PortalShell>
  );
}
