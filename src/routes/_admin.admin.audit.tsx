import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { toast } from "sonner";
import { EmptyState, PageHeader, SectionCard, StatusPill } from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";
import { Pagination } from "@/components/table-controls";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatMoney } from "@/lib/org-config";
import { listLoanAudit, type LoanAuditEntry } from "@/lib/admin-loans.functions";

const search = z.object({
  decision: fallback(z.enum(["approved", "rejected", "all"]), "all").default("all"),
  member: fallback(z.string(), "").default(""),
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
  page: fallback(z.number().int(), 1).default(1),
  pageSize: fallback(z.number().int(), 25).default(25),
  selected: fallback(z.string(), "").default(""),
});
type SearchInput = z.infer<typeof search>;

export const Route = createFileRoute("/_admin/admin/audit")({
  validateSearch: zodValidator(search),
  component: AuditPage,
});

const auditQuery = (s: SearchInput) =>
  queryOptions({
    queryKey: ["admin", "loan-audit", s],
    queryFn: () =>
      listLoanAudit({
        data: {
          decision: s.decision,
          member: s.member.trim() || undefined,
          from: s.from ? new Date(s.from).toISOString() : undefined,
          to: s.to ? new Date(new Date(s.to).getTime() + 24 * 60 * 60 * 1000 - 1).toISOString() : undefined,
          page: Math.max(1, s.page),
          pageSize: s.pageSize,
        },
      }),
  });

function AuditPage() {
  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Loan Decision Audit"
        description="Immutable record of every loan approval and rejection, with the deciding officer's justification."
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <AuditContent />
      </Suspense>
    </>
  );
}

function AuditContent() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data } = useSuspenseQuery(auditQuery(s));

  const setSearch = (patch: Partial<SearchInput>) =>
    navigate({ search: (prev: SearchInput) => ({ ...prev, ...patch, page: patch.page ?? 1 }) });

  const selectEntry = (id: string | null) =>
    navigate({ search: (prev: SearchInput) => ({ ...prev, selected: id ?? "" }) });

  const rows = data.rows;
  const selected = s.selected ? rows.find((r) => r.id === s.selected) ?? null : null;


  return (
    <>
    <SectionCard
      title="Approval & rejection log"
      action={
        <ExportBar
          permission="export:audit"
          title="Loan Decision Audit"
          subtitle={`${data.total} events`}
          filename="loan_audit"
          columns={[
            { header: "Timestamp", accessor: (e: LoanAuditEntry) => new Date(e.created_at).toISOString() },
            { header: "Decision", accessor: (e) => (e.action === "loan.approved" ? "APPROVED" : "REJECTED") },
            { header: "Loan Ref", accessor: (e) => e.loan_ref ?? e.target ?? "—" },
            { header: "Member", accessor: (e) => e.member_name ?? e.member_id ?? "—" },
            { header: "Member No", accessor: (e) => e.member_no ?? "—" },
            { header: "Amount", accessor: (e) => (e.amount != null ? formatMoney(e.amount) : "—"), align: "right" },
            { header: "Officer", accessor: (e) => e.actor_email ?? e.actor_id ?? "—" },
            { header: "Role", accessor: (e) => e.actor_role ?? "—" },
            { header: "Note", accessor: (e) => e.note ?? "" },
          ]}
          rows={rows}
        />
      }
    >
      <div className="flex flex-wrap items-end gap-3 border-b border-emerald-deep/5 bg-cream/30 px-6 py-4">
        <Field label="Decision">
          <select
            value={s.decision}
            onChange={(e) => setSearch({ decision: e.target.value as SearchInput["decision"] })}
            className="rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs outline-none focus:border-emerald-mid"
          >
            <option value="all">All decisions</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </Field>
        <Field label="Member / Ref">
          <input
            value={s.member}
            onChange={(e) => setSearch({ member: e.target.value })}
            placeholder="Name, member no or LN-…"
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
        {(s.member || s.from || s.to || s.decision !== "all") && (
          <button
            onClick={() =>
              navigate({ search: { decision: "all", member: "", from: "", to: "", page: 1, pageSize: s.pageSize, selected: "" } })
            }
            className="rounded border border-emerald-deep/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/70 hover:bg-cream/50"
          >
            Reset
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="p-6">
          <EmptyState title="No matching decisions" hint="Adjust filters or approve a pending loan to see entries." />
        </div>
      ) : (
        <>
          <table className="w-full">
            <thead>
              <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
                <th className="px-6 py-3 font-medium">Timestamp</th>
                <th className="px-6 py-3 font-medium">Decision</th>
                <th className="px-6 py-3 font-medium">Loan</th>
                <th className="px-6 py-3 font-medium">Member</th>
                <th className="px-6 py-3 text-right font-medium">Amount</th>
                <th className="px-6 py-3 font-medium">Officer</th>
                <th className="px-6 py-3 font-medium">Justification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-deep/5">
              {rows.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => selectEntry(e.id)}
                  className="align-top cursor-pointer hover:bg-cream/40"
                >
                  <td className="tabular px-6 py-4 text-xs text-emerald-deep/70">
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <StatusPill status={e.action === "loan.approved" ? "approved" : "rejected"} />
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div className="tabular font-semibold">{e.loan_ref ?? "—"}</div>
                    <div className="text-[11px] text-emerald-deep/50 truncate max-w-[10rem]">
                      {e.target ?? ""}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div className="font-medium">{e.member_name ?? "—"}</div>
                    <div className="tabular text-[11px] text-emerald-deep/50">{e.member_no ?? ""}</div>
                  </td>
                  <td className="tabular px-6 py-4 text-right text-sm">
                    {e.amount != null ? formatMoney(e.amount) : "—"}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div className="font-medium">{e.actor_email ?? "—"}</div>
                    <div className="text-[10px] uppercase tracking-widest text-emerald-deep/40">
                      {e.actor_role ?? "—"}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs text-emerald-deep/80 max-w-md whitespace-pre-wrap">
                    <div className="line-clamp-2">
                      {e.note ?? <span className="text-emerald-deep/40">— no note —</span>}
                    </div>
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        selectEntry(e.id);
                      }}
                      className="mt-1 text-[10px] font-bold uppercase tracking-widest text-emerald-mid hover:underline"
                    >
                      View details →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    <AuditDetailsDialog entry={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function AuditDetailsDialog({
  entry,
  onClose,
}: {
  entry: LoanAuditEntry | null;
  onClose: () => void;
}) {
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl text-emerald-deep">
            Loan decision details
          </DialogTitle>
          <DialogDescription>
            Immutable audit entry recorded at the moment the decision was written.
          </DialogDescription>
        </DialogHeader>

        {entry && (
          <div className="space-y-5 text-sm">
            <div className="flex items-center justify-between rounded border border-emerald-deep/10 bg-cream/30 px-4 py-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-deep/50">
                  Decision
                </div>
                <div className="mt-1">
                  <StatusPill status={entry.action === "loan.approved" ? "approved" : "rejected"} />
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-deep/50">
                  Timestamp
                </div>
                <div className="tabular mt-1 text-xs text-emerald-deep/80">
                  {new Date(entry.created_at).toLocaleString()}
                </div>
              </div>
            </div>

            <Section title="Loan">
              <Row label="Reference" value={entry.loan_ref ?? "—"} mono onCopy={entry.loan_ref ? () => copy(entry.loan_ref!, "Reference") : undefined} />
              <Row label="Loan ID" value={entry.target ?? "—"} mono onCopy={entry.target ? () => copy(entry.target!, "Loan ID") : undefined} />
              <Row label="Amount" value={entry.amount != null ? formatMoney(entry.amount) : "—"} />
              <Row label="Action code" value={entry.action} mono />
            </Section>

            <Section title="Member">
              <Row label="Full name" value={entry.member_name ?? "—"} />
              <Row label="Member no" value={entry.member_no ?? "—"} mono />
              <Row
                label="Member ID"
                value={entry.member_id ?? "—"}
                mono
                onCopy={entry.member_id ? () => copy(entry.member_id!, "Member ID") : undefined}
              />
            </Section>

            <Section title="Deciding officer">
              <Row label="Email" value={entry.actor_email ?? "—"} />
              <Row label="Role" value={entry.actor_role ?? "—"} uppercase />
              <Row
                label="User ID"
                value={entry.actor_id ?? "—"}
                mono
                onCopy={entry.actor_id ? () => copy(entry.actor_id!, "Officer ID") : undefined}
              />
            </Section>

            <Section title="Justification">
              <div className="whitespace-pre-wrap rounded border border-emerald-deep/10 bg-card px-4 py-3 text-xs text-emerald-deep/80">
                {entry.note ?? <span className="text-emerald-deep/40">— no note recorded —</span>}
              </div>
            </Section>

            <Section title="Audit entry">
              <Row
                label="Entry ID"
                value={entry.id}
                mono
                onCopy={() => copy(entry.id, "Entry ID")}
              />
            </Section>
          </div>
        )}

        <DialogFooter className="flex flex-wrap items-center justify-between gap-2 sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/admin/members"
              onClick={onClose}
              className="rounded border border-emerald-deep/15 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/80 hover:bg-cream/50"
            >
              View member →
            </Link>
            <Link
              to="/admin/loans"
              onClick={onClose}
              className="rounded border border-emerald-deep/15 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/80 hover:bg-cream/50"
            >
              View loan →
            </Link>
            <button
              onClick={() => {
                if (!entry) return;
                const payload = {
                  audit_entry: {
                    id: entry.id,
                    created_at: entry.created_at,
                    action: entry.action,
                    target: entry.target,
                  },
                  decision: entry.action === "loan.approved" ? "approved" : "rejected",
                  officer: {
                    actor_id: entry.actor_id,
                    actor_email: entry.actor_email,
                    actor_role: entry.actor_role,
                  },
                  member: {
                    member_id: entry.member_id,
                    member_no: entry.member_no,
                    member_name: entry.member_name,
                  },
                  loan: {
                    loan_ref: entry.loan_ref,
                    loan_id: entry.target,
                    amount: entry.amount,
                  },
                  meta: {
                    ref: entry.loan_ref,
                    note: entry.note,
                    amount: entry.amount,
                    member_id: entry.member_id,
                  },
                };
                copy(JSON.stringify(payload, null, 2), "Full metadata");
              }}
              className="rounded border border-emerald-deep/15 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/80 hover:bg-cream/50"
            >
              Copy full metadata
            </button>
          </div>
          <button
            onClick={onClose}
            className="rounded border border-emerald-deep/15 px-4 py-2 text-xs font-bold uppercase tracking-widest text-emerald-deep/70 hover:bg-cream/50"
          >
            Close
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-deep/50">
        {title}
      </div>
      <div className="divide-y divide-emerald-deep/5 rounded border border-emerald-deep/10 bg-card">
        {children}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  uppercase,
  onCopy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  uppercase?: boolean;
  onCopy?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5 text-xs">
      <div className="text-emerald-deep/50">{label}</div>
      <div className="flex items-center gap-2">
        <div
          className={[
            "text-right text-emerald-deep/90 break-all",
            mono ? "tabular font-mono" : "",
            uppercase ? "uppercase tracking-widest text-[10px] font-bold" : "",
          ].join(" ")}
        >
          {value}
        </div>
        {onCopy && (
          <button
            onClick={onCopy}
            className="rounded border border-emerald-deep/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-emerald-deep/60 hover:bg-cream/50"
          >
            Copy
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-deep/50">{label}</span>
      {children}
    </label>
  );
}
