import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { KPIStat, PageHeader, SectionCard, Money, EmptyState } from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/org-config";
import { getLoanAnalytics } from "@/lib/loan-analytics.functions";

export const Route = createFileRoute("/_admin/admin/loan-analytics")({
  head: () => ({
    meta: [
      { title: "Loan portfolio analytics — IT-360 CashApp" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LoanAnalyticsPage;
});

const analyticsQuery = (months: number) =>
  queryOptions({
    queryKey: ["admin", "loan-analytics", months],
    queryFn: () => getLoanAnalytics({ data: { months } }),
  });

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

function LoanAnalyticsPage() {
  const [months, setMonths] = useState(12);
  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Loan portfolio analytics"
        description="Cohort trends, approval funnel conversion, delinquency ageing and repayment performance by product."
      />
      <div className="mb-4 flex items-center gap-2">
        <label
          htmlFor="analytics-window"
          className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
        >
          Period
        </label>
        <select
          id="analytics-window"
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
          className="rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm outline-none focus:border-emerald-mid"
        >
          <option value={3}>Last 3 months</option>
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
          <option value={24}>Last 24 months</option>
        </select>
      </div>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <AnalyticsBody months={months} />
      </Suspense>
    </>
  );
}

function AnalyticsBody({ months }: { months: number }) {
  const { data } = useSuspenseQuery(analyticsQuery(months));
  const { cohorts, funnel, delinquency, products } = data;
  const maxApplications = Math.max(1, ...cohorts.map((c) => c.applications));
  const approvedStage = funnel.find((f) => f.stage === "Approved");
  const disbursedStage = funnel.find((f) => f.stage === "Disbursed");

  return (
    <div className="space-y-6">
      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat
          label="Active portfolio"
          value={<Money amount={delinquency.portfolio_value} />}
          hint={`${delinquency.active_loans} active loans`}
          accent
        />
        <KPIStat
          label="Delinquency rate"
          value={pct(delinquency.delinquency_rate)}
          hint={`${delinquency.loans_in_arrears} loans in arrears`}
          tone={delinquency.delinquency_rate > 0.05 ? "rose" : "emerald"}
        />
        <KPIStat
          label="Approval rate"
          value={pct(approvedStage?.conversion ?? 0)}
          hint={`${approvedStage?.count ?? 0} approved of ${funnel[0]?.count ?? 0} applications`}
          tone="royal"
        />
        <KPIStat
          label="Disbursed value"
          value={<Money amount={disbursedStage?.value ?? 0} />}
          hint={`${disbursedStage?.count ?? 0} loans released`}
          tone="emerald"
        />
      </section>

      <SectionCard title="Approval funnel">
        <ul className="divide-y divide-emerald-deep/5">
          {funnel.map((s) => (
            <li key={s.stage} className="px-6 py-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{s.stage}</span>
                <span className="tabular-nums text-muted-foreground">
                  {s.count} · {formatMoney(s.value)} · {pct(s.conversion)}
                </span>
              </div>
              <div
                className="mt-2 h-2 rounded-full bg-muted"
                role="img"
                aria-label={`${s.stage}: ${pct(s.conversion)} of applications`}
              >
                <div
                  className="h-2 rounded-full bg-emerald-deep"
                  style={{ width: `${Math.max(2, s.conversion * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Cohort trends by application month">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-6 py-3 font-medium">Month</th>
                <th className="px-6 py-3 text-right font-medium">Applications</th>
                <th className="px-6 py-3 text-right font-medium">Approved</th>
                <th className="px-6 py-3 text-right font-medium">Rejected</th>
                <th className="px-6 py-3 text-right font-medium">Approval rate</th>
                <th className="px-6 py-3 text-right font-medium">Disbursed value</th>
                <th className="px-6 py-3 font-medium">Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-deep/5">
              {cohorts.map((c) => (
                <tr key={c.month}>
                  <td className="px-6 py-3 font-medium">{c.month}</td>
                  <td className="px-6 py-3 text-right tabular-nums">{c.applications}</td>
                  <td className="px-6 py-3 text-right tabular-nums">{c.approved}</td>
                  <td className="px-6 py-3 text-right tabular-nums">{c.rejected}</td>
                  <td className="px-6 py-3 text-right tabular-nums">{pct(c.approval_rate)}</td>
                  <td className="px-6 py-3 text-right tabular-nums">
                    {formatMoney(c.disbursed_value)}
                  </td>
                  <td className="px-6 py-3">
                    <div className="h-2 w-32 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-emerald-mid"
                        style={{ width: `${(c.applications / maxApplications) * 100}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Delinquency ageing">
        {delinquency.loans_in_arrears === 0 ? (
          <div className="p-6">
            <EmptyState title="No arrears" hint="Every matured installment is settled." />
          </div>
        ) : (
          <ul className="divide-y divide-emerald-deep/5">
            {delinquency.buckets.map((b) => (
              <li key={b.bucket} className="flex items-center justify-between px-6 py-3 text-sm">
                <span>{b.bucket}</span>
                <span className="tabular-nums text-muted-foreground">
                  {b.loans} loans · {formatMoney(b.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Repayment performance by product">
        {products.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No repayment data yet" hint="Disburse a loan to build performance history." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Product</th>
                  <th className="px-6 py-3 text-right font-medium">Loans</th>
                  <th className="px-6 py-3 text-right font-medium">Disbursed</th>
                  <th className="px-6 py-3 text-right font-medium">Due to date</th>
                  <th className="px-6 py-3 text-right font-medium">Collected</th>
                  <th className="px-6 py-3 text-right font-medium">Collection rate</th>
                  <th className="px-6 py-3 text-right font-medium">Arrears</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-deep/5">
                {products.map((p) => (
                  <tr key={p.product}>
                    <td className="px-6 py-3 font-medium">{p.product}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{p.loans}</td>
                    <td className="px-6 py-3 text-right tabular-nums">
                      {formatMoney(p.disbursed_value)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums">
                      {formatMoney(p.due_to_date)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums">{formatMoney(p.collected)}</td>
                    <td className="px-6 py-3 text-right tabular-nums">
                      {pct(p.collection_rate)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums">
                      {p.arrears > 0 ? (
                        <span className="font-medium text-destructive">
                          {formatMoney(p.arrears)}
                        </span>
                      ) : (
                        "—"
                      )}
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
