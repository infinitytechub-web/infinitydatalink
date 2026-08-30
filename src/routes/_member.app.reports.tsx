import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { CheckCircle2, FileBarChart } from "lucide-react";
import { EmptyState, ErrorState, KPIStat, PageHeader, SectionCard } from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";
import { Pagination } from "@/components/table-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportRecordDetails } from "@/components/report-record-details";
import { StatementSchedulePanel } from "@/components/statement-schedule-panel";
import { formatMoney } from "@/lib/org-config";
import type { Permission } from "@/lib/auth";
import {
  MEMBER_DATASET_STATUSES,
  logMyReportExport,
  runMyReport,
} from "@/lib/member-reports.functions";
import { runMyReconciliation } from "@/lib/member-reconciliation.functions";
import { RECON_ISSUE_LABELS, type MemberReconIssue } from "@/lib/member-reconciliation.shared";
import {
  MEMBER_DATASET_HINTS,
  MEMBER_DATASET_LABELS,
  MEMBER_REPORT_DATASETS,
  type MemberReportDataset,
  type MemberReportRow,
} from "@/lib/member-reports.shared";
import type { ExportColumn } from "@/lib/exports";

/** Each statement is gated by the member's own-data export permission. */
const DATASET_PERMISSION: Record<MemberReportDataset, Permission> = {
  savings: "export:own_savings",
  loans: "export:own_loans",
  repayments: "export:own_loans",
  withdrawals: "export:own_savings",
  receipts: "export:own_statement",
  transactions: "export:own_transactions",
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const TO = iso(new Date());
const FROM = iso(new Date(Date.now() - 179 * 24 * 3600 * 1000));

const search = z.object({
  view: fallback(z.enum(["report", "reconciliation"]), "report").default("report"),
  dataset: fallback(z.enum(MEMBER_REPORT_DATASETS), "savings").default("savings"),
  from: fallback(z.string(), FROM).default(FROM),
  to: fallback(z.string(), TO).default(TO),
  status: fallback(z.string(), "all").default("all"),
  page: fallback(z.number(), 1).default(1),
  page_size: fallback(z.number(), 25).default(25),
  /** Deep link to an open record: "<dataset>:<uuid>". */
  record: fallback(z.string().optional(), undefined).optional(),
});

export const Route = createFileRoute("/_member/app/reports")({
  validateSearch: zodValidator(search),
  head: () => ({
    meta: [
      { title: "My reports & statements — IT-360 CashApp" },
      {
        name: "description",
        content:
          "View, reconcile, schedule and download your savings, loan, repayment, withdrawal, receipt and transaction statements.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error }) => <ErrorState title="Reports unavailable" message={error.message} />,
  notFoundComponent: () => (
    <EmptyState title="Nothing here" hint="This statement does not exist." />
  ),
  component: MemberReportsPage,
});

type Search = {
  view: "report" | "reconciliation";
  dataset: MemberReportDataset;
  from: string;
  to: string;
  status: string;
  page: number;
  page_size: number;
  record?: string | undefined;
};

function MemberReportsPage() {
  const s = Route.useSearch() as Search;
  const navigate = useNavigate({ from: Route.fullPath });

  const setSearch = (patch: Partial<Search>) =>
    void navigate({ search: (prev) => ({ ...prev, page: 1, ...patch }) });

  const openRecord = (dataset: MemberReportDataset, id: string) =>
    void navigate({ search: (prev) => ({ ...prev, record: `${dataset}:${id}` }) });
  const closeRecord = () => void navigate({ search: (prev) => ({ ...prev, record: undefined }) });

  const [recordDataset, recordId] = (s.record ?? "").split(":");
  const validRecord =
    recordDataset &&
    recordId &&
    (MEMBER_REPORT_DATASETS as readonly string[]).includes(recordDataset);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Member portal"
        title="Reports & statements"
        description="Pick a statement, choose a date range, open any row for full details, reconcile pending against cleared items, then download or schedule delivery. You only ever see your own records."
      />

      <SectionCard title="View">
        <div className="flex flex-wrap gap-2 p-4">
          {(
            [
              ["report", "Statements"],
              ["reconciliation", "Reconciliation"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSearch({ view: key })}
              className={
                s.view === key
                  ? "rounded border border-primary bg-primary px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-primary-foreground"
                  : "rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-deep hover:bg-cream"
              }
            >
              {label}
            </button>
          ))}
        </div>
      </SectionCard>

      {s.view === "report" ? (
        <>
          <SectionCard title="Statement">
            <div className="flex flex-wrap gap-2 p-4">
              {MEMBER_REPORT_DATASETS.map((d) => {
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
                    {MEMBER_DATASET_LABELS[d]}
                  </button>
                );
              })}
            </div>
            <p className="px-4 pb-4 text-xs text-muted-foreground">
              {MEMBER_DATASET_HINTS[s.dataset]}
            </p>
          </SectionCard>
          <Filters s={s} setSearch={setSearch} showStatus />
          <ReportView
            s={s}
            onPage={(n) => void navigate({ search: (prev) => ({ ...prev, page: n }) })}
            onPageSize={(n) =>
              void navigate({ search: (prev) => ({ ...prev, page: 1, page_size: n }) })
            }
            onOpenRecord={openRecord}
          />
          <StatementSchedulePanel dataset={s.dataset} />
        </>
      ) : (
        <>
          <Filters s={s} setSearch={setSearch} />
          <ReconciliationView s={s} onOpenRecord={openRecord} />
        </>
      )}

      {validRecord ? (
        <ReportRecordDetails
          dataset={recordDataset as MemberReportDataset}
          recordId={recordId as string}
          onClose={closeRecord}
        />
      ) : null}
    </div>
  );
}

function Filters({
  s,
  setSearch,
  showStatus,
}: {
  s: Search;
  setSearch: (patch: Partial<Search>) => void;
  showStatus?: boolean;
}) {
  const statuses = MEMBER_DATASET_STATUSES[s.dataset];
  return (
    <SectionCard title="Filters">
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
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
        {showStatus ? (
          <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Status
            <select
              value={s.status}
              onChange={(e) => setSearch({ status: e.target.value })}
              disabled={statuses.length === 0}
              className="mt-1 w-full rounded border border-emerald-deep/15 bg-card px-2 py-1.5 text-sm text-foreground disabled:opacity-50"
            >
              <option value="all">All statuses</option>
              {statuses.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </SectionCard>
  );
}

function ReportView({
  s,
  onPage,
  onPageSize,
  onOpenRecord,
}: {
  s: Search;
  onPage: (n: number) => void;
  onPageSize: (n: number) => void;
  onOpenRecord: (dataset: MemberReportDataset, id: string) => void;
}) {
  const fetchReport = useServerFn(runMyReport);
  const audit = useServerFn(logMyReportExport);
  const permission = DATASET_PERMISSION[s.dataset];

  const query = useQuery({
    queryKey: ["member", "reports", s.dataset, s.from, s.to, s.status, s.page, s.page_size],
    queryFn: () =>
      fetchReport({
        data: {
          dataset: s.dataset,
          date_from: s.from,
          date_to: s.to,
          status: s.status,
          page: s.page,
          page_size: s.page_size,
        },
      }),
    staleTime: 20_000,
  });

  const result = query.data;
  const columns: ExportColumn<MemberReportRow>[] = (result?.columns ?? []).map((c) => ({
    header: c.header,
    accessor: (row) => row[c.key] ?? "",
    align: c.align ?? "left",
  }));

  return (
    <>
      {result ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        title={MEMBER_DATASET_LABELS[s.dataset]}
        action={
          result && result.rows.length > 0 ? (
            <ExportBar
              title={MEMBER_DATASET_LABELS[s.dataset]}
              subtitle={`${s.from} → ${s.to} · ${s.status === "all" ? "all statuses" : s.status}`}
              filename={`my-${s.dataset}-${s.from}_${s.to}`}
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
                  {result.rows.map((row, i) => {
                    const recordId = row["record_id"] ? String(row["record_id"]) : null;
                    return (
                      <tr
                        key={i}
                        className="border-b border-emerald-deep/5 last:border-0 hover:bg-cream/30"
                      >
                        {result.columns.map((c, ci) => {
                          const raw = row[c.key];
                          const text = c.money ? formatMoney(Number(raw ?? 0)) : String(raw ?? "—");
                          const drill = ci === 0 && recordId;
                          return (
                            <td
                              key={c.key}
                              className={
                                c.align === "right"
                                  ? "px-4 py-2.5 text-right tabular"
                                  : "px-4 py-2.5"
                              }
                            >
                              {drill ? (
                                <button
                                  type="button"
                                  onClick={() => onOpenRecord(s.dataset, recordId)}
                                  className="font-semibold text-primary underline-offset-2 hover:underline"
                                >
                                  {text}
                                </button>
                              ) : (
                                text
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={result.page}
              pageSize={result.page_size}
              total={result.total}
              onPage={onPage}
              onPageSize={onPageSize}
            />
          </>
        )}
      </SectionCard>
    </>
  );
}

function ReconciliationView({
  s,
  onOpenRecord,
}: {
  s: Search;
  onOpenRecord: (dataset: MemberReportDataset, id: string) => void;
}) {
  const reconcile = useServerFn(runMyReconciliation);
  const query = useQuery({
    queryKey: ["member", "reconciliation", s.from, s.to],
    queryFn: () => reconcile({ data: { date_from: s.from, date_to: s.to } }),
    staleTime: 20_000,
  });
  const data = query.data;

  const exportColumns: ExportColumn<MemberReconIssue>[] = [
    { header: "Issue", accessor: (r) => RECON_ISSUE_LABELS[r.issue] },
    { header: "Reference", accessor: (r) => r.reference },
    { header: "Detail", accessor: (r) => r.detail },
    { header: "Date", accessor: (r) => r.occurred_on },
    { header: "Amount", accessor: (r) => formatMoney(r.amount), align: "right" },
  ];

  return (
    <>
      {data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPIStat
            label="Cleared"
            value={formatMoney(data.cleared_total)}
            hint={`${data.cleared_count} item(s)`}
          />
          <KPIStat
            label="Pending"
            value={formatMoney(data.pending_total)}
            hint={`${data.pending_count} awaiting posting`}
            accent={data.pending_count > 0}
          />
          <KPIStat
            label="Failed"
            value={formatMoney(data.failed_total)}
            hint={`${data.failed_count} item(s)`}
            accent={data.failed_count > 0}
          />
          <KPIStat
            label="Balance drift"
            value={formatMoney(data.net_drift)}
            hint={
              data.issues.length === 0
                ? "Everything reconciles"
                : `${data.issues.length} mismatch(es)`
            }
            accent={Math.abs(data.net_drift) > 0.01}
          />
        </div>
      ) : null}

      <SectionCard
        title="Mismatches"
        action={
          data && data.issues.length > 0 ? (
            <ExportBar
              title="My reconciliation"
              subtitle={`${s.from} → ${s.to} · ${data.issues.length} mismatch(es)`}
              filename={`my-reconciliation-${s.from}_${s.to}`}
              permission="export:own_statement"
              columns={exportColumns}
              rows={data.issues}
            />
          ) : undefined
        }
      >
        {query.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : query.isError ? (
          <div className="p-6 text-sm text-destructive">{(query.error as Error).message}</div>
        ) : !data || data.issues.length === 0 ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-mid" />
            Pending and cleared items agree — nothing needs your attention for this period.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-emerald-deep/10 text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Issue</th>
                  <th className="px-4 py-3 text-left font-medium">Reference</th>
                  <th className="px-4 py-3 text-left font-medium">What we found</th>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.issues.map((r) => (
                  <tr
                    key={r.key}
                    className="border-b border-emerald-deep/5 last:border-0 hover:bg-cream/30"
                  >
                    <td className="px-4 py-2.5">
                      <span className="rounded-full bg-destructive/10 px-2 py-1 text-[11px] font-semibold text-destructive">
                        {RECON_ISSUE_LABELS[r.issue]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => onOpenRecord(r.dataset as MemberReportDataset, r.record_id)}
                        className="font-semibold text-primary underline-offset-2 hover:underline"
                      >
                        {r.reference}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.detail}</td>
                    <td className="px-4 py-2.5">{r.occurred_on}</td>
                    <td className="tabular px-4 py-2.5 text-right">{formatMoney(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}
