import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Suspense, useEffect, useMemo, useState } from "react";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { toast } from "sonner";
import {
  ErrorState,
  KPIGridSkeleton,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
  StatusPill,
} from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";
import { BUTTON_TONE } from "@/lib/theme-tokens";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  listKycQueue,
  getKycSummary,
  listKycReviewers,
  assignKyc,
  bulkDecideKyc,
  type KycQueueRow,
} from "@/lib/admin-kyc.functions";
import {
  AGING_ORDER,
  BUCKET_META,
  bucketFor,
  formatCountdown,
  hoursSince,
  slaRemainingHours,
  type AgingBucket,
} from "@/lib/kyc-sla";

const search = z.object({
  status: fallback(z.enum(["all", "pending", "active", "rejected"]), "pending").default("pending"),
  assignee: fallback(z.string(), "any").default("any"),
  aging: fallback(z.enum(["any", "fresh", "due_soon", "overdue", "critical"]), "any").default("any"),
  q: fallback(z.string(), "").default(""),
  page: fallback(z.number().int().min(1), 1).default(1),
});
type SearchInput = z.infer<typeof search>;

const PAGE_SIZE = 25;

const queueQuery = (s: SearchInput) =>
  queryOptions({
    queryKey: ["admin", "kyc", "queue", s.status, s.assignee, s.aging, s.q, s.page],
    queryFn: () =>
      listKycQueue({
        data: {
          status: s.status,
          assignee: s.assignee || "any",
          aging: s.aging,
          q: s.q || undefined,
          page: s.page,
          page_size: PAGE_SIZE,
        },
      }),
    staleTime: 15_000,
  });

const summaryQuery = queryOptions({
  queryKey: ["admin", "kyc", "summary"],
  queryFn: () => getKycSummary(),
  staleTime: 15_000,
});

const reviewersQuery = queryOptions({
  queryKey: ["admin", "kyc", "reviewers"],
  queryFn: () => listKycReviewers(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/_admin/admin/members")({
  validateSearch: zodValidator(search),
  head: () => ({ meta: [{ title: "KYC queue — Admin" }, { name: "robots", content: "noindex" }] }),
  component: MembersPage,
  errorComponent: ({ error }) => (
    <div className="p-6"><ErrorState title="Queue failed to load" message={error.message} /></div>
  ),
});

function MembersPage() {
  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="KYC review queue"
        description="Assign reviewers, take decisions individually, or approve and reject in bulk."
      />
      <div className="space-y-6">
        <Suspense fallback={<KPIGridSkeleton count={4} />}>
          <SummaryCards />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-10 w-full" />}>
          <AgingChips />
        </Suspense>
        <Suspense fallback={<SectionCardSkeleton title="Queue" rows={8} cols={6} />}>
          <QueueBody />
        </Suspense>
      </div>
    </>
  );
}

function SummaryCards() {
  const { data } = useSuspenseQuery(summaryQuery);
  const oldestHours = hoursSince(data.oldest_pending_at);
  const oldestLabel =
    oldestHours == null
      ? "—"
      : oldestHours >= 24
        ? `${Math.floor(oldestHours / 24)}d ${Math.floor(oldestHours % 24)}h`
        : `${Math.floor(oldestHours)}h`;
  const items = [
    { label: "Pending", value: data.pending, tone: "text-warning" },
    { label: "Assigned to me", value: data.assigned_to_me, tone: "text-success" },
    { label: "SLA breached", value: data.breached, tone: data.breached > 0 ? "text-destructive" : "text-muted-foreground" },
    { label: `Oldest pending`, value: oldestLabel, tone: "text-foreground" },
    { label: "Unassigned", value: data.unassigned_pending, tone: "text-destructive" },
    { label: "Decided (24h)", value: data.decided_today, tone: "text-foreground" },

  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {items.map((it) => (
        <div key={it.label} className="rounded border border-emerald-deep/10 bg-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-deep/50">
            {it.label}
          </div>
          <div className={`mt-1 text-2xl font-semibold tabular ${it.tone}`}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}

function AgingChips() {
  const { data } = useSuspenseQuery(summaryQuery);
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const setAging = (aging: "any" | AgingBucket) =>
    navigate({
      search: (p: SearchInput) => ({ ...p, status: "pending", aging, page: 1 }),
    });
  const active = s.status === "pending" ? s.aging : "any";
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-emerald-deep/10 bg-card px-3 py-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-deep/50">
        Aging (pending)
      </span>
      <button
        onClick={() => setAging("any")}
        className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-widest ${
          active === "any"
            ? "bg-emerald-deep text-cream"
            : "border border-emerald-deep/15 text-emerald-deep/70 hover:bg-cream"
        }`}
      >
        All · {data.pending}
      </button>
      {AGING_ORDER.map((b) => {
        const meta = BUCKET_META[b];
        const count = data.aging[b];
        const isActive = active === b;
        return (
          <button
            key={b}
            onClick={() => setAging(b)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${
              isActive ? "ring-2 ring-emerald-deep ring-offset-1 ring-offset-card" : ""
            } ${meta.tone}`}
            title={meta.label}
          >
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {meta.short} · {count}
          </button>
        );
      })}
    </div>
  );
}

function QueueBody() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(queueQuery(s));
  const { data: reviewers = [] } = useQuery(reviewersQuery);

  // Tick every 60s so SLA countdowns refresh live without refetching.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDialog, setBulkDialog] = useState<null | "approved" | "rejected">(null);
  const [bulkNotes, setBulkNotes] = useState("");
  const [assignOpenFor, setAssignOpenFor] = useState<string | null>(null);

  const setSearch = (patch: Partial<SearchInput>) => {
    setSelected(new Set());
    navigate({ search: (prev: SearchInput) => ({ ...prev, page: 1, ...patch }) });
  };

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const allChecked = data.rows.length > 0 && data.rows.every((r) => selected.has(r.member_id));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "kyc"] });
  };

  const assignMutation = useMutation({
    mutationFn: (args: { member_ids: string[]; assignee_id: string | null }) =>
      assignKyc({ data: args }),
    onSuccess: (res) => {
      toast.success(`${res.updated} member${res.updated === 1 ? "" : "s"} updated`);
      setSelected(new Set());
      setAssignOpenFor(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Assignment failed"),
  });

  const bulkMutation = useMutation({
    mutationFn: (args: { member_ids: string[]; decision: "approved" | "rejected"; notes: string }) =>
      bulkDecideKyc({ data: args }),
    onSuccess: (res) => {
      const failed = res.failed.length;
      if (failed === 0) toast.success(`${res.succeeded} member${res.succeeded === 1 ? "" : "s"} ${bulkDialog}`);
      else toast.warning(`${res.succeeded} succeeded · ${failed} failed`);
      setSelected(new Set());
      setBulkDialog(null);
      setBulkNotes("");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Bulk decision failed"),
  });

  const selectedList = useMemo(() => Array.from(selected), [selected]);

  return (
    <>
      <SectionCard
        title="Directory"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <input
              defaultValue={s.q}
              placeholder="Search name, member no., national ID…"
              onKeyDown={(e) => {
                if (e.key === "Enter") setSearch({ q: (e.target as HTMLInputElement).value });
              }}
              className="w-56 rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs outline-none focus:border-emerald-mid"
            />
            <select
              value={s.assignee}
              onChange={(e) => setSearch({ assignee: e.target.value })}
              className="rounded border border-emerald-deep/15 bg-card px-2 py-1.5 text-xs"
            >
              <option value="any">Any reviewer</option>
              <option value="me">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
              {reviewers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <div className="inline-flex rounded border border-emerald-deep/15 bg-card p-0.5 text-[10px] uppercase tracking-widest">
              {(["all", "pending", "active", "rejected"] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setSearch({ status: st })}
                  className={`rounded px-2.5 py-1 font-bold ${
                    s.status === st ? "bg-emerald-deep text-cream" : "text-emerald-deep/70 hover:bg-cream/50"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
            <ExportBar
              permission="export:members"
              title="KYC Queue"
              subtitle={`${data.total} member${data.total === 1 ? "" : "s"} · ${s.status}`}
              filename={`members_${s.status}`}
              columns={[
                { header: "Member No", accessor: (m: KycQueueRow) => m.member_no ?? "—" },
                { header: "Name", accessor: (m) => m.full_name ?? "—" },
                { header: "Region", accessor: (m) => m.region ?? "—" },
                { header: "Phone", accessor: (m) => m.phone ?? "—" },
                { header: "National ID", accessor: (m) => m.national_id ?? "—" },
                { header: "KYC", accessor: (m) => m.kyc },
                { header: "Assignee", accessor: (m) => m.kyc_assigned_name ?? "—" },
                { header: "Pending docs", accessor: (m) => m.pending_docs, align: "right" },
              ]}
              rows={data.rows}
            />
          </div>
        }
      >
        {selected.size > 0 ? (
          <SelectionToolbar
            count={selected.size}
            reviewers={reviewers}
            onAssign={(assignee_id) =>
              assignMutation.mutate({ member_ids: selectedList, assignee_id })
            }
            onBulk={(d) => setBulkDialog(d)}
            onClear={() => setSelected(new Set())}
          />
        ) : null}

        <table className="w-full">
          <thead>
            <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
              <th className="px-3 py-3">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => {
                    if (e.target.checked) setSelected(new Set(data.rows.map((r) => r.member_id)));
                    else setSelected(new Set());
                  }}
                />
              </th>
              <th className="px-4 py-3 font-medium">Member</th>
              <th className="px-4 py-3 font-medium">Assignee</th>
              <th className="px-4 py-3 text-right font-medium">Docs</th>
              <th className="px-4 py-3 text-right font-medium">SLA</th>
              <th className="px-4 py-3 text-right font-medium">Last activity</th>
              <th className="px-4 py-3 text-right font-medium">KYC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-deep/5">
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-sm text-emerald-deep/50">
                  No members match these filters.
                </td>
              </tr>
            ) : (
              data.rows.map((m) => (
                <tr key={m.member_id} className="hover:bg-cream/30">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(m.member_id)}
                      onChange={(e) => {
                        setSelected((prev) => {
                          const n = new Set(prev);
                          if (e.target.checked) n.add(m.member_id);
                          else n.delete(m.member_id);
                          return n;
                        });
                      }}
                    />
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <Link to="/admin/members/$id" params={{ id: m.member_id }} className="block">
                      <div className="font-semibold">{m.full_name ?? "—"}</div>
                      <div className="tabular text-[11px] text-emerald-deep/50">
                        {m.member_no ?? ""} · {m.region ?? "—"}
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <Popover
                      open={assignOpenFor === m.member_id}
                      onOpenChange={(o) => setAssignOpenFor(o ? m.member_id : null)}
                    >
                      <PopoverTrigger asChild>
                        <button className="rounded border border-transparent px-2 py-1 text-xs hover:border-emerald-deep/15">
                          {m.kyc_assigned_name ?? (
                            <span className="text-emerald-deep/40">Unassigned</span>
                          )}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-2 text-xs">
                        <button
                          onClick={() =>
                            assignMutation.mutate({ member_ids: [m.member_id], assignee_id: null })
                          }
                          className="block w-full rounded px-2 py-1.5 text-left hover:bg-cream"
                        >
                          Unassign
                        </button>
                        <div className="my-1 border-t border-emerald-deep/10" />
                        {reviewers.map((r) => (
                          <button
                            key={r.id}
                            onClick={() =>
                              assignMutation.mutate({
                                member_ids: [m.member_id],
                                assignee_id: r.id,
                              })
                            }
                            className="block w-full rounded px-2 py-1.5 text-left hover:bg-cream"
                          >
                            {r.name}
                            <span className="ml-2 text-[10px] text-emerald-deep/40">{r.role}</span>
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>
                  </td>
                  <td className="tabular px-4 py-3 text-right text-sm">
                    {m.pending_docs > 0 ? (
                      <span className="rounded bg-gold/10 px-2 py-0.5 text-[10px] font-bold text-gold">
                        {m.pending_docs} pending
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <SlaCell pendingSince={m.pending_since} kyc={m.kyc} nowTick={nowTick} />
                  </td>
                  <td className="px-4 py-3 text-right text-[11px] text-emerald-deep/50">
                    {m.last_document_at ? new Date(m.last_document_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <StatusPill status={m.kyc as any} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="flex items-center justify-between border-t border-emerald-deep/5 px-6 py-3 text-[11px] text-emerald-deep/60">
          <span>
            Page {s.page} of {totalPages} · {data.total} total
          </span>
          <div className="flex gap-1">
            <button
              disabled={s.page <= 1}
              onClick={() =>
                navigate({ search: (p: SearchInput) => ({ ...p, page: Math.max(1, p.page - 1) }) })
              }
              className="rounded border border-emerald-deep/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest hover:bg-cream disabled:opacity-40"
            >
              Prev
            </button>
            <button
              disabled={s.page >= totalPages}
              onClick={() => navigate({ search: (p: SearchInput) => ({ ...p, page: p.page + 1 }) })}
              className="rounded border border-emerald-deep/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest hover:bg-cream disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </SectionCard>

      <Dialog open={!!bulkDialog} onOpenChange={(o) => (!o ? setBulkDialog(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {bulkDialog === "approved" ? "Bulk approve" : "Bulk reject"} · {selected.size} member
              {selected.size === 1 ? "" : "s"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-emerald-deep/70">
              {bulkDialog === "approved"
                ? "An optional note is stored on each member's audit log."
                : "A shared note (at least 5 characters) is required for rejection."}
            </p>
            <textarea
              value={bulkNotes}
              onChange={(e) => setBulkNotes(e.target.value)}
              placeholder={
                bulkDialog === "rejected"
                  ? "Reason shown to the member in their notification email"
                  : "Optional note"
              }
              rows={4}
              className="w-full rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm outline-none focus:border-emerald-mid"
            />
          </div>
          <DialogFooter>
            <button
              className="rounded border border-emerald-deep/15 px-3 py-1.5 text-xs uppercase tracking-widest"
              onClick={() => {
                setBulkDialog(null);
                setBulkNotes("");
              }}
            >
              Cancel
            </button>
            <button
              disabled={
                bulkMutation.isPending ||
                (bulkDialog === "rejected" && bulkNotes.trim().length < 5)
              }
              onClick={() =>
                bulkDialog &&
                bulkMutation.mutate({
                  member_ids: selectedList,
                  decision: bulkDialog,
                  notes: bulkNotes,
                })
              }
              className={`rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-widest disabled:opacity-40 ${
                bulkDialog === "approved" ? BUTTON_TONE.success : BUTTON_TONE.danger
              }`}

            >
              {bulkMutation.isPending
                ? "Working…"
                : bulkDialog === "approved"
                  ? "Approve all"
                  : "Reject all"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SelectionToolbar({
  count,
  reviewers,
  onAssign,
  onBulk,
  onClear,
}: {
  count: number;
  reviewers: { id: string; name: string; role: string }[];
  onAssign: (id: string | null) => void;
  onBulk: (d: "approved" | "rejected") => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-emerald-deep/5 bg-cream/40 px-6 py-3 text-xs">
      <span className="font-semibold text-emerald-deep">
        {count} selected
      </span>
      <Popover>
        <PopoverTrigger asChild>
          <button className="rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-cream">
            Assign to…
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2 text-xs">
          <button onClick={() => onAssign(null)} className="block w-full rounded px-2 py-1.5 text-left hover:bg-cream">
            Unassign
          </button>
          <div className="my-1 border-t border-emerald-deep/10" />
          {reviewers.map((r) => (
            <button
              key={r.id}
              onClick={() => onAssign(r.id)}
              className="block w-full rounded px-2 py-1.5 text-left hover:bg-cream"
            >
              {r.name}
              <span className="ml-2 text-[10px] text-emerald-deep/40">{r.role}</span>
            </button>
          ))}
        </PopoverContent>
      </Popover>
      <button
        onClick={() => onBulk("approved")}
        className={`rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-widest ${BUTTON_TONE.success}`}
      >
        Bulk approve
      </button>
      <button
        onClick={() => onBulk("rejected")}
        className={`rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-widest ${BUTTON_TONE.danger}`}
      >
        Bulk reject
      </button>

      <button onClick={onClear} className="ml-auto text-[11px] text-emerald-deep/60 underline">
        Clear selection
      </button>
    </div>
  );
}

function SlaCell({
  pendingSince,
  kyc,
  nowTick,
}: {
  pendingSince: string | null;
  kyc: KycQueueRow["kyc"];
  nowTick: number;
}) {
  if (kyc !== "pending" || !pendingSince) {
    return <span className="text-[11px] text-emerald-deep/40">—</span>;
  }
  const hours = hoursSince(pendingSince, nowTick);
  const bucket = bucketFor(hours);
  const remaining = slaRemainingHours(pendingSince, nowTick);
  const { text, breached } = formatCountdown(remaining);
  const meta = bucket ? BUCKET_META[bucket] : null;
  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      {meta ? (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.tone}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
          {meta.short}
        </span>
      ) : null}
      <span
        className={`tabular text-[10px] ${breached ? "font-semibold text-destructive" : "text-muted-foreground"}`}
      >
        {text}
      </span>
    </div>
  );
}

