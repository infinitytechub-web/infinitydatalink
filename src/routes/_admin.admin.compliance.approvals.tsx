import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ShieldCheck, Filter, X } from "lucide-react";
import {
  ErrorState,
  EmptyState,
  KPIStat,
  Money,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
  StatusPill,
} from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ExportBar } from "@/components/export-bar";
import { listDecisionAudit, type DecisionRow } from "@/lib/compliance-audit.functions";
import { DECISION_MODULES, DECISION_OUTCOMES } from "@/lib/decision-audit";

const SearchSchema = z.object({
  module: z.string().catch("all").default("all"),
  outcome: z.string().catch("all").default("all"),
  actor: z.string().max(200).catch("").default(""),
  subject: z.string().max(200).catch("").default(""),
  q: z.string().max(200).catch("").default(""),
  from: z.string().max(40).catch("").default(""),
  to: z.string().max(40).catch("").default(""),
  page: z.coerce.number().int().min(1).catch(1).default(1),
  entry: z.string().max(80).optional().catch(undefined),
});
type Search = z.infer<typeof SearchSchema>;

const PAGE_SIZE = 50;

const listQuery = (s: Search) =>
  queryOptions({
    queryKey: [
      "admin",
      "decision-audit",
      s.module,
      s.outcome,
      s.actor,
      s.subject,
      s.q,
      s.from,
      s.to,
      s.page,
    ],
    queryFn: () =>
      listDecisionAudit({
        data: {
          module: s.module,
          outcome: s.outcome,
          actor: s.actor,
          subject: s.subject,
          q: s.q,
          from: s.from,
          to: s.to,
          page: s.page,
          pageSize: PAGE_SIZE,
        },
      }),
    staleTime: 15_000,
  });

export const Route = createFileRoute("/_admin/admin/compliance/approvals")({
  head: () => ({
    meta: [
      { title: "Approval Audit Trail — IT-360 CashApp Admin" },
      {
        name: "description",
        content:
          "Compliance trail of every approval and rejection decision with officer, timestamp, and note.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Approval Audit Trail — IT-360 CashApp Admin" },
      {
        property: "og:description",
        content: "Every staff approval and rejection with user, timestamp, and compliance note.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s) => SearchSchema.parse(s),
  component: Page,
  errorComponent: ({ error }) => (
    <div className="p-6">
      <ErrorState title="Failed to load approval audit trail" message={error.message} />
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm text-muted-foreground">Not found.</div>,
});

function Page() {
  return (
    <>
      <PageHeader
        eyebrow="Compliance"
        title="Approval Audit Trail"
        description="Every approval, rejection, payout, and status change — with the officer, role, timestamp, and decision note."
      />
      <Suspense fallback={<SectionCardSkeleton title="Loading decisions" rows={8} cols={6} />}>
        <Body />
      </Suspense>
    </>
  );
}

function Body() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data } = useSuspenseQuery(listQuery(search));
  const [selected, setSelected] = useState<DecisionRow | null>(null);

  const update = (patch: Partial<Search>) =>
    navigate({ search: (prev: Search) => ({ ...prev, ...patch, page: patch.page ?? 1 }) });

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <>
      <div className="grid gap-4 p-6 pb-0 md:grid-cols-4">
        <KPIStat label="Decisions (filtered)" value={data.stats.total.toString()} />
        <KPIStat label="Approved" value={data.stats.approved.toString()} tone="emerald" />
        <KPIStat label="Rejected" value={data.stats.rejected.toString()} tone="rose" />
        <KPIStat label="Other actions" value={data.stats.other.toString()} tone="gold" />
      </div>

      <SectionCard
        title="Decision log"
        action={
          <ExportBar
            title="Approval audit trail"
            filename="approval-audit-trail"
            permission="export:audit"
            rows={data.rows}
            columns={[
              {
                header: "Timestamp",
                accessor: (r: DecisionRow) => new Date(r.created_at).toISOString(),
              },
              { header: "Module", accessor: (r: DecisionRow) => r.module },
              { header: "Decision", accessor: (r: DecisionRow) => r.outcome },
              { header: "Reference", accessor: (r: DecisionRow) => r.reference ?? "" },
              { header: "Record", accessor: (r: DecisionRow) => r.target ?? "" },
              {
                header: "Member",
                accessor: (r: DecisionRow) => r.subject_name ?? r.subject_id ?? "",
              },
              {
                header: "Officer",
                accessor: (r: DecisionRow) => r.actor_email ?? r.actor_id ?? "",
              },
              { header: "Role", accessor: (r: DecisionRow) => r.actor_role ?? "" },
              {
                header: "Amount",
                accessor: (r: DecisionRow) => (r.amount == null ? "" : String(r.amount)),
              },
              { header: "Note", accessor: (r: DecisionRow) => r.note ?? "" },
            ]}
          />
        }
      >
        <div className="grid gap-3 border-b border-border/60 p-4 md:grid-cols-3 xl:grid-cols-6">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-widest">Module</Label>
            <Select value={search.module} onValueChange={(v) => update({ module: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modules</SelectItem>
                {DECISION_MODULES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-widest">Decision</Label>
            <Select value={search.outcome} onValueChange={(v) => update({ outcome: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All decisions</SelectItem>
                {DECISION_OUTCOMES.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-widest">Officer email</Label>
            <Input
              defaultValue={search.actor}
              placeholder="officer@…"
              onBlur={(e) => update({ actor: e.target.value.trim() })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-widest">Record id</Label>
            <Input
              defaultValue={search.subject}
              placeholder="loan / request id"
              onBlur={(e) => update({ subject: e.target.value.trim() })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-widest">From</Label>
            <Input
              type="date"
              value={search.from}
              onChange={(e) => update({ from: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-widest">To</Label>
            <Input type="date" value={search.to} onChange={(e) => update({ to: e.target.value })} />
          </div>
          <div className="space-y-1 md:col-span-2 xl:col-span-4">
            <Label className="text-[10px] uppercase tracking-widest">Note contains</Label>
            <Input
              defaultValue={search.q}
              placeholder="Search decision notes…"
              onBlur={(e) => update({ q: e.target.value.trim() })}
            />
          </div>
          <div className="flex items-end gap-2 md:col-span-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigate({
                  search: {
                    module: "all",
                    outcome: "all",
                    actor: "",
                    subject: "",
                    q: "",
                    from: "",
                    to: "",
                    page: 1,
                  },
                })
              }
            >
              <Filter className="mr-1 h-3.5 w-3.5" /> Reset filters
            </Button>
          </div>
        </div>

        {data.rows.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck />}
            title="No decisions recorded"
            hint="No approval or rejection actions match the current filters."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-3 text-left">When</th>
                  <th className="p-3 text-left">Module</th>
                  <th className="p-3 text-left">Decision</th>
                  <th className="p-3 text-left">Record</th>
                  <th className="p-3 text-left">Member</th>
                  <th className="p-3 text-left">Officer</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3 text-left">Note</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr
                    key={r.id}
                    tabIndex={0}
                    onClick={() => setSelected(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(r);
                      }
                    }}
                    className="cursor-pointer border-t border-border/50 hover:bg-muted/40 focus:bg-muted/50 focus:outline-none"
                  >
                    <td className="p-3 font-mono text-[11px]">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="p-3 capitalize">{r.module}</td>
                    <td className="p-3">
                      <StatusPill status={pillStatus(r.outcome)} />
                    </td>
                    <td className="p-3 font-mono text-[11px]">{r.reference ?? r.target ?? "—"}</td>
                    <td className="p-3">
                      {r.subject_name ?? r.subject_member_no ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div>{r.actor_email ?? "—"}</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {r.actor_role ?? ""}
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      {r.amount == null ? "—" : <Money amount={r.amount} />}
                    </td>
                    <td className="max-w-[280px] truncate p-3">{r.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border/60 p-3 text-xs text-muted-foreground">
          Page {search.page} / {totalPages} · {data.total} decisions
          <Button
            size="sm"
            variant="ghost"
            disabled={search.page <= 1}
            onClick={() => update({ page: search.page - 1 })}
          >
            Prev
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={search.page >= totalPages}
            onClick={() => update({ page: search.page + 1 })}
          >
            Next
          </Button>
        </div>
      </SectionCard>

      {selected && <DecisionDetails row={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

type PillStatus = "cleared" | "closed" | "pending" | "failed" | "approved" | "rejected" | "active";
function pillStatus(outcome: string): PillStatus {
  switch (outcome) {
    case "approved":
    case "paid":
    case "activated":
      return "approved";
    case "rejected":
      return "rejected";
    case "deactivated":
      return "failed";
    case "cleared":
      return "cleared";
    default:
      return "pending";
  }
}

function DecisionDetails({ row, onClose }: { row: DecisionRow; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Decision details"
        className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-serif text-lg capitalize">
              {row.module} · {row.outcome}
            </h2>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              {new Date(row.created_at).toISOString()}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <dl className="mt-4 grid gap-2 text-xs">
          <Field label="Record" value={row.target} mono />
          <Field label="Reference" value={row.reference} />
          <Field label="Member" value={row.subject_name ?? row.subject_id} />
          <Field label="Member no" value={row.subject_member_no} />
          <Field label="Officer" value={row.actor_email ?? row.actor_id} />
          <Field label="Officer role" value={row.actor_role} />
          <Field label="Amount" value={row.amount == null ? null : row.amount.toFixed(2)} />
        </dl>
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Decision note
          </p>
          <p className="mt-1 whitespace-pre-wrap rounded bg-muted/40 p-3 text-xs">
            {row.note ?? "— no note recorded —"}
          </p>
        </div>
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Full metadata
          </p>
          <pre className="mt-1 max-h-[240px] overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-3 font-mono text-[11px]">
            {JSON.stringify(row.meta, null, 2)}
          </pre>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigator.clipboard.writeText(JSON.stringify(row, null, 2))}
          >
            Copy full metadata
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-28 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className={`min-w-0 flex-1 break-words ${mono ? "font-mono text-[11px]" : ""}`}>
        {value ?? "—"}
      </dd>
    </div>
  );
}
