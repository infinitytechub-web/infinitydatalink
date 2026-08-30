import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Activity, AlarmClock, ArrowUpRight } from "lucide-react";
import {
  EmptyState,
  ErrorState,
  KPIGridSkeleton,
  Money,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
} from "@/components/primitives";
import { cn } from "@/lib/utils";
import { getOperationsBoard, type OperationsBoard } from "@/lib/operations.functions";

const boardQuery = queryOptions({
  queryKey: ["admin", "operations", "board"],
  queryFn: () => getOperationsBoard(),
  refetchInterval: 15_000,
  staleTime: 10_000,
});

export const Route = createFileRoute("/_admin/admin/operations")({
  head: () => ({
    meta: [
      { title: "Operations dashboard — IT-360 CashApp Admin" },
      {
        name: "description",
        content:
          "Live control board for the duty officer: work queues with SLA ageing, money in motion today, recent activity and system health.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error }) => (
    <ErrorState title="Operations board unavailable" message={error.message} />
  ),
  notFoundComponent: () => (
    <EmptyState title="Nothing here" hint="This operations view does not exist." />
  ),
  component: OperationsPage,
});

function OperationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Control board"
        title="Operations dashboard"
        description="Everything waiting on the institution right now, refreshed every 15 seconds. Each tile links straight to the queue that owns the work."
      />
      <Suspense
        fallback={
          <div className="space-y-6">
            <KPIGridSkeleton count={4} />
            <SectionCardSkeleton />
          </div>
        }
      >
        <Board />
      </Suspense>
    </div>
  );
}

function QueueCard({ tile }: { tile: OperationsBoard["queues"][number] }) {
  const breached = tile.oldest_hours !== null && tile.oldest_hours > tile.sla_hours;
  const warning =
    !breached && tile.oldest_hours !== null && tile.oldest_hours > tile.sla_hours * 0.6;
  return (
    <a
      href={tile.link}
      className={cn(
        "group flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        breached ? "border-destructive/60" : warning ? "border-amber-500/50" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {tile.label}
        </span>
        <ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
      </div>
      <span className="text-3xl font-bold tabular-nums">{tile.count}</span>
      <span
        className={cn(
          "inline-flex items-center gap-1 text-[11px]",
          breached ? "font-semibold text-destructive" : "text-muted-foreground",
        )}
      >
        <AlarmClock className="size-3" />
        {tile.count === 0
          ? "Queue clear"
          : tile.oldest_hours === null
            ? "Awaiting review"
            : `Oldest ${tile.oldest_hours}h · SLA ${tile.sla_hours}h${breached ? " · breached" : ""}`}
      </span>
    </a>
  );
}

function Board() {
  const { data } = useSuspenseQuery(boardQuery);

  return (
    <div className="space-y-6">
      <SectionCard title="Work queues">
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
          {data.queues.map((q) => (
            <QueueCard key={q.key} tile={q} />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Money in motion">
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-5">
          {data.money.map((m) => (
            <div key={m.key} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {m.label}
              </p>
              <p className="mt-1 text-2xl font-bold">
                <Money amount={m.amount} />
              </p>
              <p className="text-[11px] text-muted-foreground">
                {m.count} {m.key === "till" ? "open till(s)" : "entry(ies)"}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Latest activity">
          <div className="p-5">
            {data.activity.length === 0 ? (
              <EmptyState title="No activity yet" hint="Audit entries appear here as staff work." />
            ) : (
              <ul className="divide-y divide-border text-sm">
                {data.activity.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 py-2">
                    <Activity className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{a.action}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {a.actor}
                        {a.actor_role ? ` · ${a.actor_role}` : ""} ·{" "}
                        {new Date(a.created_at).toLocaleString()}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <a
              href="/admin/audit"
              className="mt-3 inline-block text-xs font-semibold text-primary hover:underline"
            >
              Open the full audit trail
            </a>
          </div>
        </SectionCard>

        <SectionCard title="System health">
          <ul className="space-y-2 p-5 text-sm">
            {data.health.map((h) => (
              <li
                key={h.key}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-lg border p-3",
                  h.status === "bad"
                    ? "border-destructive/60"
                    : h.status === "warn"
                      ? "border-amber-500/50"
                      : "border-border",
                )}
              >
                <div className="min-w-0">
                  <p className="font-medium">{h.label}</p>
                  {h.detail ? (
                    <p className="truncate text-[11px] text-muted-foreground">{h.detail}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold tabular-nums">{h.value}</span>
                  {h.link ? (
                    <a href={h.link} className="text-xs font-semibold text-primary hover:underline">
                      Open
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Generated {new Date(data.generated_at).toLocaleTimeString()} · refreshes automatically
      </p>
    </div>
  );
}
