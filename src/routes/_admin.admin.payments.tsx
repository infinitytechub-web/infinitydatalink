import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";
import { EmptyState, KPIStat, Money, PageHeader, SectionCard, SectionCardSkeleton, TableSkeleton } from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ExportBar } from "@/components/export-bar";
import { formatMoney } from "@/lib/org-config";
import {
  adminGetPaymentsSummary,
  adminListPendingPayments,
  adminReconcilePayment,
  type AdminPendingPayment,
} from "@/lib/admin-loans.functions";
import { useAuth } from "@/lib/auth";

const KIND_FILTERS = ["all", "deposit", "withdrawal", "loan_repayment"] as const;
type KindFilter = (typeof KIND_FILTERS)[number];

const summaryQuery = queryOptions({
  queryKey: ["admin", "payments", "summary"],
  queryFn: () => adminGetPaymentsSummary(),
  staleTime: 15_000,
});
const pendingQuery = (kind: KindFilter) =>
  queryOptions({
    queryKey: ["admin", "payments", "pending", kind],
    queryFn: () => adminListPendingPayments({ data: { kind, limit: 100 } }),
    staleTime: 10_000,
  });

export const Route = createFileRoute("/_admin/admin/payments")({
  component: AdminPayments,
});

function AdminPayments() {
  const { user, can, hasRole, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  if (!hasRole("super_admin") && !can("payments", "view")) return <Navigate to="/admin" />;
  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Payments reconciliation"
        description="Clear or reject pending savings and loan-repayment transactions across every rail."
      />
      <Suspense fallback={<SectionCardSkeleton title="Reconciliation queue" rows={6} cols={5} />}>
        <Body />
      </Suspense>
    </>
  );
}

function Body() {
  const [kind, setKind] = useState<KindFilter>("all");
  const { data: s } = useSuspenseQuery(summaryQuery);
  return (
    <>
      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat label="Pending total" value={<span className="tabular">{s.pending_count}</span>} accent />
        <KPIStat label="Savings pending" value={<span className="tabular">{s.pending_savings}</span>} hint="Deposits + withdrawals" />
        <KPIStat label="Loan repayments pending" value={<span className="tabular">{s.pending_repayments}</span>} />
        <KPIStat label="Cleared (24h)" value={<Money amount={s.cleared_24h_volume} />} hint={`${s.failed_24h} failed in 24h`} />
      </section>

      <SectionCard
        title="Reconciliation queue"
        action={
          <div className="flex items-center gap-2">
            {KIND_FILTERS.map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={
                  "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition " +
                  (kind === k
                    ? "bg-emerald-deep text-cream"
                    : "border border-emerald-deep/10 text-emerald-deep/60 hover:bg-emerald-deep/5")
                }
              >
                {k === "all" ? "All" : k === "loan_repayment" ? "Loan repay" : k}
              </button>
            ))}
          </div>
        }
      >
        <Suspense fallback={<TableSkeleton rows={5} cols={5} />}>
          <Queue kind={kind} />
        </Suspense>
      </SectionCard>
    </>
  );
}

function Queue({ kind }: { kind: KindFilter }) {
  const { data: rows } = useSuspenseQuery(pendingQuery(kind));
  if (rows.length === 0) {
    return <div className="p-6"><EmptyState title="No pending payments" hint="You're all caught up." /></div>;
  }
  return (
    <>
      <div className="border-b border-emerald-deep/5 px-6 py-3">
        <ExportBar
          permission="export:payments"
          title="Pending Payments"
          subtitle={`${rows.length} rows · filter: ${kind}`}
          filename={`pending_payments_${kind}`}
          columns={[
            { header: "Ref", accessor: (r: AdminPendingPayment) => r.ref },
            { header: "Kind", accessor: (r) => r.kind },
            { header: "Member", accessor: (r) => r.member_name ?? r.user_id },
            { header: "Member no.", accessor: (r) => r.member_no ?? "" },
            { header: "Target", accessor: (r) => r.loan_ref ?? r.plan_name ?? "" },
            { header: "Channel", accessor: (r) => r.channel ?? "" },
            { header: "Amount", accessor: (r) => formatMoney(r.amount), align: "right" },
            { header: "Submitted", accessor: (r) => new Date(r.created_at).toISOString() },
          ]}
          rows={rows}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
              <th className="px-6 py-3 font-medium">Ref</th>
              <th className="px-6 py-3 font-medium">Kind</th>
              <th className="px-6 py-3 font-medium">Member</th>
              <th className="px-6 py-3 font-medium">Target</th>
              <th className="px-6 py-3 font-medium">Channel</th>
              <th className="px-6 py-3 text-right font-medium">Amount</th>
              <th className="px-6 py-3 text-right font-medium">Submitted</th>
              <th className="px-6 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-deep/5">
            {rows.map((r) => (
              <PendingRow key={r.id} row={r} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PendingRow({ row }: { row: AdminPendingPayment }) {
  const { can, hasRole } = useAuth();
  const canDecide = hasRole("super_admin") || can("payments", "approve");
  const qc = useQueryClient();
  const call = useServerFn(adminReconcilePayment);
  const approve = useMutation({
    mutationFn: () => call({ data: { txn_id: row.id, decision: "approve", note: null } }),
    onSuccess: async () => {
      toast.success(`Cleared ${row.ref}`);
      await qc.invalidateQueries({ queryKey: ["admin", "payments"] });
      await qc.invalidateQueries({ queryKey: ["admin", "savings"] });
      await qc.invalidateQueries({ queryKey: ["admin", "loans"] });
    },
    onError: (e: Error) => toast.error(`Approve failed: ${e.message}`),
  });

  const target = row.loan_ref
    ? <Link to="/admin/loans/$loanId" params={{ loanId: row.loan_id ?? "" }} className="hover:underline">{row.loan_ref}</Link>
    : (row.plan_name ?? "—");

  return (
    <tr>
      <td className="px-6 py-3 font-mono text-[11px] text-emerald-deep/70">{row.ref}</td>
      <td className="px-6 py-3 text-sm capitalize">{row.kind.replace("_", " ")}</td>
      <td className="px-6 py-3 text-sm">
        <div className="font-semibold">{row.member_name ?? "Member"}</div>
        <div className="text-[11px] text-emerald-deep/50">{row.member_no ?? row.user_id.slice(0, 8)}</div>
      </td>
      <td className="px-6 py-3 text-sm text-emerald-deep/70">{target}</td>
      <td className="px-6 py-3 text-sm text-emerald-deep/60">{row.channel ?? "—"}</td>
      <td className="px-6 py-3 text-right"><Money amount={row.amount} /></td>
      <td className="px-6 py-3 text-right text-[11px] text-emerald-deep/50">{new Date(row.created_at).toLocaleString()}</td>
      <td className="px-6 py-3 text-right">
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-emerald-mid/40 text-emerald-mid hover:bg-emerald-mid/10"
            onClick={() => approve.mutate()}
            disabled={!canDecide || approve.isPending}
            title={canDecide ? undefined : "payments.approve permission required"}
          >
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
          <RejectDialog row={row} disabled={!canDecide} />
        </div>
      </td>
    </tr>
  );
}

function RejectDialog({ row, disabled }: { row: AdminPendingPayment; disabled?: boolean }) {
  const qc = useQueryClient();
  const call = useServerFn(adminReconcilePayment);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const mut = useMutation({
    mutationFn: () => call({ data: { txn_id: row.id, decision: "reject", note } }),
    onSuccess: async () => {
      toast.success(`Rejected ${row.ref}`);
      setOpen(false);
      setNote("");
      await qc.invalidateQueries({ queryKey: ["admin", "payments"] });
    },
    onError: (e: Error) => toast.error(`Reject failed: ${e.message}`),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled} title={disabled ? "payments.reject permission required" : undefined} className="border-destructive/40 text-destructive hover:bg-destructive/10">
          <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Reject {row.ref}</DialogTitle></DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!note.trim()) return toast.error("A note is required when rejecting.");
            mut.mutate();
          }}
        >
          <p className="text-sm text-emerald-deep/70">
            Marking this payment as failed will not move any balance. The member will see the reason on their transactions page.
          </p>
          <Textarea rows={3} placeholder="Reason for rejection" value={note} onChange={(e) => setNote(e.target.value)} required />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={mut.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {mut.isPending ? "Rejecting…" : "Confirm rejection"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
