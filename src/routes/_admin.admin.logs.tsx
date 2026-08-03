import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, useEffect, useMemo, useState } from "react";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { AlertTriangle, RefreshCw, ShieldAlert, Bug, Radio } from "lucide-react";
import { ErrorState, KPIStat, PageHeader, SectionCard, SectionCardSkeleton } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { LogRetentionWidget } from "@/components/log-retention-widget";

const SearchSchema = z.object({
  kind: z.enum(["all", "route", "api", "rbac", "render", "network", "server", "other"]).catch("all").default("all"),
  severity: z.enum(["all", "error", "warning", "info"]).catch("all").default("all"),
  q: z.string().max(200).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1).default(1),
});
type Search = z.infer<typeof SearchSchema>;

const PAGE_SIZE = 50;

type LogRow = {
  id: string;
  occurred_at: string;
  kind: string;
  severity: string;
  route: string | null;
  message: string;
  stack: string | null;
  user_id: string | null;
  user_email: string | null;
  actor_role: string | null;
  user_agent: string | null;
  meta: Record<string, unknown> | null;
};

const listQuery = (s: Search) =>
  queryOptions({
    queryKey: ["admin", "runtime-error-logs", s],
    queryFn: async () => {
      let q = supabase
        .from("runtime_error_logs")
        .select("*", { count: "exact" })
        .order("occurred_at", { ascending: false });
      if (s.kind !== "all") q = q.eq("kind", s.kind);
      if (s.severity !== "all") q = q.eq("severity", s.severity);
      if (s.q) q = q.or(`message.ilike.%${s.q}%,route.ilike.%${s.q}%,user_email.ilike.%${s.q}%`);
      const from = (s.page - 1) * PAGE_SIZE;
      q = q.range(from, from + PAGE_SIZE - 1);
      const { data, count, error } = await q;
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as LogRow[], total: count ?? 0 };
    },
    staleTime: 5_000,
  });

const kpiQuery = queryOptions({
  queryKey: ["admin", "runtime-error-logs", "kpi"],
  queryFn: async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("runtime_error_logs")
      .select("kind, severity")
      .gte("occurred_at", since);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { kind: string; severity: string }[];
    return {
      total: rows.length,
      errors: rows.filter((r) => r.severity === "error").length,
      rbac: rows.filter((r) => r.kind === "rbac").length,
      api: rows.filter((r) => r.kind === "api" || r.kind === "network").length,
    };
  },
  staleTime: 10_000,
});

export const Route = createFileRoute("/_admin/admin/logs")({
  head: () => ({
    meta: [
      { title: "Runtime Error Logs — Administrator" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s) => SearchSchema.parse(s),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(listQuery(deps)),
      context.queryClient.ensureQueryData(kpiQuery),
    ]);
  },
  component: Page,
  errorComponent: ({ error }) => (
    <div className="p-6"><ErrorState title="Failed to load logs" message={error.message} /></div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm text-emerald-deep/70">Not found.</div>,
});

function Page() {
  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Runtime Error Logs"
        description="Live stream of route, API, RBAC, and render failures across the application."
      />
      <Suspense fallback={<SectionCardSkeleton title="Loading logs" rows={8} cols={5} />}>
        <Body />
      </Suspense>
    </>
  );
}

function Body() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const qc = useQueryClient();
  const { data: list } = useSuspenseQuery(listQuery(search));
  const { data: kpi } = useSuspenseQuery(kpiQuery);
  const [live, setLive] = useState(true);
  const [selected, setSelected] = useState<LogRow | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  // Realtime subscription
  useEffect(() => {
    if (!live) return;
    const channel = supabase
      .channel("runtime_error_logs_stream")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "runtime_error_logs" },
        () => {
          void qc.invalidateQueries({ queryKey: ["admin", "runtime-error-logs"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [live, qc]);

  const totalPages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));

  const update = (patch: Partial<Search>) =>
    navigate({ search: (prev: Search) => ({ ...prev, ...patch, page: patch.page ?? 1 }) });

  return (
    <>
      <div className="grid gap-4 p-6 pb-0 md:grid-cols-4">
        <KPIStat label="Events (24h)" value={kpi.total.toString()} />
        <KPIStat label="Errors" value={kpi.errors.toString()} tone="rose" />
        <KPIStat label="RBAC blocks" value={kpi.rbac.toString()} tone="gold" />
        <KPIStat label="API / network" value={kpi.api.toString()} tone="teal" />
      </div>

      <div className="p-6 pb-0">
        <LogRetentionWidget />
      </div>



      <SectionCard
        title="Live event feed"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={live ? "positive" : "neutral"}>{live ? "● Live" : "Paused"}</Badge>
            <Button size="sm" variant="outline" onClick={() => setLive((v) => !v)}>
              {live ? "Pause" : "Resume"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => qc.invalidateQueries({ queryKey: ["admin", "runtime-error-logs"] })}
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 border-b border-emerald-deep/10 p-4 md:grid-cols-4">
          <Input
            placeholder="Search message, route, user email…"
            defaultValue={search.q ?? ""}
            onChange={(e) => update({ q: e.target.value || undefined })}
          />
          <Select value={search.kind} onValueChange={(v) => update({ kind: v as Search["kind"] })}>
            <SelectTrigger><SelectValue placeholder="Kind" /></SelectTrigger>
            <SelectContent>
              {["all", "route", "api", "rbac", "render", "network", "server", "other"].map((k) => (
                <SelectItem key={k} value={k}>{k}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={search.severity} onValueChange={(v) => update({ severity: v as Search["severity"] })}>
            <SelectTrigger><SelectValue placeholder="Severity" /></SelectTrigger>
            <SelectContent>
              {["all", "error", "warning", "info"].map((k) => (
                <SelectItem key={k} value={k}>{k}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center justify-end gap-2 text-xs text-emerald-deep/60">
            Page {search.page} / {totalPages} · {list.total} total
            <Button size="sm" variant="ghost" disabled={search.page <= 1} onClick={() => update({ page: search.page - 1 })}>Prev</Button>
            <Button size="sm" variant="ghost" disabled={search.page >= totalPages} onClick={() => update({ page: search.page + 1 })}>Next</Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-cream/40 text-[10px] uppercase tracking-wider text-emerald-deep/60">
              <tr>
                <th className="p-3 text-left">Time</th>
                <th className="p-3 text-left">Kind</th>
                <th className="p-3 text-left">Severity</th>
                <th className="p-3 text-left">Route</th>
                <th className="p-3 text-left">User</th>
                <th className="p-3 text-left">Message</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.length === 0 ? (
                <tr><td colSpan={6} className="p-6 text-center text-emerald-deep/50">No events match the filters.</td></tr>
              ) : (
                list.rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelected(row)}
                    className="cursor-pointer border-t border-emerald-deep/5 hover:bg-cream/30"
                  >
                    <td className="p-3 font-mono text-[11px]">{new Date(row.occurred_at).toLocaleString()}</td>
                    <td className="p-3"><Badge tone={kindTone(row.kind)}>{row.kind}</Badge></td>
                    <td className="p-3"><Badge tone={severityTone(row.severity)}>{row.severity}</Badge></td>
                    <td className="p-3 font-mono text-[11px] text-emerald-deep/70">{row.route ?? "—"}</td>
                    <td className="p-3">{row.user_email ?? <span className="text-emerald-deep/40">anonymous</span>}</td>
                    <td className="p-3 max-w-[420px] truncate">{row.message}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {selected && <DetailsPanel row={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

type BadgeTone = "positive" | "neutral" | "warning" | "negative";
function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  const cls: Record<BadgeTone, string> = {
    positive: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    neutral: "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200",
    warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    negative: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls[tone]}`}>
      {children}
    </span>
  );
}

function kindTone(k: string): "positive" | "neutral" | "warning" | "negative" {
  if (k === "rbac") return "warning";
  if (k === "render" || k === "route" || k === "server") return "negative";
  return "neutral";
}
function severityTone(s: string): "positive" | "neutral" | "warning" | "negative" {
  if (s === "error") return "negative";
  if (s === "warning") return "warning";
  return "neutral";
}

function DetailsPanel({ row, onClose }: { row: LogRow; onClose: () => void }) {
  const metaJson = useMemo(() => JSON.stringify(row.meta ?? {}, null, 2), [row.meta]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-emerald-deep/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg border border-emerald-deep/15 bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-serif text-lg text-emerald-deep">{row.kind} · {row.severity}</h2>
            <p className="mt-1 text-[11px] font-mono text-emerald-deep/60">{new Date(row.occurred_at).toISOString()}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-2 text-xs">
          <Field label="Route" value={row.route} mono />
          <Field label="User" value={row.user_email ?? row.user_id ?? "anonymous"} />
          <Field label="Actor roles" value={row.actor_role} />
          <Field label="User agent" value={row.user_agent} mono />
        </dl>
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-deep/50">Message</p>
          <pre className="mt-1 whitespace-pre-wrap rounded bg-cream/40 p-3 text-xs">{row.message}</pre>
        </div>
        {row.stack && (
          <div className="mt-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-deep/50">Stack</p>
            <pre className="mt-1 max-h-[240px] overflow-auto whitespace-pre-wrap rounded bg-cream/40 p-3 text-[11px] font-mono">{row.stack}</pre>
          </div>
        )}
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-deep/50">Meta</p>
          <pre className="mt-1 max-h-[200px] overflow-auto whitespace-pre-wrap rounded bg-cream/40 p-3 text-[11px] font-mono">{metaJson}</pre>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigator.clipboard.writeText(JSON.stringify(row, null, 2))}
          >
            Copy JSON
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-28 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-emerald-deep/50">{label}</dt>
      <dd className={`min-w-0 flex-1 break-words ${mono ? "font-mono text-[11px]" : ""}`}>{value ?? "—"}</dd>
    </div>
  );
}
