import { createFileRoute, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyKycStatus } from "@/lib/member-kyc.functions";
import { KycDecisionBanner } from "@/components/kyc-decision-banner";
import { useKycRealtime } from "@/hooks/use-kyc-realtime";

import {
  LayoutDashboard,
  PiggyBank,
  Landmark,
  ReceiptText,
  ArrowLeftRight,
  CreditCard,
  Send,
  TrendingUp,
  UserCircle2,
  ShieldCheck,
  Building2,
  LifeBuoy,
  BellRing,
  Handshake as HandshakeIcon,
  Calculator,
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
      { to: "/app/repayments", label: "Loan Repayments", icon: <ReceiptText /> },
      { to: "/app/loan-calculator", label: "Loan Calculator", icon: <Calculator /> },
      { to: "/app/guarantees", label: "My Guarantees", icon: <HandshakeIcon /> },
      { to: "/app/investments", label: "Investments", icon: <TrendingUp /> },
      { to: "/app/withdrawals", label: "Withdrawals", icon: <ArrowLeftRight /> },
      { to: "/app/files", label: "My Documents", icon: <ReceiptText /> },
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
      { to: "/app/inbox", label: "Notifications", icon: <BellRing /> },
      { to: "/app/notifications", label: "Alert settings", icon: <BellRing /> },
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
  "/app/savings/goals": "Savings goals",
  "/app/savings/insights": "Savings insights",

  "/app/loans": "Active Loans",
  "/app/repayments": "Loan Repayments",
  "/app/loan-calculator": "Loan Calculator",
  "/app/guarantees": "My Guarantees",
  "/app/investments": "Investments & Shares",
  "/app/withdrawals": "Withdrawals",
  "/app/files": "My Documents",
  "/app/transactions": "Transactions",
  "/app/payments": "Payments",
  "/app/transfers": "Transfers",
  "/app/profile": "Profile & KYC",
  "/app/kyc": "Verification status",
  "/app/entities/register": "Register organization",
  "/app/inbox": "Notifications centre",
  "/app/notifications": "Alert settings",
  "/app/support": "Help Centre",
};

export const Route = createFileRoute("/_member/app")({
  head: () => ({
    meta: [{ title: "Member portal — IT-360 CashApp" }, { name: "robots", content: "noindex" }],
  }),
  component: MemberLayout,
});

// Pages a member may always reach while KYC is incomplete.
const KYC_ALLOWED_PATHS = ["/app/kyc", "/app/profile", "/app/notifications", "/app/inbox", "/app/support"];

function MemberLayout() {
  const { user, loading, isAdmin } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const kycFn = useServerFn(getMyKycStatus);
  const kycQuery = useQuery({
    queryKey: ["my-kyc-gate", user?.id],
    queryFn: () => kycFn(),
    enabled: !!user && user.status === "approved" && !isAdmin,
    staleTime: 60_000,
  });
  // Reviewer decisions land instantly instead of waiting for a refetch.
  useKycRealtime(!isAdmin && user?.status === "approved" ? user?.id : undefined);


  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  // Staff land on the admin dashboard; the member shell is for members only.
  if (isAdmin) return <Navigate to="/admin" replace />;
  if (user.status !== "approved") return <PendingApprovalGate />;

  const kyc = kycQuery.data;
  // Full access requires an administrator-approved KYC review, not just a
  // completed submission.
  const kycApproved = kyc?.review_state === "approved";
  const allowed = KYC_ALLOWED_PATHS.some((p) => pathname.startsWith(p));
  if (kyc && !kycApproved && !allowed) {
    return <Navigate to="/app/kyc" replace />;
  }

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
      {kyc ? <KycDecisionBanner status={kyc} /> : null}
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
