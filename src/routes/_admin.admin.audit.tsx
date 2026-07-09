import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { EmptyState, PageHeader, SectionCard, StatusPill } from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";
import { Pagination } from "@/components/table-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/org-config";
import { listLoanAudit, type LoanAuditEntry } from "@/lib/admin-loans.functions";

const search = z.object({
  decision: fallback(z.enum(["approved", "rejected", "all"]), "all").default("all"),
  member: fallback(z.string(), "").default(""),
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
  page: fallback(z.number().int(), 1).default(1),
  pageSize: fallback(z.number().int(), 25).default(25),
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
    navigate({ search: (prev) => ({ ...prev, ...patch, page: patch.page ?? 1 }) });

  const rows = data.rows;

  return (
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
              navigate({ search: { decision: "all", member: "", from: "", to: "", page: 1, pageSize: s.pageSize } })
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
                <tr key={e.id} className="align-top">
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
                    {e.note ?? <span className="text-emerald-deep/40">— no note —</span>}
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
