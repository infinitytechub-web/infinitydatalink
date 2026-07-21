import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Palette,
  Settings2,
  Crown,
  KeyRound,
  ShieldAlert,
  Activity,
  UserCheck,
  Users,
  Building2,
  BadgeDollarSign,
  RefreshCw,
  CreditCard,
  Wallet,
  History,
  ArrowLeftRight,
  Mail,
  Trash2,
  FileBarChart,
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";
import { PageHeader, SectionCard } from "@/components/primitives";

export const Route = createFileRoute("/_admin/admin/console")({
  head: () => ({
    meta: [
      { title: "Admin Console — IT-360 CashApp" },
      { name: "description", content: "Centralised control panel for all administrator settings, governance, finance, membership, and system operations." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminConsolePage,
});

type Tile = {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
};

type Section = {
  title: string;
  description: string;
  tiles: Tile[];
};

const SECTIONS: Section[] = [
  {
    title: "Branding & Appearance",
    description: "Public identity, theming, and login presentation.",
    tiles: [
      { to: "/admin/branding", label: "Branding settings", description: "Name, logo, colors, favicon, login hero, footer.", icon: Palette },
      { to: "/admin/settings", label: "Institution settings", description: "Country preset, currency, national ID, providers.", icon: Settings2 },
    ],
  },
  {
    title: "Access & Governance",
    description: "Who can do what, and how it is monitored.",
    tiles: [
      { to: "/admin/super-admins", label: "Super Admins", description: "Grant, revoke and audit super admin access.", icon: Crown },
      { to: "/admin/super-admins/history", label: "Grant history", description: "Timeline of super-admin grants and revocations.", icon: ClipboardCheck },
      { to: "/admin/roles", label: "Roles & permissions", description: "Assign staff roles and view effective permissions.", icon: KeyRound },
      { to: "/admin/security", label: "Security centre", description: "Scanner findings, passkeys, lockouts.", icon: ShieldAlert },
      { to: "/admin/health", label: "Integration health", description: "Live schema probes and RPC checks.", icon: Activity },
    ],
  },
  {
    title: "Membership",
    description: "Onboarding gates and member records.",
    tiles: [
      { to: "/admin/approvals", label: "User approvals", description: "Verify or reject pending sign-ups.", icon: UserCheck },
      { to: "/admin/members", label: "KYC queue", description: "Review individual verification submissions.", icon: Users },
      { to: "/admin/entities", label: "Entities registry", description: "Groups, departments, institutions.", icon: Building2 },
    ],
  },
  {
    title: "Operations",
    description: "Day-to-day product surfaces.",
    tiles: [
      { to: "/admin/loans", label: "Loans & approvals", description: "Application review, approval and disbursement.", icon: BadgeDollarSign },
      { to: "/admin/recurring", label: "Recurring schedules", description: "Retry, cancel or inspect scheduled deposits.", icon: RefreshCw },
      { to: "/admin/payments", label: "Payments", description: "Payment providers and gateways.", icon: CreditCard },
      { to: "/admin/finance", label: "Financial dashboard", description: "Cash flow, income, expenses, transfers.", icon: Wallet },
    ],
  },
  {
    title: "Audit & Compliance",
    description: "Trails, retention, and communications.",
    tiles: [
      { to: "/admin/audit", label: "Audit & activity", description: "Full audit log with filters and details.", icon: History },
      { to: "/admin/audit/transfers", label: "Transfer audit", description: "Detailed member-to-member transfer trail.", icon: ArrowLeftRight },
      { to: "/admin/reports", label: "Reports", description: "Period P&L, exports, reconciliation.", icon: FileBarChart },
    ],
  },
];

function ConsoleTile({ tile }: { tile: Tile }) {
  const Icon = tile.icon;
  return (
    <Link
      to={tile.to}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-sm ring-1 ring-black/5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg motion-reduce:transform-none"
    >
      <span aria-hidden className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-primary/10 blur-2xl transition-opacity group-hover:opacity-100" />
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{tile.label}</p>
          {tile.badge ? (
            <span className="mt-0.5 inline-block rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gold">
              {tile.badge}
            </span>
          ) : null}
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{tile.description}</p>
      <span className="mt-auto text-[11px] font-semibold uppercase tracking-widest text-primary/80 opacity-0 transition-opacity group-hover:opacity-100">
        Open →
      </span>
    </Link>
  );
}

function AdminConsolePage() {
  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Admin console"
        description="A single control panel for every administrator setting in IT-360 CashApp — branding, access, membership, operations, and audit."
      />

      <div className="space-y-6">
        {SECTIONS.map((section) => (
          <SectionCard key={section.title} title={section.title}>
            <p className="px-6 pt-4 text-xs text-muted-foreground">{section.description}</p>
            <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-3">
              {section.tiles.map((t) => (
                <ConsoleTile key={t.to} tile={t} />
              ))}
            </div>
          </SectionCard>
        ))}
      </div>
    </>
  );
}
