import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import {
  BanknoteArrowDown,
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
  ShieldCheck,
  KeyRound,
  Palette,
  Settings2,
  Bug,
  BellRing,
  Radio,
  Coins,
  FileText,
  PlugZap,
  Calculator,
  Archive,
  Percent,
  Lock,
  Timer,
  LayoutDashboard,
  LifeBuoy,
} from "lucide-react";
import { PortalShell, type NavGroup } from "@/components/portal-shell";

/**
 * Admin information architecture, organised the way enterprise back-office
 * systems are: one group per business domain, ordered by how often staff use
 * it. Every destination carries an explicit capability gate so a teller,
 * support officer or auditor never sees a link into an area they cannot use —
 * `PortalShell` filters items and drops groups that end up empty.
 *
 * Sub-pages that already have an in-page tab bar on their parent route
 * (security, change approvals, savings modules, super admins) are deliberately
 * absent here: the rail lists entry points, the page owns its sections.
 */
const groups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { to: "/admin", label: "Dashboard", icon: <LayoutDashboard /> },
      { to: "/admin/operations", label: "Operations", icon: <Activity />, cap: "reports.view" },
      { to: "/admin/analytics", label: "Analytics", icon: <BarChart3 />, cap: "reports.view" },
      {
        to: "/admin/live-users",
        label: "Live users",
        icon: <Radio />,
        cap: "security.view",
        roles: ["admin", "manager"],
      },
    ],
  },
  {
    label: "Membership",
    items: [
      {
        to: "/admin/approvals",
        label: "User approvals",
        icon: <UserCheck />,
        cap: "members.approve",
      },
      { to: "/admin/members", label: "Individuals (KYC)", icon: <Users />, cap: "kyc.view" },
      { to: "/admin/entities?type=group", label: "Groups", icon: <Users2 />, cap: "entities.view" },
      {
        to: "/admin/entities?type=department",
        label: "Departments",
        icon: <Building2 />,
        cap: "entities.view",
      },
      {
        to: "/admin/entities?type=institution",
        label: "Institutions",
        icon: <Landmark />,
        cap: "entities.view",
      },
    ],
  },
  {
    label: "Savings",
    items: [
      {
        to: "/admin/savings",
        label: "Accounts & posting",
        icon: <PiggyBank />,
        cap: "savings.view",
      },
      {
        to: "/admin/savings/withdrawals",
        label: "Withdrawal approvals",
        icon: <BanknoteArrowDown />,
        cap: "savings.approve",
      },
      {
        to: "/admin/savings/plans",
        label: "Plans & products",
        icon: <ClipboardList />,
        cap: "savings.edit",
      },
      { to: "/admin/savings/fixed", label: "Fixed deposits", icon: <Lock />, cap: "savings.view" },
      { to: "/admin/savings/holds", label: "Holds & liens", icon: <Scale />, cap: "savings.view" },
      {
        to: "/admin/savings/pots",
        label: "Group & susu pots",
        icon: <HandCoins />,
        cap: "savings.view",
      },
      {
        to: "/admin/savings/interest",
        label: "Interest runs",
        icon: <Percent />,
        cap: "savings.edit",
      },
      {
        to: "/admin/recurring",
        label: "Recurring schedules",
        icon: <RefreshCw />,
        cap: "savings.view",
      },
      {
        to: "/admin/savings/reconciliation",
        label: "Reconciliation",
        icon: <Scale />,
        cap: "savings.export",
      },
    ],
  },
  {
    label: "Lending",
    items: [
      {
        to: "/admin/loan-dashboard",
        label: "Loan officer dashboard",
        icon: <BadgeDollarSign />,
        cap: "loans.view",
      },
      {
        to: "/admin/loan-analytics",
        label: "Portfolio analytics",
        icon: <BadgeDollarSign />,
        cap: "loans.view",
      },
      {
        to: "/admin/loans",
        label: "Loan book & approvals",
        icon: <BadgeDollarSign />,
        cap: "loans.view",
      },
      {
        to: "/admin/loan-products",
        label: "Products & eligibility",
        icon: <ClipboardList />,
        cap: "loans.edit",
      },
      {
        to: "/admin/loan-arrears",
        label: "Arrears & collections",
        icon: <TrendingDown />,
        cap: "loans.view",
      },
      {
        to: "/admin/loan-workouts",
        label: "Workout approvals",
        icon: <Scale />,
        cap: "loans.approve",
      },
      {
        to: "/admin/loan-settlements",
        label: "Settlement approvals",
        icon: <ClipboardCheck />,
        cap: "loans.approve",
      },
      {
        to: "/admin/loan-provisions",
        label: "Loss provisioning",
        icon: <ShieldAlert />,
        cap: "loans.export",
      },
      {
        to: "/admin/loan-calculator",
        label: "Loan calculator",
        icon: <Calculator />,
        cap: "loans.view",
      },
    ],
  },
  {
    label: "Finance",
    items: [
      { to: "/admin/finance", label: "Finance dashboard", icon: <Wallet />, cap: "reports.view" },
      {
        to: "/admin/finance/summary",
        label: "Financial summary",
        icon: <ClipboardList />,
        cap: "reports.view",
      },
      {
        to: "/admin/finance/contributions",
        label: "Contributions",
        icon: <HandCoins />,
        cap: "savings.view",
      },
      { to: "/admin/finance/income", label: "Income", icon: <TrendingUp />, cap: "reports.view" },
      {
        to: "/admin/finance/breakdown",
        label: "Expense breakdown",
        icon: <TrendingDown />,
        cap: "reports.view",
      },
      {
        to: "/admin/finance/expenses",
        label: "Expense ledger",
        icon: <Receipt />,
        cap: "payments.view",
      },
      {
        to: "/admin/finance/transfers",
        label: "Transfers",
        icon: <Send />,
        cap: "payments.approve",
      },
      {
        to: "/admin/finance/adjustments",
        label: "Balance management",
        icon: <Scale />,
        cap: "payments.approve",
      },
      {
        to: "/admin/investments",
        label: "Investments & shares",
        icon: <TrendingUp />,
        cap: "payments.view",
      },
      { to: "/admin/fx", label: "Currency converter", icon: <Coins />, cap: "reports.view" },
    ],
  },
  {
    label: "Front office",
    items: [
      { to: "/admin/teller", label: "Teller mode", icon: <Calculator />, cap: "teller.view" },
      { to: "/admin/payments", label: "Payments", icon: <CreditCard />, cap: "payments.view" },
      {
        to: "/admin/payment-config",
        label: "Payment configuration",
        icon: <PlugZap />,
        cap: "payments.edit",
      },
      { to: "/admin/support", label: "Support queue", icon: <LifeBuoy />, cap: "support.view" },
    ],
  },
  {
    label: "Reporting",
    items: [
      { to: "/admin/reports", label: "Reports", icon: <FileBarChart />, cap: "reports.view" },
      {
        to: "/admin/exports",
        label: "Report exports",
        icon: <FileBarChart />,
        cap: "reports.export",
      },
      { to: "/admin/audit", label: "Audit & activity", icon: <History />, cap: "security.view" },
      {
        to: "/admin/activity",
        label: "Activity timeline",
        icon: <Activity />,
        cap: "security.view",
      },
      {
        to: "/admin/audit/transfers",
        label: "Transfer audit",
        icon: <ArrowLeftRight />,
        cap: "payments.view",
      },
      {
        to: "/admin/compliance/approvals",
        label: "Approval audit trail",
        icon: <ShieldCheck />,
        cap: "approvals.view",
      },
    ],
  },
  {
    label: "Records",
    items: [
      {
        to: "/admin/documents",
        label: "Document management",
        icon: <FileText />,
        cap: "documents.view",
      },
      { to: "/admin/files", label: "Member files", icon: <FileText />, cap: "files.view" },
      { to: "/admin/vault", label: "KYC vault", icon: <Archive />, cap: "kyc.delete" },
      {
        to: "/admin/relationships",
        label: "Relationship types",
        icon: <Users />,
        cap: "members.edit",
      },
    ],
  },
  {
    label: "Governance",
    items: [
      {
        to: "/admin/console",
        label: "Admin console",
        icon: <Settings2 />,
        cap: "settings.manage",
        roles: ["admin"],
      },
      {
        to: "/admin/change-approvals",
        label: "Change approvals",
        icon: <ClipboardList />,
        cap: "approvals.view",
      },
      { to: "/admin/roles", label: "Roles & permissions", icon: <KeyRound />, cap: "users.edit" },
      { to: "/admin/super-admins", label: "Super admins", icon: <Crown />, cap: "users.manage" },
    ],
  },
  {
    label: "Platform",
    items: [
      {
        to: "/admin/security",
        label: "Security centre",
        icon: <ShieldAlert />,
        cap: "security.view",
      },
      {
        to: "/admin/notifications",
        label: "Notification delivery",
        icon: <BellRing />,
        cap: "notifications.view",
      },
      {
        to: "/admin/logs",
        label: "Runtime logs",
        icon: <Bug />,
        cap: "security.view",
        roles: ["admin", "manager"],
      },
      {
        to: "/admin/recycle-bin",
        label: "Recycle bin & restore",
        icon: <Archive />,
        cap: "security.edit",
        roles: ["admin"],
      },
      {
        to: "/admin/log-recycle-bin",
        label: "Log recycle bin",
        icon: <Archive />,
        cap: "security.edit",
        roles: ["admin"],
      },
      {
        to: "/admin/cron-runs",
        label: "Scheduled jobs",
        icon: <Timer />,
        cap: "settings.manage",
        roles: ["admin"],
      },
      {
        to: "/admin/health",
        label: "Integration health",
        icon: <Activity />,
        cap: "settings.manage",
        roles: ["admin"],
      },
      {
        to: "/admin/branding",
        label: "Branding",
        icon: <Palette />,
        cap: "settings.manage",
        roles: ["admin"],
      },
      {
        to: "/admin/settings",
        label: "Settings",
        icon: <Settings2 />,
        cap: "settings.manage",
        roles: ["admin"],
      },
    ],
  },
];

const CRUMBS: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/operations": "Operations Dashboard",
  "/admin/analytics": "Analytics Dashboards",
  "/admin/live-users": "Live Users Online",
  "/admin/notifications": "Notification Delivery",
  "/admin/reports": "Reports",
  "/admin/exports": "Report Exports",
  "/admin/audit": "Audit & Activity",
  "/admin/activity": "Activity Timeline",
  "/admin/audit/transfers": "Transfer Audit",
  "/admin/fx": "Currency Converter",

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
  "/admin/entities/register": "Register entity",
  "/admin/relationships": "Relationship Types",

  "/admin/savings": "Savings",
  "/admin/savings/withdrawals": "Withdrawal approvals",
  "/admin/savings/plans": "Savings plans & products",
  "/admin/savings/fixed": "Fixed deposits",
  "/admin/savings/holds": "Holds & liens",
  "/admin/savings/pots": "Group & susu pots",
  "/admin/savings/interest": "Interest runs",
  "/admin/savings/reconciliation": "Savings reconciliation",
  "/admin/recurring": "Recurring schedules",

  "/admin/loans": "Loans & Approvals",
  "/admin/loan-dashboard": "Loan Dashboard",
  "/admin/loan-analytics": "Portfolio analytics",
  "/admin/loan-products": "Loan products & eligibility",
  "/admin/loan-calculator": "Loan Calculator",
  "/admin/loan-arrears": "Arrears & delinquency",
  "/admin/loan-workouts": "Workouts & write-offs",
  "/admin/loan-settlements": "Early settlement approvals",
  "/admin/loan-provisions": "Loan loss provisioning",

  "/admin/teller": "Teller Mode",
  "/admin/payments": "Payments",
  "/admin/payment-config": "Payment configuration",
  "/admin/investments": "Investments & Shares",
  "/admin/investments/audit": "Investment audit",
  "/admin/support": "Support Queue",

  "/admin/security": "Security Centre",
  "/admin/security/firewall": "Firewall & Rate Limits",
  "/admin/security/uploads": "Upload Scanning",
  "/admin/security/sessions": "Live Sessions",
  "/admin/security/alerts": "Alert notifications",
  "/admin/logs": "Runtime Logs",
  "/admin/log-recycle-bin": "Log Recycle Bin",
  "/admin/recycle-bin": "Recycle Bin & Restore Points",
  "/admin/health": "Integration Health",
  "/admin/cron-runs": "Scheduled Job Runs",

  "/admin/documents": "Document Management",
  "/admin/files": "Member Files",
  "/admin/vault": "KYC Vault",

  "/admin/super-admins": "Super Admins",
  "/admin/super-admins/history": "Grant history",
  "/admin/roles": "Roles & Permissions",
  "/admin/branding": "Branding",
  "/admin/compliance/approvals": "Approval Audit Trail",
  "/admin/console": "Admin Console",
  "/admin/change-approvals": "Change Approvals",
  "/admin/change-approvals/new": "Request a Change",
  "/admin/change-approvals/history": "Change Audit History",
  "/admin/change-approvals/sla": "SLA reminders",
  "/admin/console/approvals": "Staged settings queue",
  "/admin/console/snapshots": "Backup & restore",
  "/admin/settings": "Settings",
};

function crumbFor(pathname: string) {
  if (pathname.startsWith("/admin/members/")) return "Member review";
  if (pathname.startsWith("/admin/entities/")) return "Entity details";
  if (pathname.startsWith("/admin/loans/")) return "Loan file";
  if (/^\/admin\/change-approvals\/[0-9a-f-]{36}$/.test(pathname)) return "Change request";
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
    <PortalShell brand="IT-360 CashApp Admin" groups={groups} breadcrumb={breadcrumb}>
      <Outlet />
    </PortalShell>
  );
}
