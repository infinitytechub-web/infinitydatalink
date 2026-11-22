import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import {
  AlertTriangle,
  ArrowDownToLine,
  BadgeCheck,
  Ban,
  HandCoins,
  Landmark,
  Lock,
  PercentCircle,
  PiggyBank,
  ShieldAlert,
  Sparkles,
  Timer,
  TrendingUp,
  Wallet,
  XCircle,
} from "lucide-react";
import { TrendChart, BarList } from "@/components/charts";
import { EmptyState, PageHeader, SectionCard } from "@/components/primitives";
import { PremiumStatCard, ProgressRing } from "@/components/premium";
import { ExportBar } from "@/components/export-bar";
import { AnalyticsReportButton } from "@/components/analytics-report-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { DrilldownDialog, type DrilldownTarget } from "@/components/analytics-drilldown";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/org-config";
import { useAuth, type Permission } from "@/lib/auth";
import { listEntities } from "@/lib/admin-entities.functions";
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

/** Quick date-range presets applied to the URL search params. */
const PRESETS: { id: string; label: string; days: number | "ytd" | "mtd" }[] = [
  { id: "7d", label: "7 days", days: 6 },
  { id: "30d", label: "30 days", days: 29 },
  { id: "mtd", label: "Month to date", days: "mtd" },
  { id: "90d", label: "90 days", days: 89 },
  { id: "ytd", label: "Year to date", days: "ytd" },
  { id: "12m", label: "12 months", days: 364 },
];

function presetRange(days: number | "ytd" | "mtd") {
  const now = new Date();
  if (days === "ytd") return { from: `${now.getUTCFullYear()}-01-01`, to: iso(now) };
  if (days === "mtd") return { from: `${iso(now).slice(0, 7)}-01`, to: iso(now) };
  return { from: iso(new Date(now.getTime() - days * 24 * 3600 * 1000)), to: iso(now) };
}

const search = z.object({
  from: fallback(z.string(), iso(DEFAULT_FROM)).default(iso(DEFAULT_FROM)),
  to: fallback(z.string(), iso(DEFAULT_TO)).default(iso(DEFAULT_TO)),
  granularity: fallback(z.enum(["day", "week", "month"]), "week").default("week"),
  /** Organisation scope: "all" or an entity id. */
  entity: fallback(z.string(), "all").default("all"),
});
type SearchInput = z.infer<typeof search>;

const insightsQuery = (s: SearchInput) =>
  queryOptions({
    queryKey: ["admin", "insights", s.from, s.to, s.granularity, s.entity],
    queryFn: () =>
      getAdminInsights({
        data: { from: s.from, to: s.to, granularity: s.granularity, entity: s.entity },
      }),
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
    <div className="p-6 text-sm text-destructive">Analytics failed to load: {(error as Error).message}</div>
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

  // Organisation scope options. Failures degrade to institution-wide only.
  const { data: entities } = useQuery({
    queryKey: ["admin", "entities", "scope-select"],
    queryFn: () => listEntities({ data: { page: 1, pageSize: 100, status: "active" } }),
    staleTime: 300_000,
  });
  const entityLabel =
    s.entity === "all"
      ? "All organisations"
      : (entities?.rows.find((e) => e.id === s.entity)?.name ?? "Selected organisation");

  const [drilldown, setDrilldown] = useState<DrilldownTarget | null>(null);
  const open = (t: Omit<DrilldownTarget, "from" | "to">) =>
    setDrilldown({ ...t, from: s.from, to: s.to });

  const pctText = (v: number) => `${(v * 100).toFixed(1)}%`;
  const range = `${s.from} to ${s.to} · ${s.granularity} · ${entityLabel}`;

  const kpiRows = [
    { metric: "Opening balance", value: formatMoney(data.savings.opening_balance) },
    { metric: "Closing balance", value: formatMoney(data.savings.closing_balance) },
    { metric: "Deposits in range", value: formatMoney(data.savings.deposits_total) },
    { metric: "Withdrawals in range", value: formatMoney(data.savings.withdrawals_total) },
    { metric: "Savings growth", value: pctText(data.savings.growth_rate) },
    { metric: "Withdrawals requested", value: formatMoney(data.withdrawals.requested_total) },
    { metric: "Withdrawals paid", value: formatMoney(data.withdrawals.paid_total) },
    { metric: "Withdrawal approval rate", value: pctText(data.withdrawals.approval_rate) },
    { metric: "Avg decision hours", value: data.withdrawals.avg_decision_hours.toFixed(1) },
    { metric: "Loans disbursed", value: formatMoney(data.loans.disbursed_total) },
    { metric: "Loans repaid", value: formatMoney(data.loans.repaid_total) },
    { metric: "Outstanding principal", value: formatMoney(data.loans.outstanding_principal) },
    { metric: "On-time repayment rate", value: pctText(data.loans.on_time_rate) },
    { metric: "Overdue instalments", value: String(data.loans.overdue_installments) },
    { metric: "Cancellation rate", value: pctText(data.cancellations.cancellation_rate) },
    { metric: "Admin-initiated cancellations", value: pctText(data.cancellations.admin_share) },
  ];

  return (
    <>
      <SectionCard
        title="Filters & scope"
        action={
          <div className="flex items-center gap-2">
            <ExportBar
              permission="export:audit"
              title="Analytics KPI summary"
              subtitle={range}
              filename={`analytics_kpis_${s.from}_to_${s.to}`}
              columns={[
                { header: "Metric", accessor: (r: { metric: string; value: string }) => r.metric },
                { header: "Value", accessor: (r) => r.value, align: "right" },
              ]}
              rows={kpiRows}
            />
            <AnalyticsReportButton
              data={data}
              from={s.from}
              to={s.to}
              granularity={s.granularity}
              entity={s.entity}
              entityLabel={entityLabel}
            />
            <ThemeToggle />
          </div>
        }
      >
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Field label="From">
            <input
              type="date"
              value={s.from}
              max={s.to}
              onChange={(e) => setSearch({ from: e.target.value })}
              className="rounded border border-border bg-card px-3 py-1.5 text-xs outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={s.to}
              min={s.from}
              onChange={(e) => setSearch({ to: e.target.value })}
              className="rounded border border-border bg-card px-3 py-1.5 text-xs outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>
          <Field label="Organisation scope">
            <select
              value={s.entity}
              onChange={(e) => setSearch({ entity: e.target.value })}
              className="rounded border border-border bg-card px-3 py-1.5 text-xs outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">All organisations</option>
              {(entities?.rows ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Granularity">
            <div
              role="group"
              aria-label="Granularity"
              className="inline-flex rounded border border-border bg-card p-0.5 text-[10px] uppercase tracking-widest"
            >
              {(["day", "week", "month"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  aria-pressed={s.granularity === g}
                  onClick={() => setSearch({ granularity: g })}
                  className={`rounded px-3 py-1 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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
          <Field label="Period preset">
            <div role="group" aria-label="Period preset" className="flex flex-wrap gap-1">
              {PRESETS.map((p) => {
                const r = presetRange(p.days);
                const active = r.from === s.from && r.to === s.to;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSearch(r)}
                    className={`rounded border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </Field>
          <button
            type="button"
            onClick={() =>
              navigate({
                search: {
                  from: iso(DEFAULT_FROM),
                  to: iso(DEFAULT_TO),
                  granularity: "week",
                  entity: "all",
                },
              })
            }
            className="ml-auto rounded border border-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Reset
          </button>
        </div>
        <p className="border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
          Select any stat card or gauge to open the underlying records. Showing {range}.
        </p>
      </SectionCard>

      <DrilldownDialog
        target={drilldown}
        entity={s.entity}
        entityLabel={entityLabel}
        onClose={() => setDrilldown(null)}
      />

      {/* ---------------- Savings growth ---------------- */}
      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <PremiumStatCard
          tone="royal"
          icon={<PiggyBank className="size-4" />}
          label="Opening balance"
          onActivate={() =>
            open({
              metric: "savings_deposits",
              label: "Opening balance",
              context: "Cleared deposits and interest postings",
              permission: "export:savings",
              money: true,
            })
          }
          actionLabel="View underlying records"
          tooltip="Total member balance at the start of the period"
          value={<span className="tabular">{formatMoney(data.savings.opening_balance)}</span>}
          hint={`As at ${s.from}`}
        />
        <PremiumStatCard
          tone="emerald"
          icon={<TrendingUp className="size-4" />}
          label="Closing balance"
          onActivate={() =>
            open({
              metric: "savings_deposits",
              label: "Closing balance",
              context: "Cleared deposits and interest postings",
              permission: "export:savings",
              money: true,
            })
          }
          actionLabel="View underlying records"
          tooltip="Balance at the end of the period, including all cleared movements"
          value={<span className="tabular">{formatMoney(data.savings.closing_balance)}</span>}
          delta={data.savings.growth_rate}
          deltaLabel="in range"
          spark={data.savings.series.map((r) => r.cumulative)}
        />
        <PremiumStatCard
          tone="sky"
          icon={<ArrowDownToLine className="size-4" />}
          label="Deposits in range"
          onActivate={() =>
            open({
              metric: "savings_deposits",
              label: "Deposits in range",
              context: "Cleared deposits and interest postings",
              permission: "export:savings",
              money: true,
            })
          }
          actionLabel="View underlying records"
          tooltip="Sum of cleared deposits and interest in the selected period"
          value={<span className="tabular">{formatMoney(data.savings.deposits_total)}</span>}
          spark={data.savings.series.map((r) => r.deposits)}
        />
        <PremiumStatCard
          tone="gold"
          icon={<Sparkles className="size-4" />}
          label="Growth"
          value={<span className="tabular">{pctText(data.savings.growth_rate)}</span>}
          progress={Math.min(1, Math.abs(data.savings.growth_rate))}
          hint="Net balance movement over the period"
        />
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
              {
                header: "Withdrawals",
                accessor: (r) => formatMoney(r.withdrawals),
                align: "right",
              },
              { header: "Net", accessor: (r) => formatMoney(r.net), align: "right" },
              { header: "Cumulative", accessor: (r) => formatMoney(r.cumulative), align: "right" },
            ]}
            rows={data.savings.series}
          />
        }
      >
        {data.savings.series.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No savings activity in range" />
          </div>
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
          onActivate={() =>
            open({
              metric: "withdrawal_requests",
              label: "Requested",
              context: "Withdrawal requests raised",
              permission: "export:savings",
              money: true,
            })
          }
          actionLabel="View underlying records"
          tooltip="Value of withdrawal requests raised in the period"
          value={<span className="tabular">{formatMoney(data.withdrawals.requested_total)}</span>}
          spark={data.withdrawals.series.map((r) => r.amount)}
        />
        <PremiumStatCard
          tone="emerald"
          icon={<BadgeCheck className="size-4" />}
          label="Paid out"
          onActivate={() =>
            open({
              metric: "withdrawals_paid",
              label: "Paid out",
              context: "Withdrawals paid out",
              permission: "export:savings",
              money: true,
            })
          }
          actionLabel="View underlying records"
          tooltip="Value of withdrawals actually disbursed"
          value={<span className="tabular">{formatMoney(data.withdrawals.paid_total)}</span>}
          spark={data.withdrawals.series.map((r) => r.paid)}
        />
        <PremiumStatCard
          tone="sky"
          icon={<PercentCircle className="size-4" />}
          label="Approval rate"
          onActivate={() =>
            open({
              metric: "withdrawal_requests",
              label: "Approval rate",
              context: "Withdrawal requests raised",
              permission: "export:savings",
              money: true,
            })
          }
          actionLabel="View underlying records"
          tooltip="Approved requests as a share of all decided requests"
          value={<span className="tabular">{pctText(data.withdrawals.approval_rate)}</span>}
          progress={data.withdrawals.approval_rate}
        />
        <PremiumStatCard
          tone="gold"
          icon={<Timer className="size-4" />}
          label="Avg decision time"
          onActivate={() =>
            open({
              metric: "withdrawal_requests",
              label: "Avg decision time",
              context: "Withdrawal requests raised",
              permission: "export:savings",
              money: true,
            })
          }
          actionLabel="View underlying records"
          tooltip="Average hours from request submission to decision"
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
          <div className="p-6">
            <EmptyState title="No withdrawal activity in range" />
          </div>
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
          onActivate={() =>
            open({
              metric: "loan_disbursements",
              label: "Disbursed",
              context: "Loans disbursed",
              permission: "export:loans",
              money: true,
            })
          }
          actionLabel="View underlying records"
          tooltip="Principal released to members in the period"
          value={<span className="tabular">{formatMoney(data.loans.disbursed_total)}</span>}
          spark={data.loans.series.map((r) => r.disbursed)}
        />
        <PremiumStatCard
          tone="emerald"
          icon={<HandCoins className="size-4" />}
          label="Repaid"
          onActivate={() =>
            open({
              metric: "loan_repayments",
              label: "Repaid",
              context: "Instalments received",
              permission: "export:loans",
              money: true,
            })
          }
          actionLabel="View underlying records"
          tooltip="Repayments received against instalments due in the period"
          value={<span className="tabular">{formatMoney(data.loans.repaid_total)}</span>}
          spark={data.loans.series.map((r) => r.repaid)}
        />
        <PremiumStatCard
          tone="sky"
          icon={<Timer className="size-4" />}
          label="On-time rate"
          onActivate={() =>
            open({
              metric: "loan_repayments",
              label: "On-time rate",
              context: "Instalments received",
              permission: "export:loans",
              money: true,
            })
          }
          actionLabel="View underlying records"
          tooltip="Instalments settled on or before their due date"
          value={<span className="tabular">{pctText(data.loans.on_time_rate)}</span>}
          progress={data.loans.on_time_rate}
        />
        <PremiumStatCard
          tone="rose"
          icon={<AlertTriangle className="size-4" />}
          label="Overdue installments"
          onActivate={() =>
            open({
              metric: "loan_arrears",
              label: "Overdue installments",
              context: "Instalments past due",
              permission: "export:loans",
              money: false,
            })
          }
          actionLabel="View underlying records"
          tooltip="Count of instalments past their due date and unpaid"
          value={
            <span className="tabular">{data.loans.overdue_installments.toLocaleString()}</span>
          }
          hint="Instalments past their due date"
        />
      </section>

      <SectionCard title="Portfolio health" accent="sky">
        <div className="grid grid-cols-2 gap-6 p-6 sm:grid-cols-4">
          <ProgressRing
            value={data.loans.on_time_rate}
            label="On-time repayment"
            tone={0}
            onActivate={() =>
              open({
                metric: "loan_repayments",
                label: "On-time repayment",
                context: "Instalments received",
                permission: "export:loans",
              })
            }
            tooltip="Instalments settled on or before their due date"
          />
          <ProgressRing
            value={
              data.loans.disbursed_total > 0
                ? data.loans.repaid_total / data.loans.disbursed_total
                : 0
            }
            label="Repaid vs disbursed"
            tone={1}
            onActivate={() =>
              open({
                metric: "loan_disbursements",
                label: "Repaid vs disbursed",
                context: "Loans disbursed",
                permission: "export:loans",
              })
            }
            tooltip="Repayments received against principal disbursed"
          />
          <ProgressRing
            value={data.withdrawals.approval_rate}
            label="Withdrawal approvals"
            tone={2}
            onActivate={() =>
              open({
                metric: "withdrawal_requests",
                label: "Withdrawal approvals",
                context: "Withdrawal requests raised",
                permission: "export:savings",
              })
            }
            tooltip="Approved share of decided withdrawal requests"
          />
          <ProgressRing
            value={data.cancellations.cancellation_rate}
            label="Cancellation rate"
            tone={4}
            onActivate={() =>
              open({
                metric: "cancellations",
                label: "Cancellation rate",
                context: "Cancelled withdrawal requests",
                permission: "export:audit",
                money: false,
              })
            }
            tooltip="Share of requests cancelled before payout"
          />
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
          <div className="p-6">
            <EmptyState title="No loan activity in range" />
          </div>
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
          <BarList
            rows={data.loans.product_mix}
            format={formatMoney}
            emptyLabel="No loans in range"
          />
        </SectionCard>
      </div>

      {/* ---------------- Cancellation rates ---------------- */}
      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <PremiumStatCard
          tone="slate"
          icon={<Ban className="size-4" />}
          label="Requests"
          onActivate={() =>
            open({
              metric: "withdrawal_requests",
              label: "Requests",
              context: "Withdrawal requests raised",
              permission: "export:audit",
              money: false,
            })
          }
          actionLabel="View underlying records"
          tooltip="Withdrawal requests raised in the period"
          value={
            <span className="tabular">{data.cancellations.total_requests.toLocaleString()}</span>
          }
          spark={data.cancellations.series.map((r) => r.total)}
        />
        <PremiumStatCard
          tone="rose"
          icon={<XCircle className="size-4" />}
          label="Cancelled"
          onActivate={() =>
            open({
              metric: "cancellations",
              label: "Cancelled",
              context: "Cancelled withdrawal requests",
              permission: "export:audit",
              money: false,
            })
          }
          actionLabel="View underlying records"
          tooltip="Requests cancelled before payout"
          value={
            <span className="tabular">{data.cancellations.total_cancelled.toLocaleString()}</span>
          }
          spark={data.cancellations.series.map((r) => r.cancelled)}
        />
        <PremiumStatCard
          tone="violet"
          icon={<PercentCircle className="size-4" />}
          label="Cancellation rate"
          onActivate={() =>
            open({
              metric: "cancellations",
              label: "Cancellation rate",
              context: "Cancelled withdrawal requests",
              permission: "export:audit",
              money: true,
            })
          }
          actionLabel="View underlying records"
          tooltip="Share of requests withdrawn before payout"
          value={<span className="tabular">{pctText(data.cancellations.cancellation_rate)}</span>}
          progress={data.cancellations.cancellation_rate}
          hint="Share of requests withdrawn before payout"
        />
        <PremiumStatCard
          tone="gold"
          icon={<ShieldAlert className="size-4" />}
          label="Admin-initiated share"
          onActivate={() =>
            open({
              metric: "cancellations",
              label: "Admin-initiated share",
              context: "Cancelled withdrawal requests",
              permission: "export:audit",
              money: true,
            })
          }
          actionLabel="View underlying records"
          tooltip="Share of cancellations performed by staff"
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
          <div className="p-6">
            <EmptyState title="No withdrawal requests in range" />
          </div>
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
