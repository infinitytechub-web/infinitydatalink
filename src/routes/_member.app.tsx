import { createFileRoute, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  PiggyBank,
  Landmark,
  ArrowLeftRight,
  CreditCard,
  Send,
  TrendingUp,
  UserCircle2,
  ShieldCheck,
  Building2,
  LifeBuoy,
} from "lucide-react";
import { PortalShell, type NavGroup } from "@/components/portal-shell";
import { useAuth } from "@/lib/auth";

const groups: NavGroup[] = [
  {
    label: "Member Portal",
    items: [
      { to: "/app", label: "Overview", icon: <LayoutDashboard /> },
      { to: "/app/savings", label: "My Savings", icon: <PiggyBank /> },
      { to: "/app/loans", label: "Active Loans", icon: <Landmark /> },
      { to: "/app/investments", label: "Investments", icon: <TrendingUp /> },
      { to: "/app/transactions", label: "Transactions", icon: <ArrowLeftRight /> },
      { to: "/app/payments", label: "Payments", icon: <CreditCard /> },
      { to: "/app/transfers", label: "Transfers", icon: <Send /> },
      { to: "/app/profile", label: "Profile & KYC", icon: <UserCircle2 /> },
      { to: "/app/kyc", label: "Verification status", icon: <ShieldCheck /> },
      { to: "/app/entities/register", label: "Register organization", icon: <Building2 /> },
    ],
  },
  {
    label: "Support",
    items: [
      { to: "/app/support", label: "Help Centre", icon: <LifeBuoy /> },
    ],
  },
];

const CRUMBS: Record<string, string> = {
  "/app": "Financial Summary",
  "/app/savings": "My Savings",
  "/app/savings/deposit": "Top up savings",
  "/app/savings/ledger": "Savings ledger",
  "/app/savings/fixed": "Fixed deposits",
  "/app/savings/pots": "Group & susu savings",
  "/app/savings/insights": "Savings insights",
  "/app/loans": "Active Loans",
  "/app/investments": "Investments & Shares",
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
  if (user.status !== "approved") return <PendingApprovalGate />;
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

function PendingApprovalGate() {
  const { user, signOut } = useAuth();
  const status = user?.status ?? "pending";
  const copy =
    status === "rejected"
      ? {
          title: "Account access denied",
          body:
            user?.rejectionReason ??
            "Your registration was rejected. Contact support if you believe this is an error.",
        }
      : status === "deactivated"
        ? {
            title: "Account deactivated",
            body: "Your account is currently deactivated. Please contact an administrator.",
          }
        : {
            title: "Awaiting administrator approval",
            body:
              "Thanks for signing up. An administrator will review and approve your account shortly. You'll be notified by email once you're approved.",
          };
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-lg">
        <h1 className="text-2xl font-semibold text-foreground">{copy.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{copy.body}</p>
        <button
          onClick={() => signOut()}
          className="mt-6 rounded-md bg-emerald-deep px-4 py-2 text-xs font-semibold uppercase tracking-widest text-cream hover:bg-emerald-mid"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
