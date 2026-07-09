import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KPIStat, Money, PageHeader, SectionCard, StatusPill, EmptyState } from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";
import { formatMoney } from "@/lib/org-config";
import { listAdminLoans, decideLoan, type AdminLoanRow } from "@/lib/admin-loans.functions";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_admin/admin/loans")({
  component: AdminLoans,
});

const loansQuery = (status?: string) =>
  queryOptions({
    queryKey: ["admin", "loans", status ?? "all"],
    queryFn: () => listAdminLoans({ data: { limit: 100, status } }),
  });

function AdminLoans() {
  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Loans & Approvals"
        description="Portfolio health, multi-level approval workflow and default prediction."
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <AdminLoansContent />
      </Suspense>
    </>
  );
}

function AdminLoansContent() {
  const [filter, setFilter] = useState<string>("pending");
  const { data: loans } = useSuspenseQuery(loansQuery(filter === "all" ? undefined : filter));

  const pending = loans.filter((l) => l.status === "pending").length;
  const approved = loans.filter((l) => l.status === "approved" || l.status === "active").length;
  const portfolio = loans
    .filter((l) => l.status === "approved" || l.status === "active")
    .reduce((s, l) => s + l.amount, 0);

  return (
    <>
      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat label="Portfolio" value={<>GH₵ <span className="tabular">{formatMoney(portfolio).replace("GH₵ ", "")}</span></>} />
        <KPIStat label="Awaiting approval" value={<span className="tabular">{pending}</span>} accent />
        <KPIStat label="Approved / active" value={<span className="tabular">{approved}</span>} />
        <KPIStat label="Total in view" value={<span className="tabular">{loans.length}</span>} />
      </section>

      <SectionCard
        title="Approval pipeline"
        action={
          <div className="flex items-center gap-3">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs outline-none focus:border-emerald-mid"
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
              <option value="all">All</option>
            </select>
            <ExportBar
              permission="export:loans"
              title="Loan Approval Pipeline"
              subtitle={`${loans.length} applications`}
              filename="loans_pipeline"
              columns={[
                { header: "Ref", accessor: (l: AdminLoanRow) => l.ref },
                { header: "Member", accessor: (l) => l.member_name ?? l.user_id },
                { header: "Member No", accessor: (l) => l.member_no ?? "—" },
                { header: "Product", accessor: (l) => l.product },
                { header: "Amount", accessor: (l) => formatMoney(l.amount), align: "right" },
                { header: "Term", accessor: (l) => `${l.term_months} mo`, align: "right" },
                { header: "Status", accessor: (l) => l.status.toUpperCase(), align: "right" },
              ]}
              rows={loans}
            />
          </div>
        }
      >
        {loans.length === 0 ? (
          <div className="p-6"><EmptyState title="Nothing to show" hint="No loans in this filter." /></div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
                <th className="px-6 py-3 font-medium">Ref</th>
                <th className="px-6 py-3 font-medium">Member</th>
                <th className="px-6 py-3 font-medium">Product</th>
                <th className="px-6 py-3 text-right font-medium">Amount</th>
                <th className="px-6 py-3 text-right font-medium">Term</th>
                <th className="px-6 py-3 text-right font-medium">Status</th>
                <th className="px-6 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-deep/5">
              {loans.map((l) => (
                <LoanRow key={l.id} loan={l} filter={filter} />
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </>
  );
}

function LoanRow({ loan, filter }: { loan: AdminLoanRow; filter: string }) {
  const qc = useQueryClient();
  const decide = useServerFn(decideLoan);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const mutation = useMutation({
    mutationFn: (decision: "approved" | "rejected") =>
      decide({ data: { loan_id: loan.id, decision, note: note.trim() || undefined } }),
    onSuccess: (updated) => {
      toast.success(`Loan ${updated.status}`, { description: `Reference ${updated.ref}` });
      qc.invalidateQueries({ queryKey: ["admin", "loans"] });
      setShowNote(false);
      setNote("");
    },
    onError: (err: Error) => toast.error("Decision failed", { description: err.message }),
  });

  return (
    <>
      <tr>
        <td className="tabular px-6 py-4 text-sm font-semibold">{loan.ref}</td>
        <td className="px-6 py-4 text-sm">
          <div className="font-medium">{loan.member_name ?? "—"}</div>
          <div className="tabular text-[11px] text-emerald-deep/50">{loan.member_no ?? loan.user_id.slice(0, 8)}</div>
        </td>
        <td className="px-6 py-4 text-sm text-emerald-deep/60">{loan.product}</td>
        <td className="px-6 py-4 text-right"><Money amount={loan.amount} /></td>
        <td className="tabular px-6 py-4 text-right text-sm">{loan.term_months} mo</td>
        <td className="px-6 py-4 text-right"><StatusPill status={loan.status} /></td>
        <td className="px-6 py-4 text-right">
          {loan.status === "pending" ? (
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNote((v) => !v)}
                className="rounded border border-emerald-deep/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/70 hover:bg-cream/50"
              >
                Note
              </button>
              <button
                disabled={mutation.isPending}
                onClick={() => mutation.mutate("rejected")}
                className="rounded bg-destructive/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-destructive hover:bg-destructive/20 disabled:opacity-50"
              >
                Reject
              </button>
              <button
                disabled={mutation.isPending}
                onClick={() => mutation.mutate("approved")}
                className="rounded bg-emerald-deep px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-cream hover:bg-emerald-mid disabled:opacity-50"
              >
                Approve
              </button>
            </div>
          ) : (
            <span className="text-[10px] uppercase tracking-widest text-emerald-deep/40">
              {loan.decided_at ? new Date(loan.decided_at).toLocaleDateString() : "—"}
            </span>
          )}
        </td>
      </tr>
      {showNote && loan.status === "pending" && (
        <tr>
          <td colSpan={7} className="bg-cream/30 px-6 py-3">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Decision note (optional, recorded in audit log)"
              className="w-full rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs outline-none focus:border-emerald-mid"
            />
          </td>
        </tr>
      )}
    </>
  );
}
