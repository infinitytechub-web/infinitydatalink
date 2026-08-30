import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Lock } from "lucide-react";
import { TrendChart, BarList } from "@/components/charts";
import { EmptyState, KPIStat, PageHeader, SectionCard } from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/org-config";
import { useAuth, type Permission } from "@/lib/auth";
import {
  getAdminInsights,
  type SavingsBucket,
  type WithdrawalBucket,
  type LoanBucket,
  type CancellationBucket,
} from "@/lib/admin-insights.functions";

const VIEW_PERMISSIONS: Permission[] = [
  "export:members",
  "export:loans",
  "export:savings",
  "export:payments",
  "export:audit",
  "export:security",
];

const DEFAULT_TO = new Date();
const DEFAULT_FROM = new Date(DEFAULT_TO.getTime() - 89 * 24 * 3600 * 1000);
const iso = (d: Date) => d.toISOString().slice(0, 10);

const search = z.object({
  from: fallback(z.string(), iso(DEFAULT_FROM)).default(iso(DEFAULT_FROM)),
  to: fallback(z.string(), iso(DEFAULT_TO)).default(iso(DEFAULT_TO)),
  granularity: fallback(z.enum(["day", "week", "month"]), "week").default("week"),
});
type SearchInput = z.infer<typeof search>;

const insightsQuery = (s: SearchInput) =>
  queryOptions({
    queryKey: ["admin", "insights", s.from, s.to, s.granularity],
    queryFn: () => getAdminInsights({ data: { from: s.from, to: s.to, granularity: s.granularity } }),
    staleTime: 30_000,
  });

export const Route = createFileRoute("/_admin/admin/analytics")({
  validateSearch: zodValidator(search),
  head: () => ({
    meta: [
      { title: "Analytics dashboards — IT-360 CashApp Admin" },
      {
        name: "description",
        content:
          "Charts for savings growth, withdrawal trends, loan performance and batch cancellation rates.",
      },
      { property: "og:title", content: "Analytics dashboards — IT-360 CashApp Admin" },
      {
        property: "og:description",
        content: "Savings growth, withdrawal trends, loan performance and cancellation analytics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AnalyticsPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Analytics failed to load: {error.message}</div>
  ),
});

function AnalyticsPage() {
  const { user, loading, hasAnyPermission } = useAuth();
  if (loading) return <Skeleton className="h-96 w-full" />;

  if (!user || !hasAnyPermission(VIEW_PERMISSIONS)) {
    return (
      <>
        <PageHeader
          eyebrow="Administrator"
          title="Analytics dashboards"
          description="Restricted analytics workspace."
        />
        <SectionCard title="Access denied">
          <div className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Lock className="h-4 w-4 text-primary" />
            {user
              ? "Your role does not include analytics privileges."
              : "Sign in with an authorised admin account to view analytics."}
          </div>
        </SectionCard>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Analytics dashboards"
        description="Savings growth, withdrawal trends, loan performance and batch cancellation rates."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <AnalyticsBody />
      </Suspense>
    </>
  );
}

function AnalyticsBody() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data } = useSuspenseQuery(insightsQuery(s));
  const setSearch = (patch: Partial<SearchInput>) =>
    navigate({ search: (prev: SearchInput) => ({ ...prev, ...patch }) });

  const pctText = (v: number) => `${(v * 100).toFixed(1)}%`;
  const range = `${s.from} to ${s.to} · ${s.granularity}`;

  return (
    <>
      <SectionCard title="Filters">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Field label="From">
            <input
              type="date"
              value={s.from}
              onChange={(e) => setSearch({ from: e.target.value })}
              className="rounded border border-border bg-card px-3 py-1.5 text-xs outline-none focus:border-primary"
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={s.to}
              onChange={(e) => setSearch({ to: e.target.value })}
              className="rounded border border-border bg-card px-3 py-1.5 text-xs outline-none focus:border-primary"
            />
          </Field>
          <Field label="Granularity">
            <div className="inline-flex rounded border border-border bg-card p-0.5 text-[10px] uppercase tracking-widest">
              {(["day", "week", "month"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setSearch({ granularity: g })}
                  className={`rounded px-3 py-1 font-bold ${
                    s.granularity === g
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </Field>
          <button
            onClick={() =>
              navigate({ search: { from: iso(DEFAULT_FROM), to: iso(DEFAULT_TO), granularity: "week" } })
            }
            className="ml-auto rounded border border-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-muted"
          >
            Reset
          </button>
        </div>
      </SectionCard>

      {/* ---------------- Savings growth ---------------- */}
      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat label="Opening balance" value={<span className="tabular">{formatMoney(data.savings.opening_balance)}</span>} />
        <KPIStat label="Closing balance" value={<span className="tabular">{formatMoney(data.savings.closing_balance)}</span>} />
        <KPIStat label="Deposits in range" value={<span className="tabular">{formatMoney(data.savings.deposits_total)}</span>} />
        <KPIStat label="Growth" value={<span className="tabular">{pctText(data.savings.growth_rate)}</span>} />
      </section>

      <SectionCard
        title="Savings growth"
        action={
          <ExportBar
            permission="export:savings"
            title="Savings growth"
            subtitle={range}
            filename={`savings_growth_${s.from}_to_${s.to}`}
            columns={[
              { header: "Bucket", accessor: (r: SavingsBucket) => r.bucket },
              { header: "Deposits", accessor: (r) => formatMoney(r.deposits), align: "right" },
              { header: "Withdrawals", accessor: (r) => formatMoney(r.withdrawals), align: "right" },
              { header: "Net", accessor: (r) => formatMoney(r.net), align: "right" },
              { header: "Cumulative", accessor: (r) => formatMoney(r.cumulative), align: "right" },
            ]}
            rows={data.savings.series}
          />
        }
      >
        {data.savings.series.length === 0 ? (
          <div className="p-6"><EmptyState title="No savings activity in range" /></div>
        ) : (
          <div className="p-4">
            <TrendChart
              variant="area"
              title="Savings growth"
              data={data.savings.series}
              xKey="bucket"
              series={[
                { key: "cumulative", label: "Balance", format: formatMoney },
                { key: "deposits", label: "Deposits", format: formatMoney },
                { key: "withdrawals", label: "Withdrawals", format: formatMoney },
              ]}
            />
          </div>
        )}
      </SectionCard>

      {/* ---------------- Withdrawal trends ---------------- */}
      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <PremiumStatCard
          tone="violet"
          icon={<Wallet className="size-4" />}
          label="Requested"
          value={<span className="tabular">{formatMoney(data.withdrawals.requested_total)}</span>}
          spark={data.withdrawals.series.map((r) => r.amount)}
        />
        <PremiumStatCard
          tone="emerald"
          icon={<BadgeCheck className="size-4" />}
          label="Paid out"
          value={<span className="tabular">{formatMoney(data.withdrawals.paid_total)}</span>}
          spark={data.withdrawals.series.map((r) => r.paid)}
        />
        <PremiumStatCard
          tone="sky"
          icon={<PercentCircle className="size-4" />}
          label="Approval rate"
          value={<span className="tabular">{pctText(data.withdrawals.approval_rate)}</span>}
          progress={data.withdrawals.approval_rate}
        />
        <PremiumStatCard
          tone="gold"
          icon={<Timer className="size-4" />}
          label="Avg decision time"
          value={<span className="tabular">{data.withdrawals.avg_decision_hours.toFixed(1)}h</span>}
          hint="Request submitted to decision"
        />
      </section>


      <SectionCard
        title="Withdrawal trends"
        action={
          <ExportBar
            permission="export:savings"
            title="Withdrawal trends"
            subtitle={range}
            filename={`withdrawal_trends_${s.from}_to_${s.to}`}
            columns={[
              { header: "Bucket", accessor: (r: WithdrawalBucket) => r.bucket },
              { header: "Requested", accessor: (r) => r.requested, align: "right" },
              { header: "Approved", accessor: (r) => r.approved, align: "right" },
              { header: "Paid", accessor: (r) => r.paid, align: "right" },
              { header: "Rejected", accessor: (r) => r.rejected, align: "right" },
              { header: "Cancelled", accessor: (r) => r.cancelled, align: "right" },
              { header: "Amount", accessor: (r) => formatMoney(r.amount), align: "right" },
            ]}
            rows={data.withdrawals.series}
          />
        }
      >
        {data.withdrawals.series.length === 0 ? (
          <div className="p-6"><EmptyState title="No withdrawal activity in range" /></div>
        ) : (
          <div className="p-4">
            <TrendChart
              variant="area"
              title="Withdrawal trends"
              data={data.withdrawals.series}
              xKey="bucket"
              series={[
                { key: "requested", label: "Requested" },
                { key: "approved", label: "Approved" },
                { key: "paid", label: "Paid" },
                { key: "rejected", label: "Rejected" },
                { key: "cancelled", label: "Cancelled" },
              ]}
            />
          </div>
        )}
      </SectionCard>

      <div className="grid gap-8 lg:grid-cols-2">
        <SectionCard title="Withdrawal status mix">
          <BarList rows={data.withdrawals.status_mix} emptyLabel="No withdrawals in range" />
        </SectionCard>
        <SectionCard title="Withdrawal channels">
          <BarList rows={data.withdrawals.channel_mix} emptyLabel="No withdrawals in range" />
        </SectionCard>
      </div>

      {/* ---------------- Loan performance ---------------- */}
      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <PremiumStatCard
          tone="royal"
          icon={<Landmark className="size-4" />}
          label="Disbursed"
          value={<span className="tabular">{formatMoney(data.loans.disbursed_total)}</span>}
          spark={data.loans.series.map((r) => r.disbursed)}
        />
        <PremiumStatCard
          tone="emerald"
          icon={<HandCoins className="size-4" />}
          label="Repaid"
          value={<span className="tabular">{formatMoney(data.loans.repaid_total)}</span>}
          spark={data.loans.series.map((r) => r.repaid)}
        />
        <PremiumStatCard
          tone="sky"
          icon={<Timer className="size-4" />}
          label="On-time rate"
          value={<span className="tabular">{pctText(data.loans.on_time_rate)}</span>}
          progress={data.loans.on_time_rate}
        />
        <PremiumStatCard
          tone="rose"
          icon={<AlertTriangle className="size-4" />}
          label="Overdue installments"
          value={<span className="tabular">{data.loans.overdue_installments.toLocaleString()}</span>}
          hint="Instalments past their due date"
        />
      </section>

      <SectionCard title="Portfolio health" accent="sky">
        <div className="grid grid-cols-2 gap-6 p-6 sm:grid-cols-4">
          <ProgressRing value={data.loans.on_time_rate} label="On-time repayment" tone={0} />
          <ProgressRing
            value={data.loans.disbursed_total > 0 ? data.loans.repaid_total / data.loans.disbursed_total : 0}
            label="Repaid vs disbursed"
            tone={1}
          />
          <ProgressRing value={data.withdrawals.approval_rate} label="Withdrawal approvals" tone={2} />
          <ProgressRing value={data.cancellations.cancellation_rate} label="Cancellation rate" tone={4} />
        </div>
      </SectionCard>


      <SectionCard
        title="Loan performance"
        action={
          <ExportBar
            permission="export:loans"
            title="Loan performance"
            subtitle={range}
            filename={`loan_performance_${s.from}_to_${s.to}`}
            columns={[
              { header: "Bucket", accessor: (r: LoanBucket) => r.bucket },
              { header: "Applications", accessor: (r) => r.applications, align: "right" },
              { header: "Disbursed", accessor: (r) => formatMoney(r.disbursed), align: "right" },
              { header: "Repaid", accessor: (r) => formatMoney(r.repaid), align: "right" },
            ]}
            rows={data.loans.series}
          />
        }
      >
        {data.loans.series.length === 0 ? (
          <div className="p-6"><EmptyState title="No loan activity in range" /></div>
        ) : (
          <div className="p-4">
            <TrendChart
              variant="area"
              title="Loan performance"
              data={data.loans.series}
              xKey="bucket"
              series={[
                { key: "disbursed", label: "Disbursed", format: formatMoney },
                { key: "repaid", label: "Repaid", format: formatMoney },
                { key: "applications", label: "Applications" },
              ]}
            />
          </div>
        )}
      </SectionCard>

      <div className="grid gap-8 lg:grid-cols-2">
        <SectionCard title="Loan status mix">
          <BarList rows={data.loans.status_mix} emptyLabel="No loans in range" />
        </SectionCard>
        <SectionCard title="Exposure by product">
          <BarList rows={data.loans.product_mix} format={formatMoney} emptyLabel="No loans in range" />
        </SectionCard>
      </div>

      {/* ---------------- Cancellation rates ---------------- */}
      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <PremiumStatCard
          tone="slate"
          icon={<Ban className="size-4" />}
          label="Requests"
          value={<span className="tabular">{data.cancellations.total_requests.toLocaleString()}</span>}
          spark={data.cancellations.series.map((r) => r.total)}
        />
        <PremiumStatCard
          tone="rose"
          icon={<XCircle className="size-4" />}
          label="Cancelled"
          value={<span className="tabular">{data.cancellations.total_cancelled.toLocaleString()}</span>}
          spark={data.cancellations.series.map((r) => r.cancelled)}
        />
        <PremiumStatCard
          tone="violet"
          icon={<PercentCircle className="size-4" />}
          label="Cancellation rate"
          value={<span className="tabular">{pctText(data.cancellations.cancellation_rate)}</span>}
          progress={data.cancellations.cancellation_rate}
          hint="Share of requests withdrawn before payout"
        />
        <PremiumStatCard
          tone="gold"
          icon={<ShieldAlert className="size-4" />}
          label="Admin-initiated share"
          value={<span className="tabular">{pctText(data.cancellations.admin_share)}</span>}
          progress={data.cancellations.admin_share}
          hint="Cancellations performed by staff"
        />
      </section>


      <SectionCard
        title="Batch cancellation rates"
        action={
          <ExportBar
            permission="export:audit"
            title="Batch cancellation rates"
            subtitle={range}
            filename={`cancellation_rates_${s.from}_to_${s.to}`}
            columns={[
              { header: "Bucket", accessor: (r: CancellationBucket) => r.bucket },
              { header: "Requests", accessor: (r) => r.total, align: "right" },
              { header: "Cancelled", accessor: (r) => r.cancelled, align: "right" },
              { header: "Admin", accessor: (r) => r.admin_cancelled, align: "right" },
              { header: "Member", accessor: (r) => r.member_cancelled, align: "right" },
              { header: "Rate %", accessor: (r) => r.rate, align: "right" },
            ]}
            rows={data.cancellations.series}
          />
        }
      >
        {data.cancellations.total_requests === 0 ? (
          <div className="p-6"><EmptyState title="No withdrawal requests in range" /></div>
        ) : (
          <div className="p-4">
            <TrendChart
              variant="area"
              title="Batch cancellation rates"
              data={data.cancellations.series}
              xKey="bucket"
              series={[
                { key: "rate", label: "Cancellation rate %", format: (v) => `${v.toFixed(1)}%` },
                { key: "admin_cancelled", label: "Admin cancelled" },
                { key: "member_cancelled", label: "Member cancelled" },
              ]}
            />
          </div>
        )}
      </SectionCard>

      <SectionCard title="Top cancellation reasons">
        <BarList rows={data.cancellations.reason_mix} emptyLabel="No cancellations in range" />
      </SectionCard>
    </>
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
