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
import { getExpensesBreakdown } from "@/lib/finance-reports.functions";
import { formatMoney } from "@/lib/org-config";

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 24 * 3600 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

const expenseQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: ["admin", "expenses-breakdown", from, to],
    queryFn: () => getExpensesBreakdown({ data: { from, to } }),
    staleTime: 30_000,
  });

export const Route = createFileRoute("/_admin/admin/finance/breakdown")({
  component: BreakdownPage,
  errorComponent: ({ error }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <ErrorState title="Expenses failed to load" message={error.message} onRetry={() => router.invalidate()} />
      </div>
    );
  },
});

function BreakdownPage() {
  const [range, setRange] = useState(defaultRange());
  return (
    <>
      <PageHeader
        eyebrow="Reports"
        title="Expenses Breakdown"
        description="Spend by category, status and top vendors."
        action={
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[11px] uppercase tracking-widest text-muted-foreground">
              From
              <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className="mt-1 block rounded-md border border-border bg-background px-2 py-1 text-sm" />
            </label>
            <label className="text-[11px] uppercase tracking-widest text-muted-foreground">
              To
              <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className="mt-1 block rounded-md border border-border bg-background px-2 py-1 text-sm" />
            </label>
          </div>
        }
      />
      <Suspense
        fallback={
          <div className="mt-6 space-y-8">
            <KPIGridSkeleton count={4} />
            <SectionCardSkeleton title="Trend" rows={1} cols={2} />
          </div>
        }
      >
        <BreakdownBody from={range.from} to={range.to} />
      </Suspense>
    </>
  );
}

function BreakdownBody({ from, to }: { from: string; to: string }) {
  const { data } = useSuspenseQuery(expenseQuery(from, to));
  return (
    <div className="mt-6 space-y-8">
      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat label="Paid" value={<Money amount={data.total_paid} />} accent />
        <KPIStat label="Approved (unpaid)" value={<Money amount={data.total_approved} />} />
        <KPIStat label="Pending review" value={<Money amount={data.total_pending} />} />
        <KPIStat
          label="Top category"
          value={data.by_category[0]?.label ?? "—"}
          hint={
            <>
              {data.by_category[0] ? <Money amount={data.by_category[0].amount} /> : null}
              <br />
              <Link to="/admin/finance/expenses" className="text-primary underline-offset-2 hover:underline">Expense ledger →</Link>
            </>
          }
        />
      </section>

      <SectionCard title="Daily paid expenses">
        <div className="p-4 sm:p-6">
          <TrendChart
            data={data.daily}
            xKey="day"
            title="Paid expenses"
            series={[{ key: "amount", label: "Paid", color: "var(--destructive)", format: (v) => formatMoney(v) }]}
            height={220}
          />
        </div>
      </SectionCard>

      <div className="grid gap-6 md:grid-cols-2">
        <SectionCard title="By category">
          <BarList
            rows={data.by_category.map((r) => ({ label: r.label, value: r.amount, hint: `${r.count} entries` }))}
            format={(v) => formatMoney(v)}
            emptyLabel="No expenses in this window"
          />
        </SectionCard>
        <SectionCard title="Top vendors">
          <BarList
            rows={data.top_vendors.map((r) => ({ label: r.vendor, value: r.amount, hint: `${r.count} entries` }))}
            format={(v) => formatMoney(v)}
            emptyLabel="No vendors in this window"
          />
        </SectionCard>
      </div>
    </div>
  );
}
