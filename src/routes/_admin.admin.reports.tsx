import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { TrendChart, BarList } from "@/components/charts";
import { EmptyState, KPIStat, PageHeader, SectionCard } from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/org-config";
import {
  getReport,
  type AdminReport,
  type ReportBucket,
  type LoanStatusMix,
  type TopProduct,
} from "@/lib/admin-analytics.functions";
import { useAuth, type Permission } from "@/lib/auth";
import { Lock } from "lucide-react";

// Reports aggregates cross-domain data. Any admin role with at least one
// domain export permission may view; members and unauthenticated users are blocked.
const REPORT_VIEW_PERMISSIONS: Permission[] = [
  "export:members",
  "export:loans",
  "export:savings",
  "export:payments",
  "export:audit",
  "export:security",
];

const DEFAULT_TO = new Date();
const DEFAULT_FROM = new Date(DEFAULT_TO.getTime() - 29 * 24 * 3600 * 1000);
const iso = (d: Date) => d.toISOString().slice(0, 10);

const search = z.object({
  from: fallback(z.string(), iso(DEFAULT_FROM)).default(iso(DEFAULT_FROM)),
  to: fallback(z.string(), iso(DEFAULT_TO)).default(iso(DEFAULT_TO)),
  granularity: fallback(z.enum(["day", "week", "month"]), "day").default("day"),
});
type SearchInput = z.infer<typeof search>;

const reportQuery = (s: SearchInput) =>
  queryOptions({
    queryKey: ["admin", "report", s.from, s.to, s.granularity],
    queryFn: () => getReport({ data: { from: s.from, to: s.to, granularity: s.granularity } }),
    staleTime: 30_000,
  });

export const Route = createFileRoute("/_admin/admin/reports")({
  validateSearch: zodValidator(search),
  component: ReportsPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Reports failed to load: {(error as Error).message}</div>
  ),
});

function ReportsPage() {
  const { user, loading, hasAnyPermission } = useAuth();

  if (loading) return <Skeleton className="h-96 w-full" />;

  if (!user || !hasAnyPermission(REPORT_VIEW_PERMISSIONS)) {
    return (
      <>
        <PageHeader
          eyebrow="Administrator"
          title="Reports & analytics"
          description="Restricted analytics workspace."
        />
        <SectionCard title="Access denied">
          <div className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Lock className="h-4 w-4 text-brand-gold-ink dark:text-brand-gold" />
            {user
              ? "Your role does not include reporting privileges. Contact a Super Admin to be granted an admin role with export permissions."
              : "Sign in with an authorised admin account to view reports."}
          </div>
        </SectionCard>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Reports & analytics"
        description="Date-range analytics across membership growth, savings flow, loan disbursements and repayments."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <ReportsBody />
      </Suspense>
    </>
  );
}

function ReportsBody() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data } = useSuspenseQuery(reportQuery(s));

  const setSearch = (patch: Partial<SearchInput>) =>
    navigate({ search: (prev: SearchInput) => ({ ...prev, ...patch }) });

  const isEmpty =
    data.totals.new_members === 0 &&
    data.totals.contributions === 0 &&
    data.totals.disbursements === 0 &&
    data.totals.repayments === 0;

  return (
    <>
      <SectionCard title="Filters">
        <div className="flex flex-wrap items-end gap-3 p-4">
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
          <Field label="Granularity">
            <div className="inline-flex rounded border border-emerald-deep/15 bg-card p-0.5 text-[10px] uppercase tracking-widest">
              {(["day", "week", "month"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setSearch({ granularity: g })}
                  className={`rounded px-3 py-1 font-bold ${
                    s.granularity === g
                      ? "bg-emerald-deep text-cream"
                      : "text-muted-foreground hover:bg-cream/50"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </Field>
          <button
            onClick={() =>
              navigate({
                search: { from: iso(DEFAULT_FROM), to: iso(DEFAULT_TO), granularity: "day" },
              })
            }
            className="ml-auto rounded border border-emerald-deep/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-cream/50"
          >
            Reset
          </button>
        </div>
      </SectionCard>

      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat
          label="New members"
          value={<span className="tabular">{data.totals.new_members.toLocaleString()}</span>}
        />
        <KPIStat
          label="Contributions"
          value={
            <>
              GH₵ <span className="tabular">{formatMoneyShort(data.totals.contributions)}</span>
            </>
          }
        />
        <KPIStat
          label="Disbursements"
          value={
            <>
              GH₵ <span className="tabular">{formatMoneyShort(data.totals.disbursements)}</span>
            </>
          }
        />
        <KPIStat
          label="Repayments"
          value={
            <>
              GH₵ <span className="tabular">{formatMoneyShort(data.totals.repayments)}</span>
            </>
          }
        />
      </section>

      <SectionCard
        title="Trend"
        action={
          <ExportBar
            permission="export:members"
            title="Analytics Report"
            subtitle={`${s.from} to ${s.to} · ${s.granularity}`}
            filename={`analytics_${s.from}_to_${s.to}_${s.granularity}`}
            columns={[
              { header: "Bucket", accessor: (r: ReportBucket) => r.bucket },
              { header: "New members", accessor: (r) => r.new_members, align: "right" },
              {
                header: "Contributions",
                accessor: (r) => formatMoney(r.contributions),
                align: "right",
              },
              {
                header: "Disbursements",
                accessor: (r) => formatMoney(r.disbursements),
                align: "right",
              },
              { header: "Repayments", accessor: (r) => formatMoney(r.repayments), align: "right" },
            ]}
            rows={data.series}
          />
        }
      >
        {isEmpty ? (
          <div className="p-6">
            <EmptyState
              title="No activity in this range"
              hint="Widen the date range or seed activity."
            />
          </div>
        ) : (
          <div className="p-4">
            <TrendChart
              title="Activity trend"
              data={data.series}
              xKey="bucket"
              series={[
                { key: "new_members", label: "New members" },
                { key: "contributions", label: "Contributions", format: formatMoney },
                { key: "disbursements", label: "Disbursements", format: formatMoney },
                { key: "repayments", label: "Repayments", format: formatMoney },
              ]}
            />
          </div>
        )}
      </SectionCard>

      <div className="grid gap-8 lg:grid-cols-2">
        <StatusMix data={data} s={s} />
        <TopProducts data={data} s={s} />
      </div>
    </>
  );
}

function StatusMix({ data, s }: { data: AdminReport; s: SearchInput }) {
  return (
    <SectionCard
      title="Loan status mix"
      action={
        <ExportBar
          permission="export:loans"
          title="Loan status mix"
          subtitle={`${s.from} to ${s.to} · ${s.granularity}`}
          filename={`loan_status_mix_${s.from}_to_${s.to}`}
          columns={[
            { header: "Status", accessor: (r: LoanStatusMix) => r.status },
            { header: "Loans", accessor: (r) => r.count, align: "right" },
          ]}
          rows={data.loan_status_mix}
        />
      }
    >
      {data.loan_status_mix.length === 0 ? (
        <div className="p-6">
          <EmptyState title="No loan activity in range" />
        </div>
      ) : (
        <BarList
          rows={data.loan_status_mix.map((row) => ({ label: row.status, value: row.count }))}
        />
      )}
    </SectionCard>
  );
}

function TopProducts({ data, s }: { data: AdminReport; s: SearchInput }) {
  return (
    <SectionCard
      title="Top loan products"
      action={
        <ExportBar
          permission="export:loans"
          title="Top loan products"
          subtitle={`${s.from} to ${s.to} · ${s.granularity}`}
          filename={`top_loan_products_${s.from}_to_${s.to}`}
          columns={[
            { header: "Product", accessor: (r: TopProduct) => r.product },
            { header: "Loans", accessor: (r) => r.count, align: "right" },
            { header: "Total", accessor: (r) => formatMoney(r.total), align: "right" },
          ]}
          rows={data.top_products}
        />
      }
    >
      {data.top_products.length === 0 ? (
        <div className="p-6">
          <EmptyState title="No loan activity in range" />
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
              <th className="px-6 py-3 font-medium">Product</th>
              <th className="px-6 py-3 text-right font-medium">Loans</th>
              <th className="px-6 py-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-deep/5">
            {data.top_products.map((p) => (
              <tr key={p.product}>
                <td className="px-6 py-3 text-sm">{p.product}</td>
                <td className="tabular px-6 py-3 text-right text-sm">{p.count}</td>
                <td className="tabular px-6 py-3 text-right text-sm">{formatMoney(p.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionCard>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

function formatMoneyShort(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}
