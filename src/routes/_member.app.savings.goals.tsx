import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { CloudOff, RefreshCw, Target, WifiOff } from "lucide-react";
import {
  EmptyState,
  ErrorState,
  KPIStat,
  Money,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
} from "@/components/primitives";
import { listMyGoals } from "@/lib/savings-goals.functions";
import { withOfflineFallback } from "@/lib/offline-snapshot";
import { useOnlineStatus } from "@/hooks/use-online-status";

const GOALS_SNAPSHOT_KEY = "savings-goals";

const goalsQuery = queryOptions({
  queryKey: ["member", "savings", "goals"],
  queryFn: () => withOfflineFallback(GOALS_SNAPSHOT_KEY, () => listMyGoals()),
  staleTime: 15_000,
  // Offline reads come from the snapshot; retrying just delays the fallback.
  retry: 0,
});


export const Route = createFileRoute("/_member/app/savings/goals")({
  head: () => ({
    meta: [
      { title: "Savings goals tracker — IT-360 CashApp" },
      {
        name: "description",
        content:
          "Track every savings goal in one place: progress, amount remaining, target date and the monthly amount needed to stay on track.",
      },
      { property: "og:title", content: "Savings goals tracker — IT-360 CashApp" },
      {
        property: "og:description",
        content: "Progress, remaining balance and required monthly contribution for each savings goal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(goalsQuery),
  component: GoalsPage,
  errorComponent: ({ error }) => (
    <div className="p-6">
      <ErrorState title="Goals unavailable" message={error.message} />
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm text-muted-foreground">Not found.</div>,
});

function GoalsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Member portal"
        title="Savings goals"
        description="Every goal you've set, with progress, time left and the monthly pace needed to hit it."
        action={
          <Link
            to="/app/savings"
            className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted"
          >
            Back to savings
          </Link>
        }
      />
      <Suspense fallback={<SectionCardSkeleton title="Goals" rows={4} cols={5} />}>
        <Body />
      </Suspense>
    </>
  );
}

function Body() {
  const { data: result } = useSuspenseQuery(goalsQuery);
  const online = useOnlineStatus();
  const { syncing, lastSyncedAt, syncNow } = useBackgroundSync({
    queryKey: ["member", "savings", "goals"],
    stale: result.stale,
  });
  const data = result.data;
  const overall =
    data.total_target > 0 ? Math.min(100, Math.round((data.total_saved / data.total_target) * 100)) : 0;

  const banner =
    !online || result.stale ? (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-foreground"
      >
        {online ? <CloudOff className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
        <span>
          {online ? "Live sync unavailable." : "You're offline."} Showing your last synced goal progress
          {result.saved_at ? ` from ${new Date(result.saved_at).toLocaleString()}` : ""}.{" "}
          {online
            ? "We keep retrying in the background and missed deposits or transfers will appear automatically."
            : "Missed deposits and transfers sync automatically once you reconnect."}
        </span>
        <button
          type="button"
          onClick={() => void syncNow()}
          disabled={!online || syncing}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 font-medium hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>
    ) : (
      <p className="flex items-center gap-2 text-[11px] text-muted-foreground" aria-live="polite">
        <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
        {syncing
          ? "Syncing contributions…"
          : `Up to date${lastSyncedAt ? ` · last synced ${new Date(lastSyncedAt).toLocaleTimeString()}` : ""}`}
      </p>
    );


  if (data.rows.length === 0) {
    return (
      <div className="space-y-4">
        {banner}
        <SectionCard title="Goals">
          <div className="p-6">
            <EmptyState title="No savings goals yet" />
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Set a goal on any savings account and it will show up here with progress tracking.
            </p>
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {banner}
      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat label="Saved toward goals" value={<Money amount={data.total_saved} />} accent />
        <KPIStat label="Total target" value={<Money amount={data.total_target} />} />
        <KPIStat label="Contributed since start" value={<Money amount={data.total_contributed} />} />
        <KPIStat label="Overall progress" value={<span className="tabular">{overall}%</span>} />
      </section>


      <div className="grid gap-4 md:grid-cols-2">
        {data.rows.map((g) => (
          <SectionCard key={g.account_id} title={g.label}>
            <div className="space-y-3 p-5">
              <div className="flex items-baseline justify-between">
                <div className="text-lg font-semibold">
                  <Money amount={g.balance} />
                  <span className="text-xs font-normal text-muted-foreground">
                    {" "}
                    of <Money amount={g.goal_amount} />
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Target className="h-3.5 w-3.5" /> {g.progress_pct}%
                </span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={g.progress_pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${g.label} goal progress`}
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500"
                  style={{ width: `${g.progress_pct}%` }}
                />
              </div>
              <dl className="grid grid-cols-4 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Remaining</dt>
                  <dd className="tabular font-medium">
                    <Money amount={g.remaining} />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Contributed</dt>
                  <dd className="tabular font-medium">
                    <Money amount={g.contributed_since_start} />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Target date</dt>
                  <dd className="font-medium">
                    {g.goal_target_date ? new Date(g.goal_target_date).toLocaleDateString() : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Needed / month</dt>
                  <dd className="tabular font-medium">
                    {g.required_monthly == null ? "—" : <Money amount={g.required_monthly} />}
                  </dd>
                </div>
              </dl>
              <div className="rounded-md border border-border/60 bg-muted/30 p-3">
                <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-widest text-muted-foreground">
                  <span>Contributions toward this goal ({g.contributions_count})</span>
                  <Link
                    to="/app/savings/ledger"
                    className="font-medium normal-case tracking-normal text-primary hover:underline"
                  >
                    Ledger
                  </Link>
                </div>
                {g.recent_contributions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No cleared deposits or transfers since this goal started.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {g.recent_contributions.map((c) => (
                      <li key={c.id} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          {new Date(c.created_at).toLocaleDateString()} ·{" "}
                          <span className="capitalize">{c.kind.replace("_", " ")}</span>
                          {c.ref ? <span className="font-mono"> {c.ref}</span> : null}
                        </span>
                        <span className="tabular font-medium">
                          <Money amount={c.amount} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  {g.goal_completed_at
                    ? "Goal reached 🎉"
                    : g.days_left == null
                      ? "No target date set"
                      : g.days_left < 0
                        ? `${Math.abs(g.days_left)} day(s) past target`
                        : `${g.days_left} day(s) left`}
                </span>
                <Link
                  to="/app/savings/$accountId"
                  params={{ accountId: g.account_id }}
                  className="font-medium text-primary hover:underline"
                >
                  View account
                </Link>
              </div>
            </div>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}
