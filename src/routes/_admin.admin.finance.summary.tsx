import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Suspense, useState } from "react";
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
import { TrendChart, BarList } from "@/components/charts";
import { getFinancialSummary } from "@/lib/finance-reports.functions";
import { formatMoney } from "@/lib/org-config";

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 24 * 3600 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

const summaryQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: ["admin", "finance-summary", from, to],
    queryFn: () => getFinancialSummary({ data: { from, to } }),
    staleTime: 30_000,
  });

export const Route = createFileRoute("/_admin/admin/finance/summary")({
  component: SummaryPage,
  errorComponent: ({ error }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <ErrorState title="Summary failed to load" message={error.message} onRetry={() => router.invalidate()} />
      </div>
    );
  },
});

function SummaryPage() {
  const [range, setRange] = useState(defaultRange());
  return (
    <>
      <PageHeader
        eyebrow="Reports"
        title="Financial Summary"
        description="Period profit & loss and balance snapshot with drill-through to underlying ledgers."
        action={
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[11px] uppercase tracking-widest text-muted-foreground">
              From
              <input
                type="date"
                value={range.from}
                onChange={(e) => setRange({ ...range, from: e.target.value })}
                className="mt-1 block rounded-md border border-border bg-background px-2 py-1 text-sm"
              />
            </label>
            <label className="text-[11px] uppercase tracking-widest text-muted-foreground">
              To
              <input
                type="date"
                value={range.to}
                onChange={(e) => setRange({ ...range, to: e.target.value })}
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
            <SectionCardSkeleton title="Cash flow" rows={1} cols={2} />
          </div>
        }
      >
        <SummaryBody from={range.from} to={range.to} />
      </Suspense>
    </>
  );
}

function SummaryBody({ from, to }: { from: string; to: string }) {
  const { data: s } = useSuspenseQuery(summaryQuery(from, to));
  return (
    <div className="mt-6 space-y-8">
      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat
          label="Income (period)"
          value={<Money amount={s.income_total} />}
          accent
          hint={<Link to="/admin/finance/income" className="text-primary underline-offset-2 hover:underline">Income breakdown →</Link>}
        />
        <KPIStat
          label="Expenses (period)"
          value={<Money amount={s.expense_total} />}
          hint={<Link to="/admin/finance/breakdown" className="text-primary underline-offset-2 hover:underline">Expenses breakdown →</Link>}
        />
        <KPIStat
          label="Net (P&L)"
          value={<Money amount={s.net} signed />}
        />
        <KPIStat
          label="AUM (snapshot)"
          value={<Money amount={s.balance_snapshot.aum} />}
          hint={
            <>
              Outstanding loans: <Money amount={s.balance_snapshot.outstanding_loans} />
              <br />
              <Link to="/admin/reports" className="text-primary underline-offset-2 hover:underline">Full reports →</Link>
            </>
          }
        />
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        <KPIStat
          label="Pending expenses"
          value={<Money amount={s.balance_snapshot.pending_expenses_amount} />}
          hint={<Link to="/admin/finance/expenses" className="text-primary underline-offset-2 hover:underline">Expense ledger →</Link>}
        />
        <KPIStat
          label="Pending transfers"
          value={<Money amount={s.balance_snapshot.pending_transfers_amount} />}
          hint={<Link to="/admin/finance/transfers" className="text-primary underline-offset-2 hover:underline">Transfer ledger →</Link>}
        />
        <KPIStat
          label="Active loans / accounts"
          value={<span className="tabular">{s.balance_snapshot.active_loans} / {s.balance_snapshot.active_savings_accounts}</span>}
          hint={<Link to="/admin/finance/contributions" className="text-primary underline-offset-2 hover:underline">Contributions →</Link>}
        />
      </section>

      <SectionCard title="Daily cash flow">
        <div className="p-4 sm:p-6">
          <TrendChart
            data={s.daily_series}
            xKey="day"
            title="Income vs Expenses"
            series={[
              { key: "income", label: "Income", format: (v) => formatMoney(v) },
              { key: "expense", label: "Expenses", color: "var(--destructive)", format: (v) => formatMoney(v) },
              { key: "net", label: "Net", color: "var(--accent)", format: (v) => formatMoney(v) },
            ]}
            height={260}
          />
        </div>
      </SectionCard>

      <div className="grid gap-6 md:grid-cols-2">
        <SectionCard title="Income by kind">
          <BarList
            rows={s.income_by_kind.map((r) => ({ label: r.kind.replace(/_/g, " "), value: r.amount }))}
            format={(v) => formatMoney(v)}
            emptyLabel="No income in this window"
          />
        </SectionCard>
        <SectionCard title="Expenses by kind">
          <BarList
            rows={s.expense_by_kind.map((r) => ({ label: r.kind.replace(/_/g, " "), value: r.amount }))}
            format={(v) => formatMoney(v)}
            emptyLabel="No expenses in this window"
          />
        </SectionCard>
      </div>
    </div>
  );
}
