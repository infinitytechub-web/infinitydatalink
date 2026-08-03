import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Suspense, useEffect, useMemo, useState } from "react";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { toast } from "sonner";
import { ALL_REMEDIATION_ITEMS } from "@/lib/kyc-remediation";
import { MinorTag } from "@/components/biodata-fields";
import { KycRecordActions } from "@/components/kyc-record-actions";
import { useAuth } from "@/lib/auth";
import { formatAge, resolveMinorStatus } from "@/lib/age";


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
  decideKyc,
  deleteKycReview,

  getKycResubmissionSettings,
  updateKycResubmissionSettings,
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
        <Suspense fallback={<SectionCardSkeleton title="Resubmission rules" rows={3} />}>
          <ResubmissionRules />
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
  const { hasRole } = useAuth();
  // Deleting a review record is destructive: system super admins and admins only.
  const canDeleteReview = hasRole("super_admin") || hasRole("admin");

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
  const [bulkItems, setBulkItems] = useState<string[]>([]);
  const [assignOpenFor, setAssignOpenFor] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KycQueueRow | null>(null);
  const [deleteReason, setDeleteReason] = useState("");


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
    mutationFn: (args: {
      member_ids: string[];
      decision: "approved" | "rejected";
      notes: string;
      remediation_items: string[];
    }) => bulkDecideKyc({ data: args }),
    onSuccess: (res) => {
      const failed = res.failed.length;
      if (failed === 0) toast.success(`${res.succeeded} member${res.succeeded === 1 ? "" : "s"} ${bulkDialog}`);
      else toast.warning(`${res.succeeded} succeeded · ${failed} failed`);
      setSelected(new Set());
      setBulkDialog(null);
      setBulkNotes("");
      setBulkItems([]);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Bulk decision failed"),
  });

  const decideOne = useServerFn(decideKyc);
  const removeReview = useServerFn(deleteKycReview);

  const rowDecision = async (
    row: KycQueueRow,
    decision: "approved" | "rejected",
    note: string,
    remediationItems: string[] = [],
  ) => {
    const minor = resolveMinorStatus(row.date_of_birth ?? null, row.is_minor ?? null).effective;
    if (minor) {
      toast.info("Minor accounts need the guardian checklist — opening the full review.");
      void navigate({ to: "/admin/members/$id", params: { id: row.member_id } });
      return;
    }
    await decideOne({
      data: {
        member_id: row.member_id,
        decision,
        notes: note,
        remediation_items: decision === "rejected" ? remediationItems : [],
      },
    });
    toast.success(`${row.full_name ?? "Member"} ${decision}`);
    invalidate();
  };


  const deleteMutation = useMutation({
    mutationFn: (args: { member_id: string; reason: string }) => removeReview({ data: args }),
    onSuccess: (res) => {
      toast.success(
        `KYC review deleted · ${res.documents_deleted} document${res.documents_deleted === 1 ? "" : "s"} removed`,
      );
      setDeleteTarget(null);
      setDeleteReason("");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
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
              <th className="px-4 py-3 text-right font-medium">Actions</th>

            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-deep/5">
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-10 text-center text-sm text-emerald-deep/50">
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
                      <div className="flex items-center gap-2 font-semibold">
                        {m.full_name ?? "—"}
                        {(() => {
                          const minor = resolveMinorStatus(m.date_of_birth, m.is_minor);
                          return minor.effective || minor.mismatch ? (
                            <MinorTag mismatch={minor.mismatch} label={minor.effective ? "Under 18" : "18+"} />
                          ) : null;
                        })()}
                      </div>
                      <div className="tabular text-[11px] text-emerald-deep/50">
                        {m.member_no ?? ""} · {m.region ?? "—"}
                        {m.date_of_birth ? ` · ${formatAge(m.date_of_birth)}` : ""}
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
                  <td className="px-4 py-3">
                    <KycRecordActions
                      label="individual KYC record"
                      title={`Individual KYC — ${m.full_name ?? m.member_no ?? m.member_id}`}
                      subtitle={`Status ${m.kyc}`}
                      filename={`kyc_${m.member_no ?? m.member_id}`}
                      fields={[
                        { label: "Member", value: m.full_name ?? "—" },
                        { label: "Member no.", value: m.member_no ?? "—" },
                        { label: "Region", value: m.region ?? "—" },
                        { label: "Phone", value: m.phone ?? "—" },
                        { label: "National ID", value: m.national_id ?? "—" },
                        { label: "Date of birth", value: m.date_of_birth ?? "—" },
                        { label: "Under 18", value: m.is_minor ? "Yes" : "No" },
                        { label: "KYC status", value: m.kyc },
                        { label: "Pending documents", value: String(m.pending_docs) },
                        { label: "Assignee", value: m.kyc_assigned_name ?? "Unassigned" },
                      ]}
                      onView={() => navigate({ to: "/admin/members/$id", params: { id: m.member_id } })}
                      onEdit={() => navigate({ to: "/admin/members/$id", params: { id: m.member_id } })}
                      onDecide={(decision, note) => rowDecision(m, decision, note)}
                      {...(canDeleteReview ? { onDelete: () => setDeleteTarget(m) } : {})}
                      noConfirm={["delete"]}
                      disabled={{ approve: m.kyc === "active", reject: m.kyc === "rejected" }}
                      className="justify-end"
                    />

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
              A reviewer note of at least 5 characters is required and stored on each member's audit
              log. Incomplete submissions are skipped and reported back instead of being approved.
            </p>
            <textarea
              value={bulkNotes}
              onChange={(e) => setBulkNotes(e.target.value)}
              placeholder={
                bulkDialog === "rejected"
                  ? "Reason shown to the member in their notification email"
                  : "Why these submissions are approved"
              }
              rows={4}
              className="w-full rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm outline-none focus:border-emerald-mid"
            />

            <p className="rounded border border-gold/40 bg-gold/10 px-3 py-2 text-[11px] text-emerald-deep/80">
              Minor (under 18) accounts are skipped in bulk decisions — open each one to complete
              guardian verification and re-authentication.
            </p>

            {bulkDialog === "rejected" ? (
              <fieldset className="rounded border border-emerald-deep/15 p-3">
                <legend className="px-1 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/60">
                  Items every selected member must revise
                </legend>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {ALL_REMEDIATION_ITEMS.map((item) => (
                    <label key={item.key} className="flex items-center gap-2 text-xs text-emerald-deep/80">
                      <input
                        type="checkbox"
                        checked={bulkItems.includes(item.key)}
                        onChange={() =>
                          setBulkItems((prev) =>
                            prev.includes(item.key)
                              ? prev.filter((k) => k !== item.key)
                              : [...prev, item.key],
                          )
                        }
                        className="h-3.5 w-3.5 accent-emerald-deep"
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-emerald-deep/50">
                  Leave empty to ask for all documents to be re-uploaded.
                </p>
              </fieldset>
            ) : null}
          </div>
          <DialogFooter>
            <button
              className="rounded border border-emerald-deep/15 px-3 py-1.5 text-xs uppercase tracking-widest"
              onClick={() => {
                setBulkDialog(null);
                setBulkNotes("");
                setBulkItems([]);
              }}
            >
              Cancel
            </button>
            <button
              disabled={bulkMutation.isPending || bulkNotes.trim().length < 5}

              onClick={() =>
                bulkDialog &&
                bulkMutation.mutate({
                  member_ids: selectedList,
                  decision: bulkDialog,
                  notes: bulkNotes,
                  remediation_items: bulkDialog === "rejected" ? bulkItems : [],
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

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteTarget(null);
            setDeleteReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete KYC review record</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            This permanently removes the uploaded KYC documents, the reviewer decision, remediation
            checklist and resubmission counters for{" "}
            <span className="font-semibold text-foreground">
              {deleteTarget?.full_name ?? deleteTarget?.member_no ?? "this member"}
            </span>
            . The member account stays active and returns to an un-submitted state so KYC can be
            started again. The action is audit-logged.
          </p>
          <textarea
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            rows={4}
            placeholder="Why is this KYC review record being deleted?"
            className="w-full rounded-md border border-border bg-background p-2 text-sm"
          />
          <p className="text-[11px] text-muted-foreground">
            {deleteReason.trim().length}/5 characters minimum.
          </p>
          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteReason("");
              }}
              className="rounded border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-widest"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleteMutation.isPending || deleteReason.trim().length < 5}
              onClick={() =>
                deleteTarget &&
                deleteMutation.mutate({
                  member_id: deleteTarget.member_id,
                  reason: deleteReason.trim(),
                })
              }
              className={`rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-widest disabled:opacity-40 ${BUTTON_TONE.danger}`}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete review"}
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


const resubmissionSettingsQuery = queryOptions({
  queryKey: ["admin", "kyc-resubmission-settings"],
  queryFn: () => getKycResubmissionSettings(),
});

/**
 * Resubmission window + attempt allowance applied to every future rejection.
 * Existing rejections keep the deadline and allowance stamped at decision time.
 */
function ResubmissionRules() {
  const { data } = useSuspenseQuery(resubmissionSettingsQuery);
  const qc = useQueryClient();
  const [days, setDays] = useState(String(data.deadline_days));
  const [attempts, setAttempts] = useState(String(data.max_attempts));
  const [enforce, setEnforce] = useState(data.enforce_deadline);
  const [autoFlag, setAutoFlag] = useState(data.auto_flag_enabled);
  const [minSeverity, setMinSeverity] = useState<"low" | "medium" | "high">(
    data.auto_flag_min_severity,
  );
  const [remind, setRemind] = useState(data.reminder_enabled);
  const [lead, setLead] = useState(String(data.reminder_lead_days));
  const [lowLeft, setLowLeft] = useState(String(data.low_attempts_threshold));

  useEffect(() => {
    setDays(String(data.deadline_days));
    setAttempts(String(data.max_attempts));
    setEnforce(data.enforce_deadline);
    setAutoFlag(data.auto_flag_enabled);
    setMinSeverity(data.auto_flag_min_severity);
    setRemind(data.reminder_enabled);
    setLead(String(data.reminder_lead_days));
    setLowLeft(String(data.low_attempts_threshold));
  }, [
    data.deadline_days,
    data.max_attempts,
    data.enforce_deadline,
    data.auto_flag_enabled,
    data.auto_flag_min_severity,
    data.reminder_enabled,
    data.reminder_lead_days,
    data.low_attempts_threshold,
  ]);

  const save = useMutation({
    mutationFn: () =>
      updateKycResubmissionSettings({
        data: {
          deadline_days: Number(days),
          max_attempts: Number(attempts),
          enforce_deadline: enforce,
          auto_flag_enabled: autoFlag,
          auto_flag_min_severity: minSeverity,
          reminder_enabled: remind,
          reminder_lead_days: Number(lead),
          low_attempts_threshold: Number(lowLeft),
        },
      }),


    onSuccess: () => {
      toast.success("Resubmission rules saved");
      qc.invalidateQueries({ queryKey: ["admin", "kyc-resubmission-settings"] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Could not save the rules"),
  });

  const dayNum = Number(days);
  const attemptNum = Number(attempts);
  const leadNum = Number(lead);
  const lowNum = Number(lowLeft);
  const valid =
    Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 365 &&
    Number.isInteger(attemptNum) && attemptNum >= 1 && attemptNum <= 20 &&
    Number.isInteger(leadNum) && leadNum >= 0 && leadNum <= 60 &&
    Number.isInteger(lowNum) && lowNum >= 0 && lowNum <= 20;


  return (
    <SectionCard title="Resubmission deadlines & attempt limits">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Deadline (days after rejection)
          <input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="w-28 rounded border border-border bg-card px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Max attempts
          <input
            type="number"
            min={1}
            max={20}
            value={attempts}
            onChange={(e) => setAttempts(e.target.value)}
            className="w-28 rounded border border-border bg-card px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus:border-primary"
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={enforce}
            onChange={(e) => setEnforce(e.target.checked)}
            className="h-3.5 w-3.5 accent-primary"
          />
          Block resubmission once the deadline passes
        </label>
        <label className="flex items-center gap-2 pb-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={autoFlag}
            onChange={(e) => setAutoFlag(e.target.checked)}
            className="h-3.5 w-3.5 accent-primary"
          />
          Auto-flag risky resubmissions for re-review
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Flag from severity
          <select
            value={minSeverity}
            disabled={!autoFlag}
            onChange={(e) => setMinSeverity(e.target.value as "low" | "medium" | "high")}
            className="w-32 rounded border border-border bg-card px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus:border-primary disabled:opacity-50"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={remind}
            onChange={(e) => setRemind(e.target.checked)}
            className="h-3.5 w-3.5 accent-primary"
          />
          Send automated deadline &amp; attempt reminders
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Remind (days before deadline)
          <input
            type="number"
            min={0}
            max={60}
            value={lead}
            disabled={!remind}
            onChange={(e) => setLead(e.target.value)}
            className="w-28 rounded border border-border bg-card px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus:border-primary disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Warn at attempts left
          <input
            type="number"
            min={0}
            max={20}
            value={lowLeft}
            disabled={!remind}
            onChange={(e) => setLowLeft(e.target.value)}
            className="w-28 rounded border border-border bg-card px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus:border-primary disabled:opacity-50"
          />
        </label>

        <button
          type="button"
          disabled={!valid || save.isPending}
          onClick={() => save.mutate()}
          className={`${BUTTON_TONE.primary} ml-auto disabled:opacity-50`}
        >
          Save rules
        </button>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Applies to rejections taken from now on — members already rejected keep the deadline and
        allowance recorded at the time of their decision. Reminders run once a day and each member
        receives a given notice only once.
        {data.updated_at ? ` Last changed ${new Date(data.updated_at).toLocaleString()}.` : ""}
      </p>

    </SectionCard>
  );
}
