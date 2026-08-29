import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
  StatusPill,
} from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";
import { Pagination } from "@/components/table-controls";
import { exportCsv, type ExportColumn } from "@/lib/exports";
import {
  exportCronRuns,
  listCronRuns,
  CRON_EXPORT_MAX,
  type CronRunRow,
} from "@/lib/cron-runs.functions";

const search = z.object({
  job: fallback(z.string(), "all").default("all"),
  status: fallback(z.string(), "all").default("all"),
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
  q: fallback(z.string(), "").default(""),
  page: fallback(z.number().int(), 1).default(1),
  pageSize: fallback(z.number().int(), 25).default(25),
});
type SearchInput = z.infer<typeof search>;

export const Route = createFileRoute("/_admin/admin/cron-runs")({
  validateSearch: zodValidator(search),
  head: () => ({
    meta: [
      { title: "Scheduled Job Runs — IT-360 CashApp" },
      {
        name: "description",
        content:
          "Auditor view of every scheduled job execution with status, attempts, metrics and CSV export.",
      },
      { property: "og:title", content: "Scheduled Job Runs — IT-360 CashApp" },
      {
        property: "og:description",
        content: "Filter and export the scheduled job run ledger for audit review.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CronRunsPage,
});

const STATUSES = ["all", "succeeded", "failed", "running"] as const;

function normalized(s: SearchInput) {
  const status = STATUSES.includes(s.status as (typeof STATUSES)[number]) ? s.status : "all";
  return {
    job: s.job || "all",
    status,
    from: s.from ? new Date(s.from).toISOString() : undefined,
    to: s.to ? new Date(new Date(s.to).getTime() + 86_400_000 - 1).toISOString() : undefined,
    search: s.q.trim().slice(0, 120) || undefined,
  };
}

const runsQuery = (s: SearchInput) =>
  queryOptions({
    queryKey: ["admin", "cron-runs", s],
    queryFn: () =>
      listCronRuns({
        data: {
          ...normalized(s),
          page: Math.max(1, s.page),
          pageSize: Math.min(200, Math.max(5, s.pageSize)),
        },
      }),
  });

function CronRunsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Governance"
        title="Scheduled Job Runs"
        description="Every nightly and manual job execution with its run key, attempt count, duration, metrics and failure reason. Filter, then export the exact filtered set for auditors."
      />
      <Suspense fallback={<SectionCardSkeleton title="Job run ledger" rows={8} cols={6} />}>
        <Content />
      </Suspense>
    </>
  );
}

const columns: ExportColumn<CronRunRow>[] = [
  { header: "Job", accessor: (r) => r.job },
  { header: "Run key", accessor: (r) => r.run_key },
  { header: "Status", accessor: (r) => r.status.toUpperCase() },
  { header: "Attempt", accessor: (r) => r.attempt, align: "right" },
  { header: "Started (UTC)", accessor: (r) => new Date(r.started_at).toISOString() },
  { header: "Finished (UTC)", accessor: (r) => (r.finished_at ? new Date(r.finished_at).toISOString() : "") },
  { header: "Duration (ms)", accessor: (r) => r.duration_ms ?? "", align: "right" },
  { header: "Caller", accessor: (r) => r.caller ?? "" },
  { header: "Error", accessor: (r) => r.error ?? "" },
  { header: "Metrics", accessor: (r) => JSON.stringify(r.metrics ?? {}) },
];

function Content() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data } = useSuspenseQuery(runsQuery(s));
  const [exporting, setExporting] = useState(false);

  const setSearch = (patch: Partial<SearchInput>) =>
    navigate({ search: (prev: SearchInput) => ({ ...prev, ...patch, page: patch.page ?? 1 }) });

  const filterLabel = [
    s.job !== "all" ? `job=${s.job}` : "all jobs",
    s.status !== "all" ? `status=${s.status}` : "all statuses",
    s.from ? `from ${s.from}` : null,
    s.to ? `to ${s.to}` : null,
    s.q ? `match "${s.q}"` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Full filtered export: fetches every matching row server-side (not just the
  // current page) so the auditor CSV matches the applied filters exactly.
  const downloadFiltered = async () => {
    setExporting(true);
    try {
      const res = await exportCronRuns({ data: normalized(s) });
      if (res.rows.length === 0) {
        toast.error("No rows match the current filters");
        return;
      }
      exportCsv({
        title: "Scheduled Job Runs",
        subtitle: `${res.rows.length} run(s) · ${filterLabel}`,
        filename: "cron_job_runs",
        columns,
        rows: res.rows,
      });
      toast.success(
        res.truncated
          ? `Exported the first ${CRON_EXPORT_MAX} rows — narrow the filters for a complete set.`
          : `Exported ${res.rows.length} run(s)`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <SectionCard
      title="Job run ledger"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void downloadFiltered()}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded border border-emerald-deep/15 bg-card px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-deep transition-colors hover:bg-cream disabled:cursor-not-allowed disabled:opacity-40"
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {exporting ? "Preparing…" : "Export all filtered (CSV)"}
          </button>
          <ExportBar
            permission="export:audit"
            title="Scheduled Job Runs (page)"
            subtitle={`${data.total} run(s) · ${filterLabel}`}
            filename="cron_job_runs_page"
            columns={columns}
            rows={data.rows}
          />
        </div>
      }
    >
      <div className="flex flex-wrap items-end gap-3 border-b border-emerald-deep/5 bg-cream/30 px-6 py-4">
        <Field label="Job">
          <select
            value={s.job}
            onChange={(e) => setSearch({ job: e.target.value })}
            className="rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs outline-none focus:border-emerald-mid"
          >
            <option value="all">All jobs</option>
            {data.jobs.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            value={s.status}
            onChange={(e) => setSearch({ status: e.target.value })}
            className="rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs outline-none focus:border-emerald-mid"
          >
            <option value="all">All statuses</option>
            <option value="succeeded">Succeeded</option>
            <option value="failed">Failed</option>
            <option value="running">Running</option>
          </select>
        </Field>
        <Field label="From">
          <input
            type="date"
            value={s.from}
            onChange={(e) => setSearch({ from: e.target.value })}
            className="rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs outline-none focus:border-emerald-mid"
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            value={s.to}
            onChange={(e) => setSearch({ to: e.target.value })}
            className="rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs outline-none focus:border-emerald-mid"
          />
        </Field>
        <Field label="Search">
          <input
            value={s.q}
            onChange={(e) => setSearch({ q: e.target.value })}
            placeholder="Run key, caller, error…"
            className="w-56 rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs outline-none focus:border-emerald-mid"
          />
        </Field>
        {(s.job !== "all" || s.status !== "all" || s.from || s.to || s.q) && (
          <button
            onClick={() =>
              navigate({
                search: {
                  job: "all",
                  status: "all",
                  from: "",
                  to: "",
                  q: "",
                  page: 1,
                  pageSize: s.pageSize,
                },
              })
            }
            className="rounded border border-emerald-deep/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-cream/50"
          >
            Reset
          </button>
        )}
      </div>

      {data.rows.length === 0 ? (
        <div className="p-6">
          <EmptyState
            title="No job runs match these filters"
            hint="Widen the date range or clear the status filter. Nightly jobs record one row per run key."
          />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Started</th>
                  <th className="px-6 py-3 font-medium">Job</th>
                  <th className="px-6 py-3 font-medium">Run key</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 text-right font-medium">Attempt</th>
                  <th className="px-6 py-3 text-right font-medium">Duration</th>
                  <th className="px-6 py-3 font-medium">Metrics / error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-deep/5">
                {data.rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="tabular px-6 py-4 text-xs text-muted-foreground">
                      {new Date(r.started_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium">{r.job}</td>
                    <td className="tabular px-6 py-4 text-xs">{r.run_key}</td>
                    <td className="px-6 py-4">
                      <StatusPill
                        status={
                          r.status === "succeeded"
                            ? "approved"
                            : r.status === "failed"
                              ? "rejected"
                              : "pending"
                        }
                      />
                    </td>
                    <td className="tabular px-6 py-4 text-right text-xs">{r.attempt}</td>
                    <td className="tabular px-6 py-4 text-right text-xs">
                      {r.duration_ms != null ? `${r.duration_ms} ms` : "—"}
                    </td>
                    <td className="max-w-md px-6 py-4 text-xs text-muted-foreground">
                      {r.error ? (
                        <span className="text-destructive">{r.error}</span>
                      ) : (
                        <code className="break-all text-[11px]">
                          {JSON.stringify(r.metrics ?? {})}
                        </code>
                      )}
                      {r.caller && (
                        <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                          {r.caller}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPage={(n) => setSearch({ page: n })}
            onPageSize={(n) => setSearch({ pageSize: n, page: 1 })}
          />
        </>
      )}
    </SectionCard>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
