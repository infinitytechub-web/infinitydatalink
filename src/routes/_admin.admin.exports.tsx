import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Lock, FileBarChart } from "lucide-react";
import { EmptyState, KPIStat, PageHeader, SectionCard } from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";
import { Pagination } from "@/components/table-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/org-config";
import { useAuth, type Permission } from "@/lib/auth";
import { datasetStatuses, logReportExport, runReport } from "@/lib/reports.functions";
import {
  DATASET_HINTS,
  DATASET_LABELS,
  REPORT_DATASETS,
  type ReportDataset,
  type ReportRow,
} from "@/lib/reports.shared";
import type { ExportColumn } from "@/lib/exports";

/** Each dataset is gated by the domain export permission it draws data from. */
const DATASET_PERMISSION: Record<ReportDataset, Permission> = {
  savings: "export:savings",
  loans: "export:loans",
  repayments: "export:loans",
  withdrawals: "export:savings",
  deposits: "export:savings",
  income: "export:payments",
  expenses: "export:payments",
  transactions: "export:payments",
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const TO = iso(new Date());
const FROM = iso(new Date(Date.now() - 29 * 24 * 3600 * 1000));

const search = z.object({
  dataset: fallback(z.enum(REPORT_DATASETS), "savings").default("savings"),
  from: fallback(z.string(), FROM).default(FROM),
  to: fallback(z.string(), TO).default(TO),
  status: fallback(z.string(), "all").default("all"),
  q: fallback(z.string(), "").default(""),
  page: fallback(z.number(), 1).default(1),
  page_size: fallback(z.number(), 50).default(50),
});

export const Route = createFileRoute("/_admin/admin/exports")({
  validateSearch: zodValidator(search),
  head: () => ({
    meta: [
      { title: "Report exports — IT-360 CashApp" },
      {
        name: "description",
        content:
          "Generate and download savings, loans, repayments, withdrawals, deposits, income, expense and transaction reports.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ExportsPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Report failed to load: {(error as Error).message}</div>
  ),
  notFoundComponent: () => (
    <div className="p-6 text-sm text-muted-foreground">Report not found.</div>
  ),
});

function ExportsPage() {
  const s = Route.useSearch() as {
    dataset: ReportDataset;
    from: string;
    to: string;
    status: string;
    q: string;
    page: number;
    page_size: number;
  };
  const navigate = useNavigate({ from: Route.fullPath });
  const { user, loading, hasPermission } = useAuth();
  const fetchReport = useServerFn(runReport);
  const audit = useServerFn(logReportExport);

  const permission = DATASET_PERMISSION[s.dataset];
  const allowed = !!user && hasPermission(permission);

  const setSearch = (patch: Partial<typeof s>) =>
    void navigate({ search: (prev) => ({ ...prev, page: 1, ...patch }) });

  const query = useQuery({
    queryKey: [
      "admin",
      "report-export",
      s.dataset,
      s.from,
      s.to,
      s.status,
      s.q,
      s.page,
      s.page_size,
    ],
    queryFn: () =>
      fetchReport({
        data: {
          dataset: s.dataset,
          date_from: s.from,
          date_to: s.to,
          status: s.status,
          search: s.q || undefined,
          page: s.page,
          page_size: s.page_size,
        },
      }),
    enabled: allowed,
    staleTime: 20_000,
  });

  if (loading) return <Skeleton className="h-96 w-full" />;

  const result = query.data;
  const columns: ExportColumn<ReportRow>[] = (result?.columns ?? []).map((c) => ({
    header: c.header,
    accessor: (row) => row[c.key] ?? "",
    align: c.align ?? "left",
  }));

  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Report exports"
        description="Filter any operational dataset by date, status or reference, review the figures, then download as CSV, Excel or PDF. Every download is audited."
      />

      <SectionCard title="Analytics dashboard report">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="max-w-2xl text-xs text-muted-foreground">
            Download the full analytics dashboard — KPI summary plus savings growth, withdrawal
            trend, loan performance and cancellation series with their mix breakdowns — as a
            multi-section CSV or a branded PDF report for the selected period and organisation
            scope.
          </p>
          <Link
            to="/admin/analytics"
            search={{ from: s.from, to: s.to, granularity: "week" as const, entity: "all" }}
            className="inline-flex items-center gap-1.5 rounded border border-primary bg-primary px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-primary-foreground hover:opacity-90"
          >
            <FileBarChart className="h-3 w-3" /> Open dashboard reports
          </Link>
        </div>
      </SectionCard>

      <SectionCard title="Report">
        <div className="flex flex-wrap gap-2 p-4">
          {REPORT_DATASETS.map((d) => {
            const active = d === s.dataset;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setSearch({ dataset: d, status: "all" })}
                className={
                  active
                    ? "rounded border border-primary bg-primary px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-primary-foreground"
                    : "rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-deep hover:bg-cream"
                }
              >
                {DATASET_LABELS[d]}
              </button>
            );
          })}
        </div>
        <p className="px-4 pb-4 text-xs text-muted-foreground">{DATASET_HINTS[s.dataset]}</p>
      </SectionCard>

      {!allowed ? (
        <SectionCard title="Access denied">
          <div className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Lock className="h-4 w-4 text-brand-gold-ink dark:text-brand-gold" />
            {user
              ? `Your role does not include the ${permission} permission needed for this report.`
              : "Sign in with an authorised admin account to run reports."}
          </div>
        </SectionCard>
      ) : (
        <>
          <SectionCard
            title="Filters"
            action={
              <Link
                to="/admin/reports"
                search={{ from: s.from, to: s.to, granularity: "day" as const }}
                className="text-primary underline-offset-2 hover:underline"
              >
                Analytics view →
              </Link>
            }
          >
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                From
                <input
                  type="date"
                  value={s.from}
                  onChange={(e) => setSearch({ from: e.target.value })}
                  className="mt-1 w-full rounded border border-emerald-deep/15 bg-card px-2 py-1.5 text-sm text-foreground"
                />
              </label>
              <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                To
                <input
                  type="date"
                  value={s.to}
                  onChange={(e) => setSearch({ to: e.target.value })}
                  className="mt-1 w-full rounded border border-emerald-deep/15 bg-card px-2 py-1.5 text-sm text-foreground"
                />
              </label>
              <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Status
                <select
                  value={s.status}
                  onChange={(e) => setSearch({ status: e.target.value })}
                  className="mt-1 w-full rounded border border-emerald-deep/15 bg-card px-2 py-1.5 text-sm text-foreground"
                >
                  <option value="all">All statuses</option>
                  {datasetStatuses(s.dataset).map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Search reference
                <input
                  value={s.q}
                  onChange={(e) => setSearch({ q: e.target.value })}
                  placeholder="Reference, vendor…"
                  className="mt-1 w-full rounded border border-emerald-deep/15 bg-card px-2 py-1.5 text-sm text-foreground"
                />
              </label>
            </div>
          </SectionCard>

          {result ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {result.summary.map((k) => (
                <KPIStat
                  key={k.label}
                  label={k.label}
                  value={k.money ? formatMoney(k.value) : k.value.toLocaleString()}
                />
              ))}
            </div>
          ) : null}

          <SectionCard
            title={DATASET_LABELS[s.dataset]}
            action={
              result && result.rows.length > 0 ? (
                <ExportBar
                  title={DATASET_LABELS[s.dataset]}
                  subtitle={`${s.from} → ${s.to} · ${s.status === "all" ? "all statuses" : s.status}`}
                  filename={`${s.dataset}-report-${s.from}_${s.to}`}
                  columns={columns}
                  rows={result.rows}
                  permission={permission}
                  onExport={(format) => {
                    void audit({
                      data: {
                        dataset: s.dataset,
                        format,
                        rows: result.rows.length,
                        date_from: s.from,
                        date_to: s.to,
                        status: s.status,
                      },
                    }).catch(() => undefined);
                  }}
                />
              ) : undefined
            }
          >
            {query.isPending ? (
              <Skeleton className="h-64 w-full" />
            ) : query.isError ? (
              <div className="p-6 text-sm text-destructive">{(query.error as Error).message}</div>
            ) : !result || result.rows.length === 0 ? (
              <EmptyState
                icon={<FileBarChart className="h-5 w-5" />}
                title="No records for this filter"
                hint="Widen the date range or clear the status filter."
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-emerald-deep/10 text-[10px] uppercase tracking-widest text-muted-foreground">
                      <tr>
                        {result.columns.map((c) => (
                          <th
                            key={c.key}
                            className={
                              c.align === "right"
                                ? "px-4 py-3 text-right font-medium"
                                : "px-4 py-3 text-left font-medium"
                            }
                          >
                            {c.header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, i) => (
                        <tr key={i} className="border-b border-emerald-deep/5 last:border-0">
                          {result.columns.map((c) => (
                            <td
                              key={c.key}
                              className={
                                c.align === "right"
                                  ? "px-4 py-2.5 text-right tabular"
                                  : "px-4 py-2.5"
                              }
                            >
                              {c.money
                                ? formatMoney(Number(row[c.key] ?? 0))
                                : String(row[c.key] ?? "—")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={result.page}
                  pageSize={result.page_size}
                  total={result.total}
                  onPage={(n) => void navigate({ search: (prev) => ({ ...prev, page: n }) })}
                  onPageSize={(n) =>
                    void navigate({ search: (prev) => ({ ...prev, page: 1, page_size: n }) })
                  }
                />
              </>
            )}
          </SectionCard>
        </>
      )}
    </>
  );
}
