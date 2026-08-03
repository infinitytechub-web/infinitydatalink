import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
  FileBarChart,
  ClipboardCheck,
  ClipboardList,
  Save,
  Lock,
  type LucideIcon,
} from "lucide-react";
import { PageHeader, SectionCard } from "@/components/primitives";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth, type AppRole } from "@/lib/auth";
import { listConsoleAuditLog, pendingChangeCount } from "@/lib/admin-settings.functions";

export const Route = createFileRoute("/_admin/admin/console")({
  head: () => ({
    meta: [
      { title: "Admin Console — IT-360 CashApp" },
      {
        name: "description",
        content:
          "Centralised control panel for administrator settings, governance, membership, operations, and audit trails.",
      },
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
  allowedRoles: AppRole[];
};

type Section = {
  title: string;
  description: string;
  tiles: Tile[];
};

const SUPER: AppRole[] = ["super_admin"];
const COMPLIANCE: AppRole[] = ["super_admin", "compliance_officer"];
const FINANCE: AppRole[] = ["super_admin", "finance_officer"];
const LOAN: AppRole[] = ["super_admin", "finance_officer", "loan_officer"];
const AUDIT: AppRole[] = ["super_admin", "auditor", "compliance_officer"];

const SECTIONS: Section[] = [
  {
    title: "Branding & Appearance",
    description: "Public identity, theming, and login presentation. Edits are staged for approval.",
    tiles: [
      { to: "/admin/branding", label: "Branding settings", description: "Name, logo, colors, favicon, login hero, footer.", icon: Palette, allowedRoles: SUPER },
      { to: "/admin/settings", label: "Institution settings", description: "Country preset, currency, national ID, providers.", icon: Settings2, allowedRoles: SUPER },
      { to: "/admin/console/approvals", label: "Change approvals", description: "Review staged setting edits before they go live.", icon: ClipboardList, allowedRoles: SUPER, badge: "2-person rule" },
      { to: "/admin/console/snapshots", label: "Backup & restore", description: "Download settings snapshots and restore safely.", icon: Save, allowedRoles: SUPER },
    ],
  },
  {
    title: "Access & Governance",
    description: "Who can do what, and how it is monitored.",
    tiles: [
      { to: "/admin/super-admins", label: "Super Admins", description: "Grant, revoke and audit super admin access.", icon: Crown, allowedRoles: SUPER },
      { to: "/admin/super-admins/history", label: "Grant history", description: "Timeline of super-admin grants and revocations.", icon: ClipboardCheck, allowedRoles: SUPER },
      { to: "/admin/roles", label: "Roles & permissions", description: "Assign staff roles and view effective permissions.", icon: KeyRound, allowedRoles: SUPER },
      { to: "/admin/security", label: "Security centre", description: "Scanner findings, passkeys, lockouts.", icon: ShieldAlert, allowedRoles: SUPER },
      { to: "/admin/health", label: "Integration health", description: "Live schema probes and RPC checks.", icon: Activity, allowedRoles: SUPER },
    ],
  },
  {
    title: "Membership",
    description: "Onboarding gates and member records.",
    tiles: [
      { to: "/admin/approvals", label: "User approvals", description: "Verify or reject pending sign-ups.", icon: UserCheck, allowedRoles: COMPLIANCE },
      { to: "/admin/members", label: "KYC queue", description: "Review individual verification submissions.", icon: Users, allowedRoles: COMPLIANCE },
      { to: "/admin/entities", label: "Entities registry", description: "Groups, departments, institutions.", icon: Building2, allowedRoles: COMPLIANCE },
      { to: "/admin/vault", label: "Account vault", description: "Restore deleted member KYC records within 30 days.", icon: Archive, allowedRoles: VAULT, badge: "Restore" },
    ],

  },
  {
    title: "Operations",
    description: "Day-to-day product surfaces.",
    tiles: [
      { to: "/admin/loans", label: "Loans & approvals", description: "Application review, approval and disbursement.", icon: BadgeDollarSign, allowedRoles: LOAN },
      { to: "/admin/recurring", label: "Recurring schedules", description: "Retry, cancel or inspect scheduled deposits.", icon: RefreshCw, allowedRoles: FINANCE },
      { to: "/admin/payments", label: "Payments", description: "Payment providers and gateways.", icon: CreditCard, allowedRoles: FINANCE },
      { to: "/admin/finance", label: "Financial dashboard", description: "Cash flow, income, expenses, transfers.", icon: Wallet, allowedRoles: FINANCE },
    ],
  },
  {
    title: "Audit & Compliance",
    description: "Trails, retention, and communications.",
    tiles: [
      { to: "/admin/audit", label: "Audit & activity", description: "Full audit log with filters and details.", icon: History, allowedRoles: AUDIT },
      { to: "/admin/audit/transfers", label: "Transfer audit", description: "Detailed member-to-member transfer trail.", icon: ArrowLeftRight, allowedRoles: AUDIT },
      { to: "/admin/reports", label: "Reports", description: "Period P&L, exports, reconciliation.", icon: FileBarChart, allowedRoles: AUDIT },
    ],
  },
];

function ConsoleTile({ tile, allowed, pendingCount }: { tile: Tile; allowed: boolean; pendingCount?: number }) {
  const Icon = tile.icon;
  const showPending =
    tile.to === "/admin/console/approvals" && typeof pendingCount === "number" && pendingCount > 0;

  const body = (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-primary/10 blur-2xl transition-opacity group-hover:opacity-100"
      />
      <div className="flex items-center gap-3">
        <span
          className={`grid size-10 place-items-center rounded-xl ring-1 ${
            allowed
              ? "bg-primary/10 text-primary ring-primary/20"
              : "bg-muted text-muted-foreground ring-border"
          }`}
        >
          {allowed ? <Icon className="size-5" /> : <Lock className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{tile.label}</p>
          <div className="mt-0.5 flex flex-wrap gap-1.5">
            {tile.badge ? (
              <span className="inline-block rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gold">
                {tile.badge}
              </span>
            ) : null}
            {showPending ? (
              <span className="inline-block rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                {pendingCount} pending
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{tile.description}</p>
      <span
        className={`mt-auto text-[11px] font-semibold uppercase tracking-widest ${
          allowed ? "text-primary/80 opacity-0 group-hover:opacity-100" : "text-muted-foreground"
        } transition-opacity`}
      >
        {allowed ? "Open →" : "Restricted"}
      </span>
    </>
  );

  const base =
    "group relative flex flex-col gap-3 overflow-hidden rounded-2xl border p-5 shadow-sm ring-1 ring-black/5 transition-all";

  if (!allowed) {
    return (
      <div
        className={`${base} border-border/40 bg-muted/30 opacity-70`}
        aria-disabled="true"
        title="You do not have permission to open this setting"
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      to={tile.to}
      className={`${base} border-border/60 bg-card hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg motion-reduce:transform-none`}
    >
      {body}
    </Link>
  );
}

function AdminConsolePage() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const canAny = (allowed: AppRole[]) => allowed.some((r) => roles.includes(r));

  const pendingFn = useServerFn(pendingChangeCount);
  const { data: pending } = useQuery({
    queryKey: ["settings-pending-count"],
    queryFn: () => pendingFn(),
    enabled: roles.includes("super_admin"),
    refetchInterval: 30_000,
  });

  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Admin console"
        description="Single control panel for every administrator setting — branding, access, membership, operations, and audit. Tiles you cannot open are locked."
      />

      <div className="space-y-6">
        {SECTIONS.map((section) => (
          <SectionCard key={section.title} title={section.title}>
            <p className="px-6 pt-4 text-xs text-muted-foreground">{section.description}</p>
            <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-3">
              {section.tiles.map((t) => (
                <ConsoleTile
                  key={t.to}
                  tile={t}
                  allowed={canAny(t.allowedRoles)}
                  pendingCount={pending ?? undefined}
                />
              ))}
            </div>
          </SectionCard>
        ))}

        {roles.includes("super_admin") ? <ConsoleAuditPanel /> : null}
      </div>
    </>
  );
}

function ConsoleAuditPanel() {
  const [email, setEmail] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const LIMIT = 25;

  const listFn = useServerFn(listConsoleAuditLog);

  const args = useMemo(
    () => ({
      emailContains: email.trim(),
      actionContains: action.trim(),
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
      limit: LIMIT,
      offset,
    }),
    [email, action, from, to, offset],
  );

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["console-audit", args],
    queryFn: () => listFn({ data: args }),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <SectionCard title="Audit log">
      <div className="grid gap-3 border-b border-border/60 px-6 py-4 md:grid-cols-4">
        <div>
          <Label htmlFor="al-email">Actor email contains</Label>
          <Input
            id="al-email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setOffset(0);
            }}
            placeholder="admin@…"
          />
        </div>
        <div>
          <Label htmlFor="al-action">Action contains</Label>
          <Input
            id="al-action"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setOffset(0);
            }}
            placeholder="role. / user. / loan."
          />
        </div>
        <div>
          <Label htmlFor="al-from">From</Label>
          <Input
            id="al-from"
            type="datetime-local"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setOffset(0);
            }}
          />
        </div>
        <div>
          <Label htmlFor="al-to">To</Label>
          <Input
            id="al-to"
            type="datetime-local"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setOffset(0);
            }}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-6 py-3">Time</th>
              <th className="px-6 py-3">Actor</th>
              <th className="px-6 py-3">Role</th>
              <th className="px-6 py-3">Action</th>
              <th className="px-6 py-3">Target</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                  {isFetching ? "Loading…" : "No entries match those filters."}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-border/40">
                  <td className="whitespace-nowrap px-6 py-3 text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-3">{r.actor_email ?? "—"}</td>
                  <td className="px-6 py-3 text-xs">{r.actor_role ?? "—"}</td>
                  <td className="px-6 py-3 font-mono text-xs">{r.action}</td>
                  <td className="px-6 py-3 font-mono text-xs text-muted-foreground">
                    {r.target ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-border/60 px-6 py-3 text-xs text-muted-foreground">
        <span>
          {total > 0
            ? `Showing ${offset + 1}–${Math.min(offset + LIMIT, total)} of ${total}`
            : "0 entries"}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0 || isFetching}
            onClick={() => setOffset(Math.max(0, offset - LIMIT))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + LIMIT >= total || isFetching}
            onClick={() => setOffset(offset + LIMIT)}
          >
            Next
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            Refresh
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}
