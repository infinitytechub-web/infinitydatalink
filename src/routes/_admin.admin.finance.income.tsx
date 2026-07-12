import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Suspense } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
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
import { getIncomeBreakdown } from "@/lib/finance-reports.functions";
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

const incomeQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: ["admin", "income", from, to],
    queryFn: () => getIncomeBreakdown({ data: { from, to } }),
    staleTime: 30_000,
  });

export const Route = createFileRoute("/_admin/admin/finance/income")({
  validateSearch: zodValidator(searchSchema),
  component: IncomePage,
  errorComponent: ({ error }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <ErrorState title="Income failed to load" message={error.message} onRetry={() => router.invalidate()} />
      </div>
    );
  },
});

function IncomePage() {
  const { from, to } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const setField = (k: "from" | "to", v: string) =>
    navigate({ search: (prev) => ({ ...prev, [k]: v }) });
  return (
    <>
      <PageHeader
        eyebrow="Reports"
        title="Income Breakdown"
        description="Cleared inflows by kind and channel with trend line."
        action={
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[11px] uppercase tracking-widest text-muted-foreground">
              From
              <input type="date" value={from} onChange={(e) => setField("from", e.target.value)} className="mt-1 block rounded-md border border-border bg-background px-2 py-1 text-sm" />
            </label>
            <label className="text-[11px] uppercase tracking-widest text-muted-foreground">
              To
              <input type="date" value={to} onChange={(e) => setField("to", e.target.value)} className="mt-1 block rounded-md border border-border bg-background px-2 py-1 text-sm" />
            </label>
          </div>
        }
      />
      <Suspense
        fallback={
          <div className="mt-6 space-y-8">
            <KPIGridSkeleton count={3} />
            <SectionCardSkeleton title="Trend" rows={1} cols={2} />
          </div>
        }
      >
        <IncomeBody from={from} to={to} />
      </Suspense>
    </>
  );
}


function IncomeBody({ from, to }: { from: string; to: string }) {
  const { data } = useSuspenseQuery(incomeQuery(from, to));
  return (
    <div className="mt-6 space-y-8">
      <section className="grid gap-6 md:grid-cols-3">
        <KPIStat label="Total income" value={<Money amount={data.total} />} accent />
        <KPIStat label="Top kind" value={(data.by_kind[0]?.kind ?? "—").replace(/_/g, " ")} hint={data.by_kind[0] ? <Money amount={data.by_kind[0].amount} /> : null} />
        <KPIStat label="Top channel" value={data.by_channel[0]?.channel ?? "—"} hint={data.by_channel[0] ? <Money amount={data.by_channel[0].amount} /> : null} />
      </section>

      <SectionCard
        title="Trend"
        action={<Link to="/admin/finance/contributions" className="text-xs text-primary underline-offset-2 hover:underline">Deposits ledger →</Link>}
      >
        <div className="p-4 sm:p-6">
          <TrendChart
            data={data.daily}
            xKey="day"
            title="Daily income"
            series={[{ key: "amount", label: "Income", format: (v) => formatMoney(v) }]}
            height={220}
          />
        </div>
      </SectionCard>

      <div className="grid gap-6 md:grid-cols-2">
        <SectionCard title="By kind">
          <BarList
            rows={data.by_kind.map((r) => ({ label: r.kind.replace(/_/g, " "), value: r.amount, hint: `${r.count} txns` }))}
            format={(v) => formatMoney(v)}
            emptyLabel="No income in this window"
          />
        </SectionCard>
        <SectionCard title="By channel">
          <BarList
            rows={data.by_channel.map((r) => ({ label: r.channel, value: r.amount, hint: `${r.count} txns` }))}
            format={(v) => formatMoney(v)}
            emptyLabel="No income in this window"
          />
        </SectionCard>
      </div>
    </div>
  );
}
