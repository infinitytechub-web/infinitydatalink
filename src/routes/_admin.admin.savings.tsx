import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { useSuspenseQuery, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, PlayCircle, Scale, Settings, XCircle } from "lucide-react";
import { ErrorState, KPIStat, Money, PageHeader, SectionCard, SectionCardSkeleton } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ExportBar } from "@/components/export-bar";
import { formatMoney } from "@/lib/org-config";
import {
  adminListPendingTransactions,
  adminListSavingsSummary,
  adminSettleTransaction,
  type AdminPendingTxn,
} from "@/lib/savings.functions";
import { adminRunMonthlyAccrual } from "@/lib/savings-sweeps.functions";

const summaryQuery = queryOptions({
  queryKey: ["admin", "savings", "summary"],
  queryFn: () => adminListSavingsSummary(),
  staleTime: 30_000,
});
const pendingQuery = queryOptions({
  queryKey: ["admin", "savings", "pending"],
  queryFn: () => adminListPendingTransactions({ data: { kind: "all", limit: 25 } }),
  staleTime: 15_000,
});

export const Route = createFileRoute("/_admin/admin/savings")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(summaryQuery),
      context.queryClient.ensureQueryData(pendingQuery),
    ]);
  },
  component: AdminSavings,
  errorComponent: ({ error }) => (
    <div className="p-6"><ErrorState title="Failed to load savings" message={error.message} /></div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm text-emerald-deep/70">Not found.</div>,
});

function AdminSavings() {
  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Savings"
        description="Institution-wide savings positions, plans and pending settlements."
        action={
          <div className="flex items-center gap-2">
            <AccrualDialog />
            <Link
              to="/admin/savings/reconciliation"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted"
            >
              <Scale className="h-3.5 w-3.5" /> Reconciliation
            </Link>
            <Link
              to="/admin/savings/plans"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted"
            >
              <Settings className="h-3.5 w-3.5" /> Manage plans
            </Link>
          </div>
        }
      />
      <Suspense fallback={<SectionCardSkeleton title="Savings positions" rows={6} cols={5} />}>
        <Body />
      </Suspense>
    </>
  );
}

function Body() {
  const { data: s } = useSuspenseQuery(summaryQuery);
  return (
    <>
      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat label="Total balances" value={<Money amount={s.total_balance} />} hint={`${s.active_accounts} active accounts`} />
        <KPIStat label="Active plans" value={<span className="tabular">{s.active_plans}</span>} />
        <KPIStat label="Pending settlements" value={<span className="tabular">{s.pending_count}</span>} accent hint="Awaiting finance review" />
        <KPIStat label="Failed (24h)" value={<span className="tabular">{s.failed_24h}</span>} accent />
      </section>

      <SectionCard
        title="Plan breakdown"
        action={
          <ExportBar
            permission="export:savings"
            title="Savings Plan Breakdown"
            subtitle={`${s.plans.length} plans`}
            filename="savings_plans"
            columns={[
              { header: "Plan", accessor: (p: (typeof s.plans)[number]) => p.name },
              { header: "Schedule", accessor: (p) => p.schedule },
              { header: "Rate", accessor: (p) => `${p.interest_rate}%`, align: "right" },
              { header: "Members", accessor: (p) => p.members, align: "right" },
              { header: "Balance", accessor: (p) => formatMoney(p.balance), align: "right" },
            ]}
            rows={s.plans}
          />
        }
      >
        <table className="w-full">
          <thead>
            <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
              <th className="px-6 py-3 font-medium">Plan</th>
              <th className="px-6 py-3 font-medium">Schedule</th>
              <th className="px-6 py-3 text-right font-medium">Rate</th>
              <th className="px-6 py-3 text-right font-medium">Members</th>
              <th className="px-6 py-3 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-deep/5">
            {s.plans.map((p) => (
              <tr key={p.id}>
                <td className="px-6 py-3 text-sm font-semibold">{p.name}</td>
                <td className="px-6 py-3 text-sm text-emerald-deep/60">{p.schedule}</td>
                <td className="tabular px-6 py-3 text-right text-sm">{p.interest_rate}%</td>
                <td className="tabular px-6 py-3 text-right text-sm">{p.members}</td>
                <td className="px-6 py-3 text-right"><Money amount={p.balance} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      <PendingQueue />
    </>
  );
}

function PendingQueue() {
  const { data: rows } = useSuspenseQuery(pendingQuery);
  if (rows.length === 0) {
    return (
      <SectionCard title="Pending settlements">
        <div className="p-6 text-sm text-emerald-deep/60">No pending transactions — you're all caught up.</div>
      </SectionCard>
    );
  }
  return (
    <SectionCard title="Pending settlements" action={<span className="text-[11px] text-emerald-deep/50">Oldest first · top 25</span>}>
      <table className="w-full">
        <thead>
          <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
            <th className="px-6 py-3 font-medium">Ref</th>
            <th className="px-6 py-3 font-medium">Member</th>
            <th className="px-6 py-3 font-medium">Plan</th>
            <th className="px-6 py-3 font-medium">Kind</th>
            <th className="px-6 py-3 font-medium">Channel</th>
            <th className="px-6 py-3 text-right font-medium">Amount</th>
            <th className="px-6 py-3 text-right font-medium">Submitted</th>
            <th className="px-6 py-3 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-emerald-deep/5">
          {rows.map((t) => (
            <PendingRow key={t.id} t={t} />
          ))}
        </tbody>
      </table>
    </SectionCard>
  );
}

function PendingRow({ t }: { t: AdminPendingTxn }) {
  const qc = useQueryClient();
  const call = useServerFn(adminSettleTransaction);
  const approve = useMutation({
    mutationFn: () => call({ data: { txn_id: t.id, status: "cleared", note: null } }),
    onSuccess: async () => {
      toast.success(`Cleared ${t.ref}`);
      await qc.invalidateQueries({ queryKey: ["admin", "savings"] });
    },
    onError: (e: Error) => toast.error(`Settle failed: ${e.message}`),
  });
  return (
    <tr>
      <td className="px-6 py-3 font-mono text-[11px] text-emerald-deep/70">{t.ref}</td>
      <td className="px-6 py-3 text-sm">
        <div className="font-semibold">{t.member_name ?? "Member"}</div>
        <div className="text-[11px] text-emerald-deep/50">{t.member_no ?? t.user_id.slice(0, 8)}</div>
      </td>
      <td className="px-6 py-3 text-sm text-emerald-deep/70">{t.plan_name ?? "—"}</td>
      <td className="px-6 py-3 text-sm capitalize">{t.kind}</td>
      <td className="px-6 py-3 text-sm text-emerald-deep/60">{t.channel ?? "—"}</td>
      <td className="px-6 py-3 text-right"><Money amount={t.amount} /></td>
      <td className="px-6 py-3 text-right text-[11px] text-emerald-deep/50">{new Date(t.created_at).toLocaleString()}</td>
      <td className="px-6 py-3 text-right">
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-emerald-mid/40 text-emerald-mid hover:bg-emerald-mid/10"
            onClick={() => approve.mutate()}
            disabled={approve.isPending}
          >
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
          <RejectDialog txn={t} />
        </div>
      </td>
    </tr>
  );
}

function RejectDialog({ txn }: { txn: AdminPendingTxn }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const qc = useQueryClient();
  const call = useServerFn(adminSettleTransaction);
  const mut = useMutation({
    mutationFn: () => call({ data: { txn_id: txn.id, status: "failed", note } }),
    onSuccess: async () => {
      toast.success(`Rejected ${txn.ref}`);
      setOpen(false);
      setNote("");
      await qc.invalidateQueries({ queryKey: ["admin", "savings"] });
    },
    onError: (e: Error) => toast.error(`Reject failed: ${e.message}`),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10">
          <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Reject {txn.ref}</DialogTitle></DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!note.trim()) return toast.error("A note is required when rejecting.");
            mut.mutate();
          }}
        >
          <p className="text-sm text-emerald-deep/70">
            Marking as failed will not move any balance. The member will see the rejection reason on their savings page.
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

function AccrualDialog() {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const qc = useQueryClient();
  const call = useServerFn(adminRunMonthlyAccrual);
  const mut = useMutation({
    mutationFn: () => call({ data: { note, period_end: periodEnd || null } }),
    onSuccess: async (r) => {
      toast.success(`Accrued interest across ${r.accounts} accounts (${formatMoney(r.total_interest)})`);
      setOpen(false);
      setNote("");
      setPeriodEnd("");
      await qc.invalidateQueries({ queryKey: ["admin", "savings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <PlayCircle className="h-3.5 w-3.5" /> Run interest accrual
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Run monthly interest accrual</DialogTitle></DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!note.trim() || note.trim().length < 3) return toast.error("Provide a note (≥3 chars) for the audit trail.");
            mut.mutate();
          }}
        >
          <p className="text-xs text-muted-foreground">
            Runs the accrual for the given period end date (defaults to end of last month). Idempotent per (account, period).
          </p>
          <div>
            <label className="text-[11px] uppercase tracking-widest text-muted-foreground">Period end (optional)</label>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-widest text-muted-foreground">Audit note</label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} required />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={mut.isPending}>{mut.isPending ? "Running…" : "Run accrual"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
