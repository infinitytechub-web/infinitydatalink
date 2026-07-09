import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PortalShell, type NavGroup } from "@/components/portal-shell";
import { useRouterState } from "@tanstack/react-router";

const groups: NavGroup[] = [
  {
    label: "Member Portal",
    items: [
      { to: "/app", label: "Overview" },
      { to: "/app/savings", label: "My Savings" },
      { to: "/app/loans", label: "Active Loans" },
      { to: "/app/transactions", label: "Transactions" },
      { to: "/app/payments", label: "Payments" },
      { to: "/app/profile", label: "Profile & KYC" },
      { to: "/app/kyc", label: "Verification status" },
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
  "/app/profile": "Profile & KYC",
  "/app/kyc": "Verification status",
  "/app/support": "Help Centre",
};

export const Route = createFileRoute("/_member/app")({
  head: () => ({
    meta: [{ title: "Member portal — Infinity Wealth" }, { name: "robots", content: "noindex" }],
  }),
  component: MemberLayout,
});

function MemberLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const breadcrumb = CRUMBS[pathname] ?? "Overview";
  return (
    <PortalShell
      brand="Infinity Wealth"
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
