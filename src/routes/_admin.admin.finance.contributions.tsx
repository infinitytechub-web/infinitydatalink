import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Suspense, useMemo, useState } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { toast } from "sonner";
import {
  EmptyState,
  ErrorState,
  KPIGridSkeleton,
  KPIStat,
  Money,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
  StatusPill,
} from "@/components/primitives";
import { TrendChart, BarList } from "@/components/charts";
import { getContributionsReport, type ContributionsRow } from "@/lib/finance-reports.functions";
import { exportCsv, exportExcel, exportPdf, type ExportColumn } from "@/lib/exports";
import { formatMoney } from "@/lib/org-config";

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 24 * 3600 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

const dr = defaultRange();
const searchSchema = z.object({
  from: fallback(z.string(), dr.from).default(dr.from),
  to: fallback(z.string(), dr.to).default(dr.to),
});

const contribQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: ["admin", "contributions", from, to],
    queryFn: () => getContributionsReport({ data: { from, to } }),
    staleTime: 30_000,
  });

export const Route = createFileRoute("/_admin/admin/finance/contributions")({
  validateSearch: zodValidator(searchSchema),
  component: ContributionsPage,
  errorComponent: ({ error }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <ErrorState
          title="Contributions failed to load"
          message={error.message}
          onRetry={() => router.invalidate()}
        />
      </div>
    );
  },
});

function ContributionsPage() {
  const { from, to } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const setField = (k: "from" | "to", v: string) =>
    navigate({ search: (prev: { from: string; to: string }) => ({ ...prev, [k]: v }) });
  const [status, setStatus] = useState<"all" | "cleared" | "pending">("all");
  return (
    <>
      <PageHeader
        eyebrow="Reports"
        title="Contributions"
        description="Member deposits by period with plan breakdowns, trend view and exports."
        action={
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[11px] uppercase tracking-widest text-muted-foreground">
              From
              <input
                type="date"
                value={from}
                onChange={(e) => setField("from", e.target.value)}
                className="mt-1 block rounded-md border border-border bg-background px-2 py-1 text-sm"
              />
            </label>
            <label className="text-[11px] uppercase tracking-widest text-muted-foreground">
              To
              <input
                type="date"
                value={to}
                onChange={(e) => setField("to", e.target.value)}
                className="mt-1 block rounded-md border border-border bg-background px-2 py-1 text-sm"
              />
            </label>
          </div>
        }
      />
      <Suspense
        fallback={
          <div className="mt-6 space-y-8">
            <KPIGridSkeleton count={4} />
            <SectionCardSkeleton title="Ledger" rows={6} cols={5} />
          </div>
        }
      >
        <ContribBody from={from} to={to} status={status} setStatus={setStatus} />
      </Suspense>
    </>
  );
}

type DashRow = { section: string; label: string; value: string; count: string };

function exportDashboardCsv(
  from: string,
  to: string,
  data: Awaited<ReturnType<typeof getContributionsReport>>,
) {
  const rows: DashRow[] = [
    {
      section: "Summary",
      label: "Cleared total",
      value: Number(data.cleared_total).toFixed(2),
      count: String(data.cleared_count),
    },
    {
      section: "Summary",
      label: "Pending total",
      value: Number(data.pending_total).toFixed(2),
      count: String(data.pending_count),
    },
    ...data.by_plan.map((p) => ({
      section: "By plan",
      label: p.plan,
      value: Number(p.amount).toFixed(2),
      count: String(p.count),
    })),
    ...data.daily.map((d: any) => ({
      section: "Daily trend",
      label: d.day,
      value: Number(d.amount ?? 0).toFixed(2),
      count: "",
    })),
  ];
  exportCsv<DashRow>({
    title: `Contributions dashboard ${from} – ${to}`,
    filename: `contributions_dashboard_${from}_${to}`,
    columns: [
      { header: "Section", accessor: (r) => r.section },
      { header: "Label", accessor: (r) => r.label },
      { header: "Amount", accessor: (r) => r.value, align: "right" },
      { header: "Count", accessor: (r) => r.count, align: "right" },
    ],
    rows,
  });
}

function ContribBody({
  from,
  to,
  status,
  setStatus,
}: {
  from: string;
  to: string;
  status: "all" | "cleared" | "pending";
  setStatus: (s: "all" | "cleared" | "pending") => void;
}) {
  const { data } = useSuspenseQuery(contribQuery(from, to));
  const filtered = useMemo(
    () => (status === "all" ? data.rows : data.rows.filter((r) => r.status === status)),
    [data.rows, status],
  );

  const cols: ExportColumn<ContributionsRow>[] = [
    { header: "Ref", accessor: (r) => r.ref },
    { header: "Date", accessor: (r) => new Date(r.created_at).toLocaleString() },
    { header: "Member #", accessor: (r) => r.member_no ?? "" },
    { header: "Member", accessor: (r) => r.member_name ?? "" },
    { header: "Plan", accessor: (r) => r.plan_name ?? "" },
    { header: "Channel", accessor: (r) => r.channel ?? "" },
    { header: "Status", accessor: (r) => r.status },
    { header: "Amount", accessor: (r) => Number(r.amount).toFixed(2), align: "right" },
  ];

  const doExport = async (kind: "csv" | "excel" | "pdf") => {
    const opts = {
      title: `Contributions ${from} – ${to}`,
      filename: `contributions_${from}_${to}`,
      columns: cols,
      rows: filtered,
    };
    try {
      if (kind === "csv") exportCsv(opts);
      else if (kind === "excel") exportExcel(opts);
      else await exportPdf(opts);
      toast.success("Export ready");
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    }
  };

  return (
    <div className="mt-6 space-y-8">
      <section className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Period: <span className="tabular">{from}</span> → <span className="tabular">{to}</span>
        </p>
        <button
          type="button"
          onClick={() => {
            try {
              exportDashboardCsv(from, to, data);
              toast.success("Dashboard CSV ready");
            } catch (e: any) {
              toast.error(e?.message ?? "Export failed");
            }
          }}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted"
        >
          Export dashboard CSV
        </button>
      </section>
      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat
          label="Cleared (period)"
          value={<Money amount={data.cleared_total} />}
          accent
          hint={<>{data.cleared_count} deposits</>}
        />
        <KPIStat
          label="Pending"
          value={<Money amount={data.pending_total} />}
          hint={<>{data.pending_count} awaiting settlement</>}
        />
        <KPIStat
          label="Top plan"
          value={data.by_plan[0]?.plan ?? "—"}
          hint={data.by_plan[0] ? <Money amount={data.by_plan[0].amount} /> : null}
        />
        <KPIStat
          label="Active plans"
          value={<span className="tabular">{data.by_plan.length}</span>}
        />
      </section>

      <SectionCard title="Contributions trend">
        <div className="p-4 sm:p-6">
          <TrendChart
            data={data.daily}
            xKey="day"
            title="Daily contributions"
            series={[{ key: "amount", label: "Cleared", format: (v) => formatMoney(v) }]}
            height={220}
          />
        </div>
      </SectionCard>

      <SectionCard title="By plan">
        <BarList
          rows={data.by_plan.map((p) => ({
            label: p.plan,
            value: p.amount,
            hint: `${p.count} deposits`,
          }))}
          format={(v) => formatMoney(v)}
          emptyLabel="No cleared contributions in this window"
        />
      </SectionCard>

      <SectionCard
        title="Ledger"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="ledger-status">
              Status filter
            </label>
            <select
              id="ledger-status"
              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
            >
              <option value="all">All</option>
              <option value="cleared">Cleared</option>
              <option value="pending">Pending</option>
            </select>
            <div className="flex gap-1.5" role="group" aria-label="Export contributions">
              <button
                type="button"
                onClick={() => doExport("csv")}
                className="rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-muted"
              >
                CSV
              </button>
              <button
                type="button"
                onClick={() => doExport("excel")}
                className="rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-muted"
              >
                Excel
              </button>
              <button
                type="button"
                onClick={() => doExport("pdf")}
                className="rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-muted"
              >
                PDF
              </button>
            </div>
          </div>
        }
      >
        {filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No contributions"
              hint="Try widening the date range or clearing the status filter."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <caption className="sr-only">
                Contributions ledger from {from} to {to}
              </caption>
              <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left">
                    Ref
                  </th>
                  <th scope="col" className="px-6 py-3 text-left">
                    Date
                  </th>
                  <th scope="col" className="px-6 py-3 text-left">
                    Member
                  </th>
                  <th scope="col" className="px-6 py-3 text-left">
                    Plan
                  </th>
                  <th scope="col" className="px-6 py-3 text-right">
                    Amount
                  </th>
                  <th scope="col" className="px-6 py-3 text-left">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="px-6 py-3 font-mono text-xs">{r.ref}</td>
                    <td className="px-6 py-3 text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-3">{r.member_name ?? r.member_no ?? "—"}</td>
                    <td className="px-6 py-3 text-muted-foreground">{r.plan_name}</td>
                    <td className="px-6 py-3 text-right">
                      <Money amount={r.amount} />
                    </td>
                    <td className="px-6 py-3">
                      <StatusPill status={r.status as any} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
