import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { Suspense } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  ErrorState,
  KPIGridSkeleton,
  KPIStat,
  Money,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
} from "@/components/primitives";
import { TrendChart } from "@/components/charts";
import { getFinanceSummary } from "@/lib/admin-finance.functions";

const summaryQuery = queryOptions({
  queryKey: ["admin", "finance", "summary"],
  queryFn: () => getFinanceSummary(),
  staleTime: 30_000,
});

export const Route = createFileRoute("/_admin/admin/finance/")({
  component: FinanceDashboard,
  errorComponent: ({ error }) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const router = useRouter();
    return (
      <div className="p-6">
        <ErrorState
          title="Finance failed to load"
          message={error.message}
          onRetry={() => router.invalidate()}
        />
      </div>
    );
  },
});

function FinanceDashboard() {
  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Financial Dashboard"
        description="Cash flow, income, expenses, transfers and balance oversight in real time."
      />
      <Suspense
        fallback={
          <div className="space-y-8">
            <KPIGridSkeleton count={4} />
            <SectionCardSkeleton title="Cash flow" rows={1} cols={2} />
          </div>
        }
      >
        <FinanceBody />
      </Suspense>
    </>
  );
}

function FinanceBody() {
  const { data: s } = useSuspenseQuery(summaryQuery);
  return (
    <div className="space-y-8">
      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat label="Cash in (30d)" value={<Money amount={s.cash_in_30d} />} accent />
        <KPIStat label="Cash out (30d)" value={<Money amount={s.cash_out_30d} />} />
        <KPIStat label="Net (30d)" value={<Money amount={s.net_30d} signed />} />
        <KPIStat
          label="AUM"
          value={<Money amount={s.aum} />}
          hint={
            <>
              Outstanding loans: <Money amount={s.outstanding_loans} />
            </>
          }
        />
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        <KPIStat
          label="Pending expenses"
          value={<span className="tabular">{s.expenses_pending}</span>}
          hint={
            <>
              Total: <Money amount={s.expenses_pending_amount} />
            </>
          }
        />
        <KPIStat
          label="Pending transfers"
          value={<span className="tabular">{s.transfers_pending}</span>}
        />
        <KPIStat
          label="Quick actions"
          value={
            <div className="flex flex-wrap gap-2 text-xs">
              <Link
                to="/admin/finance/expenses"
                className="rounded-md border border-border bg-background px-3 py-1.5 hover:bg-muted"
              >
                Expenses
              </Link>
              <Link
                to="/admin/finance/transfers"
                className="rounded-md border border-border bg-background px-3 py-1.5 hover:bg-muted"
              >
                Transfers
              </Link>
              <Link
                to="/admin/finance/adjustments"
                className="rounded-md border border-border bg-background px-3 py-1.5 hover:bg-muted"
              >
                Adjustments
              </Link>
            </div>
          }
        />
      </section>

      <SectionCard title="Cash flow — last 30 days">
        <div className="grid gap-6 p-6 md:grid-cols-2">
          <div>
            <TrendChart
              data={s.income_series}
              xKey="day"
              title="Income"
              series={[{ key: "amount", label: "Income" }]}
              height={200}
            />
          </div>
          <div>
            <TrendChart
              data={s.expense_series}
              xKey="day"
              title="Expenses & payouts"
              series={[{ key: "amount", label: "Cash out", color: "var(--destructive)" }]}
              height={200}
            />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
