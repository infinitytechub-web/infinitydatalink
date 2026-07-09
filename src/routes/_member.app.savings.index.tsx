import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { PiggyBank, Plus, TrendingUp } from "lucide-react";
import { EmptyState, KPIStat, Money, PageHeader, SectionCard, StatusPill } from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { listMyAccounts, type SavingsAccount } from "@/lib/savings.functions";

const accountsQuery = queryOptions({
  queryKey: ["member", "savings", "accounts"],
  queryFn: () => listMyAccounts(),
  staleTime: 15_000,
});

export const Route = createFileRoute("/_member/app/savings/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(accountsQuery),
  component: SavingsPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Failed to load savings: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm text-emerald-deep/70">Not found.</div>,
});

function SavingsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Member portal"
        title="My Savings"
        description="Track balances, goal progress and contributions across every plan you're enrolled in."
        action={
          <Link
            to="/app/savings/enroll"
            className="inline-flex items-center gap-2 rounded bg-emerald-deep px-4 py-2 text-xs font-semibold uppercase tracking-widest text-cream hover:bg-emerald-mid"
          >
            <Plus className="h-4 w-4" /> Enroll in plan
          </Link>
        }
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <Body />
      </Suspense>
    </>
  );
}

function Body() {
  const { data: accounts } = useSuspenseQuery(accountsQuery);
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  const active = accounts.filter((a) => a.status === "active");
  return (
    <div className="space-y-6">
      <section className="grid gap-6 md:grid-cols-3">
        <KPIStat label="Total balance" value={<Money amount={total} />} hint={`${active.length} active plan(s)`} />
        <KPIStat label="Active plans" value={<span className="tabular">{active.length}</span>} hint="Enrolled and open" />
        <KPIStat label="With savings goal" value={<span className="tabular">{active.filter((a) => a.goal_amount).length}</span>} accent />
      </section>

      {accounts.length === 0 ? (
        <SectionCard title="Get started">
          <div className="p-6">
            <EmptyState title="No savings plans yet" hint="Pick a plan to start contributing and building interest." />
            <div className="mt-4">
              <Link
                to="/app/savings/enroll"
                className="inline-flex items-center gap-2 rounded bg-emerald-deep px-4 py-2 text-xs font-semibold uppercase tracking-widest text-cream hover:bg-emerald-mid"
              >
                <Plus className="h-4 w-4" /> Browse plans
              </Link>
            </div>
          </div>
        </SectionCard>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {accounts.map((a) => (
            <AccountCard key={a.id} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function AccountCard({ a }: { a: SavingsAccount }) {
  return (
    <Link
      to="/app/savings/$accountId"
      params={{ accountId: a.id }}
      className="group block rounded-lg border border-emerald-deep/10 bg-card p-5 transition hover:border-emerald-mid/40 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/40">
            <PiggyBank className="h-3.5 w-3.5" /> {a.plan_schedule}
          </div>
          <div className="mt-1 text-lg font-semibold text-emerald-deep">
            {a.nickname || a.plan_name}
          </div>
          {a.nickname ? <div className="text-[11px] text-emerald-deep/50">{a.plan_name}</div> : null}
        </div>
        <StatusPill status={a.status === "active" ? "active" : "closed"} />
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-emerald-deep/40">Balance</div>
          <div className="text-2xl font-semibold tabular text-emerald-deep">
            <Money amount={a.balance} />
          </div>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-emerald-mid">
          <TrendingUp className="h-3.5 w-3.5" /> {a.plan_interest_rate}% p.a.
        </div>
      </div>
      {a.goal_amount ? (
        <div className="mt-4">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-emerald-deep/40">
            <span>Goal progress</span>
            <span>{a.progress_pct ?? 0}%</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-emerald-deep/10">
            <div
              className="h-1.5 rounded-full bg-emerald-mid transition-all"
              style={{ width: `${a.progress_pct ?? 0}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-emerald-deep/50">
            <Money amount={a.balance} /> of <Money amount={a.goal_amount} />
            {a.goal_target_date ? ` · by ${new Date(a.goal_target_date).toLocaleDateString()}` : ""}
          </div>
        </div>
      ) : null}
    </Link>
  );
}
