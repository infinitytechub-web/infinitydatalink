import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { toast } from "sonner";
import { EmptyState, PageHeader, SectionCard, SectionCardSkeleton } from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";
import { Pagination } from "@/components/table-controls";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listAdminActivity, type ActivityEntry } from "@/lib/admin-activity.functions";

const search = z.object({
  action: fallback(z.string(), "all").default("all"),
  actor: fallback(z.string(), "").default(""),
  target: fallback(z.string(), "").default(""),
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
  page: fallback(z.number().int(), 1).default(1),
  pageSize: fallback(z.number().int(), 50).default(50),
});
type SearchInput = z.infer<typeof search>;

export const Route = createFileRoute("/_admin/admin/activity")({
  validateSearch: zodValidator(search),
  head: () => ({
    meta: [
      { title: "Activity Timeline — IT-360 CashApp" },
      { name: "description", content: "Chronological admin audit trail with filters and export." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ActivityPage,
});

const activityQuery = (s: SearchInput) =>
  queryOptions({
    queryKey: ["admin", "activity", s],
    queryFn: () =>
      listAdminActivity({
        data: {
          action: s.action,
          actor: s.actor.trim() || undefined,
          target: s.target.trim() || undefined,
          from: s.from ? new Date(s.from).toISOString() : undefined,
          to: s.to
            ? new Date(new Date(s.to).getTime() + 24 * 60 * 60 * 1000 - 1).toISOString()
            : undefined,
          page: Math.max(1, s.page),
          pageSize: s.pageSize,
        },
      }),
  });

function ActivityPage() {
  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Activity Timeline"
        description="Chronological view of every recorded admin action and user event, with filters and export."
      />
      <Suspense fallback={<SectionCardSkeleton title="Activity" rows={10} cols={4} />}>
        <ActivityContent />
      </Suspense>
    </>
  );
}

function actionCategory(action: string) {
  const a = action.toLowerCase();
  if (a.startsWith("loan")) return { label: "Loan", color: "bg-emerald-500" };
  if (a.startsWith("transfer")) return { label: "Transfer", color: "bg-sky-500" };
  if (a.startsWith("kyc")) return { label: "KYC", color: "bg-indigo-500" };
  if (a.startsWith("role") || a.includes("admin")) return { label: "Role", color: "bg-amber-500" };
  if (a.startsWith("branding") || a.startsWith("settings")) return { label: "Settings", color: "bg-fuchsia-500" };
  if (a.startsWith("auth") || a.startsWith("user")) return { label: "Auth", color: "bg-rose-500" };
  return { label: "Event", color: "bg-slate-500" };
}

function ActivityContent() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data } = useSuspenseQuery(activityQuery(s));
  const [selected, setSelected] = useState<ActivityEntry | null>(null);

  const setSearch = (patch: Partial<SearchInput>) =>
    navigate({ search: (prev: SearchInput) => ({ ...prev, ...patch, page: patch.page ?? 1 }) });

  const rows = data.rows;

  const grouped = groupByDay(rows);

  return (
    <>
      <SectionCard
        title="Timeline"
        action={
          <ExportBar
            permission="export:audit"
            title="Admin Activity Timeline"
            subtitle={`${data.total} events`}
            filename="admin_activity"
            columns={[
              { header: "Timestamp", accessor: (e: ActivityEntry) => new Date(e.created_at).toISOString() },
              { header: "Action", accessor: (e) => e.action },
              { header: "Target", accessor: (e) => e.target ?? "—" },
              { header: "Actor", accessor: (e) => e.actor_email ?? e.actor_id ?? "—" },
              { header: "Role", accessor: (e) => e.actor_role ?? "—" },
              { header: "Meta", accessor: (e) => (e.meta ? JSON.stringify(e.meta) : "") },
            ]}
            rows={rows}
          />
        }
      >
        <div className="flex flex-wrap items-end gap-3 border-b border-emerald-deep/5 bg-cream/30 px-6 py-4">
          <Field label="Action">
            <select
              value={s.action}
              onChange={(e) => setSearch({ action: e.target.value })}
              className="rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs outline-none focus:border-emerald-mid"
            >
              <option value="all">All actions</option>
              {data.actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Actor email">
            <input
              value={s.actor}
              onChange={(e) => setSearch({ actor: e.target.value })}
              placeholder="name@org.com"
              className="w-56 rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs outline-none focus:border-emerald-mid"
            />
          </Field>
          <Field label="Target">
            <input
              value={s.target}
              onChange={(e) => setSearch({ target: e.target.value })}
              placeholder="ID or reference"
              className="w-56 rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs outline-none focus:border-emerald-mid"
            />
          </Field>
          <Field label="From">
            <input
              type="date"
              value={s.from}
              onChange={(e) => setSearch({ from: e.target.value })}
              className="rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs outline-none focus:border-emerald-mid"
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={s.to}
              onChange={(e) => setSearch({ to: e.target.value })}
              className="rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs outline-none focus:border-emerald-mid"
            />
          </Field>
          {(s.actor || s.target || s.from || s.to || s.action !== "all") && (
            <button
              onClick={() =>
                navigate({
                  search: {
                    action: "all",
                    actor: "",
                    target: "",
                    from: "",
                    to: "",
                    page: 1,
                    pageSize: s.pageSize,
                  },
                })
              }
              className="rounded border border-emerald-deep/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/70 hover:bg-cream/50"
            >
              Reset
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No activity found" hint="Adjust filters or widen the date range." />
          </div>
        ) : (
          <>
            <div className="p-6">
              {grouped.map((day) => (
                <div key={day.date} className="mb-8 last:mb-0">
                  <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/50">
                    {day.date} · {day.entries.length} event{day.entries.length === 1 ? "" : "s"}
                  </div>
                  <ol className="relative border-l-2 border-emerald-deep/10 pl-5">
                    {day.entries.map((e) => {
                      const cat = actionCategory(e.action);
                      return (
                        <li key={e.id} className="relative mb-4 last:mb-0">
                          <span
                            className={`absolute -left-[27px] top-1.5 h-3 w-3 rounded-full ring-2 ring-card ${cat.color}`}
                          />
                          <button
                            onClick={() => setSelected(e)}
                            className="w-full rounded border border-emerald-deep/10 bg-card px-4 py-3 text-left hover:bg-cream/40"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`inline-block rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white ${cat.color}`}
                                >
                                  {cat.label}
                                </span>
                                <span className="tabular font-mono text-xs text-emerald-deep">
                                  {e.action}
                                </span>
                              </div>
                              <span className="tabular text-[11px] text-emerald-deep/60">
                                {new Date(e.created_at).toLocaleTimeString()}
                              </span>
                            </div>
                            <div className="mt-1.5 grid grid-cols-1 gap-1 text-xs text-emerald-deep/70 md:grid-cols-3">
                              <div>
                                <span className="text-emerald-deep/40">Actor: </span>
                                {e.actor_email ?? e.actor_id ?? "—"}
                                {e.actor_role && (
                                  <span className="ml-1 text-[9px] uppercase tracking-widest text-emerald-deep/40">
                                    · {e.actor_role}
                                  </span>
                                )}
                              </div>
                              <div className="truncate">
                                <span className="text-emerald-deep/40">Target: </span>
                                <span className="tabular font-mono">{e.target ?? "—"}</span>
                              </div>
                              <div className="text-emerald-deep/40">Click for details →</div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
            </div>
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onPage={(n) => setSearch({ page: n })}
              onPageSize={(n) => setSearch({ pageSize: n, page: 1 })}
            />
          </>
        )}
      </SectionCard>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-emerald-deep">
              Activity details
            </DialogTitle>
            <DialogDescription>Full metadata for this audit entry.</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <DetailRow label="Timestamp" value={new Date(selected.created_at).toLocaleString()} />
              <DetailRow label="Action" value={selected.action} mono />
              <DetailRow label="Target" value={selected.target ?? "—"} mono />
              <DetailRow label="Actor email" value={selected.actor_email ?? "—"} />
              <DetailRow label="Actor role" value={selected.actor_role ?? "—"} />
              <DetailRow label="Actor ID" value={selected.actor_id ?? "—"} mono />
              <DetailRow label="Entry ID" value={selected.id} mono />
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/50">
                  Metadata
                </div>
                <pre className="max-h-64 overflow-auto rounded border border-emerald-deep/10 bg-cream/30 p-3 text-[11px] text-emerald-deep/80">
                  {selected.meta ? JSON.stringify(selected.meta, null, 2) : "— none —"}
                </pre>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(JSON.stringify(selected, null, 2));
                      toast.success("Entry copied");
                    } catch {
                      toast.error("Copy failed");
                    }
                  }}
                  className="mt-2 rounded border border-emerald-deep/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/70 hover:bg-cream/50"
                >
                  Copy JSON
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function groupByDay(rows: ActivityEntry[]) {
  const groups = new Map<string, ActivityEntry[]>();
  for (const r of rows) {
    const d = new Date(r.created_at);
    const key = d.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  return Array.from(groups.entries()).map(([date, entries]) => ({ date, entries }));
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded border border-emerald-deep/10 bg-card px-3 py-2 text-xs">
      <div className="text-emerald-deep/50">{label}</div>
      <div className={`text-right text-emerald-deep/90 break-all ${mono ? "tabular font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-deep/50">
        {label}
      </span>
      {children}
    </label>
  );
}
