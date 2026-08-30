import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  EmptyState,
  ErrorState,
  KPIStat,
  Money,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
} from "@/components/primitives";
import { getSavingsInsights } from "@/lib/savings-modules.functions";
import { formatMoney } from "@/lib/org-config";

const insightsQuery = queryOptions({
  queryKey: ["member", "savings", "insights"],
  queryFn: () => getSavingsInsights(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/_member/app/savings/insights")({
  head: () => ({
    meta: [
      { title: "Savings insights — IT-360 CashApp" },
      {
        name: "description",
        content:
          "Track savings growth, contribution consistency, goal progress and 12-month projections.",
      },
      { property: "og:title", content: "Savings insights — IT-360 CashApp" },
      {
        property: "og:description",
        content: "Personal savings analytics, consistency scoring and projections.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(insightsQuery),
  component: InsightsPage,
  errorComponent: ({ error }) => (
    <div className="p-6">
      <ErrorState title="Insights unavailable" message={error.message} />
    </div>
  ),
});

function InsightsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Member portal"
        title="Savings insights"
        description="How your savings have grown over the last 12 months, and where you're heading."
        action={
          <Link
            to="/app/savings"
            className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted"
          >
            Back to savings
          </Link>
        }
      />
      <Suspense fallback={<SectionCardSkeleton title="Savings insights" rows={5} cols={4} />}>
        <Body />
      </Suspense>
    </>
  );
}

function Body() {
  const { data: i } = useSuspenseQuery(insightsQuery);
  const growth = i.monthly.reduce<Array<{ month: string; balance: number }>>((acc, m, idx) => {
    const prev = idx === 0 ? i.total_balance - i.net_12m : acc[idx - 1].balance;
    acc.push({ month: m.month, balance: Math.round((prev + m.net) * 100) / 100 });
    return acc;
  }, []);

  return (
    <div className="space-y-6">
      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat
          label="Total balance"
          value={<Money amount={i.total_balance} />}
          hint={`Available ${formatMoney(i.available)}`}
        />
        <KPIStat label="Net saved (12m)" value={<Money amount={i.net_12m} signed />} accent />
        <KPIStat
          label="Consistency"
          value={<span className="tabular">{i.consistency_pct}%</span>}
          hint={`${i.months_contributed}/12 months · ${i.streak_months} month streak`}
        />
        <KPIStat
          label="Projected (12m)"
          value={<Money amount={i.projected_12m} />}
          hint="At current net pace"
        />
      </section>

      <SectionCard title="Balance trend">
        <div className="h-72 p-6">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={growth}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={70} />
              <Tooltip formatter={(v: number) => formatMoney(v)} />
              <Area
                type="monotone"
                dataKey="balance"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary) / 0.2)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="Monthly deposits vs withdrawals">
        <div className="h-72 p-6">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={i.monthly}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={70} />
              <Tooltip formatter={(v: number) => formatMoney(v)} />
              <Bar dataKey="deposits" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="withdrawals" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="Goal progress">
        {i.goals.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No savings goals set"
              hint="Set a goal on any savings account to track progress here."
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {i.goals.map((g) => (
              <li key={g.account} className="px-6 py-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{g.account}</span>
                  <span className="tabular text-xs text-muted-foreground">
                    {formatMoney(g.balance)} / {formatMoney(g.goal)} · {g.pct}%
                    {g.target_date ? ` · by ${new Date(g.target_date).toLocaleDateString()}` : ""}
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${g.pct}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
