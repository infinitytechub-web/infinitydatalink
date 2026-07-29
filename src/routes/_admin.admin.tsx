import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  FileBarChart,
  History,
  ArrowLeftRight,
  Wallet,
  ClipboardList,
  HandCoins,
  TrendingUp,
  TrendingDown,
  Receipt,
  Send,
  Scale,
  UserCheck,
  Users,
  Users2,
  Building2,
  Landmark,
  PiggyBank,
  RefreshCw,
  BadgeDollarSign,
  CreditCard,
  ShieldAlert,
  Activity,
  Crown,
  ClipboardCheck,
  KeyRound,
  Palette,
  Settings2,
  Bug,
} from "lucide-react";
import { PortalShell, type NavGroup } from "@/components/portal-shell";

const groups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { to: "/admin", label: "Analytics", icon: <BarChart3 /> },
      { to: "/admin/reports", label: "Reports", icon: <FileBarChart /> },
      { to: "/admin/audit", label: "Audit & Activity", icon: <History /> },
      { to: "/admin/activity", label: "Activity Timeline", icon: <Activity /> },
      { to: "/admin/audit/transfers", label: "Transfer Audit", icon: <ArrowLeftRight /> },

    ],
  },
  {
    label: "Finance",
    items: [
      { to: "/admin/finance", label: "Financial Dashboard", icon: <Wallet /> },
      { to: "/admin/finance/summary", label: "Financial Summary", icon: <ClipboardList /> },
      { to: "/admin/finance/contributions", label: "Contributions", icon: <HandCoins /> },
      { to: "/admin/finance/income", label: "Income", icon: <TrendingUp /> },
      { to: "/admin/finance/breakdown", label: "Expenses Breakdown", icon: <TrendingDown /> },
      { to: "/admin/finance/expenses", label: "Expense Ledger", icon: <Receipt /> },
      { to: "/admin/finance/transfers", label: "Transfers", icon: <Send /> },
      { to: "/admin/finance/adjustments", label: "Balance Mgmt", icon: <Scale /> },
    ],
  },
  {
    label: "Membership",
    items: [
      { to: "/admin/approvals", label: "User Approvals", icon: <UserCheck /> },
      { to: "/admin/members", label: "Individuals (KYC)", icon: <Users /> },
      { to: "/admin/entities?type=group", label: "Groups", icon: <Users2 /> },
      { to: "/admin/entities?type=department", label: "Departments", icon: <Building2 /> },
      { to: "/admin/entities?type=institution", label: "Institutions", icon: <Landmark /> },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/admin/savings", label: "Savings", icon: <PiggyBank /> },
      { to: "/admin/savings/withdrawals", label: "Withdrawal approvals", icon: <BanknoteArrowDown /> },
      { to: "/admin/recurring", label: "Recurring schedules", icon: <RefreshCw /> },
      { to: "/admin/loans", label: "Loans & Approvals", icon: <BadgeDollarSign /> },
      { to: "/admin/payments", label: "Payments", icon: <CreditCard /> },
      { to: "/admin/investments", label: "Investments & Shares", icon: <TrendingUp /> },
    ],
  },
  {
    label: "Governance",
    items: [
      { to: "/admin/console", label: "Admin Console", icon: <Settings2 /> },
      { to: "/admin/console/approvals", label: "Change approvals", icon: <ClipboardList /> },
      { to: "/admin/console/snapshots", label: "Backup & restore", icon: <ClipboardCheck /> },
      { to: "/admin/security", label: "Security Centre", icon: <ShieldAlert /> },
      { to: "/admin/logs", label: "Runtime Logs", icon: <Bug /> },
      { to: "/admin/health", label: "Integration Health", icon: <Activity /> },
      { to: "/admin/super-admins", label: "Super Admins", icon: <Crown /> },
      { to: "/admin/super-admins/history", label: "Grant history", icon: <ClipboardCheck /> },
      { to: "/admin/roles", label: "Roles & Permissions", icon: <KeyRound /> },
      { to: "/admin/branding", label: "Branding", icon: <Palette /> },
      { to: "/admin/settings", label: "Settings", icon: <Settings2 /> },
    ],
  },
];

const CRUMBS: Record<string, string> = {
  "/admin": "Analytics",
  "/admin/reports": "Reports",
  "/admin/audit": "Audit & Activity",
  "/admin/activity": "Activity Timeline",
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
  "/admin/approvals": "User Approvals",
  "/admin/entities": "Entities",
  "/admin/savings": "Savings",
  "/admin/recurring": "Recurring schedules",
  "/admin/loans": "Loans & Approvals",
  "/admin/payments": "Payments",
  "/admin/investments": "Investments & Shares",
  "/admin/security": "Security Centre",
  "/admin/logs": "Runtime Logs",
  "/admin/health": "Integration Health",

  "/admin/super-admins": "Super Admins",
  "/admin/super-admins/history": "Grant history",
  "/admin/roles": "Roles & Permissions",
  "/admin/branding": "Branding",
  "/admin/console": "Admin Console",
  "/admin/console/approvals": "Change approvals",
  "/admin/console/snapshots": "Backup & restore",
  "/admin/settings": "Settings",
};

function crumbFor(pathname: string) {
  if (pathname.startsWith("/admin/members/")) return "Member review";
  if (pathname.startsWith("/admin/entities/")) return "Entity details";
  return CRUMBS[pathname] ?? "Administration";
}

export const Route = createFileRoute("/_admin/admin")({
  head: () => ({
    meta: [{ title: "Administrator — IT-360 CashApp" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const breadcrumb = crumbFor(pathname);
  return (
    <PortalShell
      brand="IT-360 CashApp Admin"
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
