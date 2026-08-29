import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { EyeOff, ShieldCheck } from "lucide-react";
import {
  EmptyState,
  KPIStat,
  SectionCard,
  SectionCardSkeleton,
} from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";
import { Pagination } from "@/components/table-controls";
import type { ExportColumn } from "@/lib/exports";
import { listSecurityEvents, type SecurityEvent } from "@/lib/security-centre.functions";

const search = z.object({
  category: fallback(z.enum(["all", "auth", "access", "security", "payments", "documents"]), "all").default("all"),
  severity: fallback(z.enum(["all", "info", "warning", "critical"]), "all").default("all"),
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
  q: fallback(z.string(), "").default(""),
  page: fallback(z.number().int(), 1).default(1),
  pageSize: fallback(z.number().int(), 25).default(25),
});
type SearchInput = z.infer<typeof search>;

export const Route = createFileRoute("/_admin/admin/security/")({
  validateSearch: zodValidator(search),
  component: EventsPage,
});

const eventsQuery = (s: SearchInput) =>
  queryOptions({
    queryKey: ["admin", "security", "events", s],
    queryFn: () =>
      listSecurityEvents({
        data: {
          category: s.category,
          severity: s.severity,
          from: s.from ? new Date(s.from).toISOString() : undefined,
          to: s.to ? new Date(new Date(s.to).getTime() + 86_400_000 - 1).toISOString() : undefined,
          q: s.q.trim() || undefined,
          page: Math.max(1, s.page),
          pageSize: Math.min(200, Math.max(5, s.pageSize)),
        },
      }),
    refetchInterval: 60_000,
  });

const SEVERITY_STYLE: Record<SecurityEvent["severity"], string> = {
  info: "bg-emerald-mid/10 text-emerald-mid",
  warning: "bg-gold/15 text-brand-gold-ink dark:text-brand-gold",
  critical: "bg-destructive/10 text-destructive",
};

const columns: ExportColumn<SecurityEvent>[] = [
  { header: "When (UTC)", accessor: (r) => new Date(r.created_at).toISOString() },
  { header: "Severity", accessor: (r) => r.severity.toUpperCase() },
  { header: "Action", accessor: (r) => r.action },
  { header: "Actor", accessor: (r) => r.actor },
  { header: "Role", accessor: (r) => r.actor_role ?? "" },
  { header: "Target", accessor: (r) => r.target ?? "" },
  { header: "IP", accessor: (r) => r.ip ?? "" },
];

function EventsPage() {
  return (
    <Suspense fallback={<SectionCardSkeleton title="Security events" rows={8} cols={6} />}>
      <Content />
    </Suspense>
  );
}

function Content() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data } = useSuspenseQuery(eventsQuery(s));
  const setSearch = (patch: Partial<SearchInput>) =>
    navigate({ search: (prev: SearchInput) => ({ ...prev, ...patch, page: patch.page ?? 1 }) });

  const field =
    "rounded border border-emerald-deep/15 bg-card px-3 py-2 text-xs text-emerald-deep focus:outline-none focus:ring-2 focus:ring-emerald-mid/30";

  return (
    <div className="space-y-6">
      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat label="Events (24h)" value={<span className="tabular">{data.kpis.events24h}</span>} />
        <KPIStat
          label="Critical (24h)"
          value={<span className="tabular">{data.kpis.critical24h}</span>}
          accent
        />
        <KPIStat label="Blocked (24h)" value={<span className="tabular">{data.kpis.blocked24h}</span>} />
        <KPIStat
          label="Live sessions"
          value={<span className="tabular">{data.kpis.liveSessions}</span>}
          hint="seen in last 5 min"
        />
      </section>

      <SectionCard
        title="Security events"
        action={
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-cream px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
              title={
                data.unmasked
                  ? "You hold security.manage — full network addresses are shown and the access is audited."
                  : "Network addresses are redacted for privacy. security.manage is required to reveal them."
              }
            >
              {data.unmasked ? <ShieldCheck className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              {data.unmasked ? "Full IP visible" : "IP redacted"}
            </span>
            <ExportBar
              permission="export:security"
              title="Security Events"
              subtitle={`${data.rows.length} event(s) on this page`}
              filename="security_events"
              columns={columns}
              rows={data.rows}
            />
          </div>
        }
      >
        <div className="flex flex-wrap items-end gap-3 border-b border-emerald-deep/5 px-6 py-4">
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Category
            <select
              className={field}
              value={s.category}
              onChange={(e) => setSearch({ category: e.target.value as SearchInput["category"] })}
            >
              <option value="all">All activity</option>
              <option value="auth">Authentication</option>
              <option value="access">Roles & access</option>
              <option value="security">Security controls</option>
              <option value="payments">Payments</option>
              <option value="documents">Documents</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Severity
            <select
              className={field}
              value={s.severity}
              onChange={(e) => setSearch({ severity: e.target.value as SearchInput["severity"] })}
            >
              <option value="all">Any</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            From
            <input type="date" className={field} value={s.from} onChange={(e) => setSearch({ from: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            To
            <input type="date" className={field} value={s.to} onChange={(e) => setSearch({ to: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Search
            <input
              className={field}
              placeholder="action, actor, target"
              value={s.q}
              onChange={(e) => setSearch({ q: e.target.value })}
            />
          </label>
        </div>

        {data.rows.length === 0 ? (
          <EmptyState title="No security events" hint="Nothing matches the current filters." />
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="px-6 py-3 font-medium">When</th>
                  <th className="px-6 py-3 font-medium">Severity</th>
                  <th className="px-6 py-3 font-medium">Action</th>
                  <th className="px-6 py-3 font-medium">Actor</th>
                  <th className="px-6 py-3 font-medium">Target</th>
                  <th className="px-6 py-3 text-right font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-deep/5">
                {data.rows.map((e) => (
                  <tr key={e.id}>
                    <td className="tabular px-6 py-4 text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${SEVERITY_STYLE[e.severity]}`}
                      >
                        {e.severity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold">{e.action}</td>
                    <td className="px-6 py-4 text-sm">
                      {e.actor}
                      {e.actor_role ? (
                        <span className="ml-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                          {e.actor_role}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{e.target ?? "—"}</td>
                    <td className="tabular px-6 py-4 text-right text-xs">{e.ip ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={s.page}
              pageSize={s.pageSize}
              total={data.total}
              onPage={(n) => setSearch({ page: n })}
              onPageSize={(n) => setSearch({ pageSize: n, page: 1 })}
            />
          </>
        )}
      </SectionCard>
    </div>
  );
}
