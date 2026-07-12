import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  EmptyState,
  ErrorState,
  Money,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
  StatusPill,
} from "@/components/primitives";
import {
  listTransfers,
  postTransfer,
  clearTransfer,
  rejectTransfer,
  listSavingsForFinance,
  type TransferRow,
} from "@/lib/admin-finance.functions";

export const Route = createFileRoute("/_admin/admin/finance/transfers")({
  component: TransfersPage,
  errorComponent: ({ error }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <ErrorState title="Transfers failed to load" message={error.message} onRetry={() => router.invalidate()} />
      </div>
    );
  },
});

const transfersQuery = (status: string) =>
  queryOptions({
    queryKey: ["admin", "transfers", status],
    queryFn: () => listTransfers({ data: { status, limit: 100 } }),
  });

const accountsQuery = queryOptions({
  queryKey: ["admin", "finance-accounts"],
  queryFn: () => listSavingsForFinance(),
  staleTime: 60_000,
});

function TransfersPage() {
  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Transfers"
        description="Initiate internal transfers between savings accounts and clear pending items."
      />
      <Suspense fallback={<SectionCardSkeleton title="Transfers" rows={8} cols={6} />}>
        <TransfersBody />
      </Suspense>
    </>
  );
}

function TransfersBody() {
  const [status, setStatus] = useState("pending");
  const { data: transfers } = useSuspenseQuery(transfersQuery(status));
  const { data: accounts = [] } = useQuery(accountsQuery);
  const qc = useQueryClient();
  const postFn = useServerFn(postTransfer);
  const clearFn = useServerFn(clearTransfer);
  const rejectFn = useServerFn(rejectTransfer);

  const [form, setForm] = useState({ from: "", to: "", amount: "", note: "" });

  const post = useMutation({
    mutationFn: () =>
      postFn({
        data: {
          from_account_id: form.from,
          to_account_id: form.to,
          amount: Number(form.amount),
          note: form.note || null,
        },
      }),
    onSuccess: () => {
      toast.success("Transfer initiated");
      setForm({ from: "", to: "", amount: "", note: "" });
      qc.invalidateQueries({ queryKey: ["admin", "transfers"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed"),
  });

  const clear = useMutation({
    mutationFn: (id: string) => clearFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Transfer cleared");
      qc.invalidateQueries({ queryKey: ["admin", "transfers"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed"),
  });

  const reject = useMutation({
    mutationFn: (v: { id: string; reason: string }) => rejectFn({ data: v }),
    onSuccess: () => {
      toast.success("Transfer rejected");
      qc.invalidateQueries({ queryKey: ["admin", "transfers"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed"),
  });

  const accountLabel = (id: string) => {
    const a = accounts.find((x) => x.id === id);
    return a ? `${a.member_no ?? "?"} · ${a.plan_name ?? "Savings"}` : id.slice(0, 8);
  };

  return (
    <div className="space-y-8">
      <SectionCard title="Initiate transfer">
        <form
          className="grid gap-3 p-6 md:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.from || !form.to || !form.amount || form.from === form.to) {
              toast.error("Choose two distinct accounts and an amount");
              return;
            }
            post.mutate();
          }}
        >
          <select className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })}>
            <option value="">From account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.member_no} · {a.member_name} · {a.plan_name}</option>
            ))}
          </select>
          <select className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })}>
            <option value="">To account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.member_no} · {a.member_name} · {a.plan_name}</option>
            ))}
          </select>
          <input type="number" step="0.01" className="rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <input className="rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <button type="submit" disabled={post.isPending} className="rounded-md bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {post.isPending ? "Posting…" : "Initiate"}
          </button>
        </form>
      </SectionCard>

      <SectionCard
        title="Transfer ledger"
        action={
          <select className="rounded-md border border-border bg-background px-2 py-1 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="cleared">Cleared</option>
            <option value="failed">Failed</option>
          </select>
        }
      >
        {transfers.length === 0 ? (
          <div className="p-6"><EmptyState title="No transfers" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 text-left">Ref</th>
                  <th className="px-6 py-3 text-left">From</th>
                  <th className="px-6 py-3 text-left">To</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                  <th className="px-6 py-3 text-left">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transfers.map((t: TransferRow) => (
                  <tr key={t.id}>
                    <td className="px-6 py-3 font-mono text-xs">{t.ref}</td>
                    <td className="px-6 py-3 text-xs">{accountLabel(t.from_account_id)}</td>
                    <td className="px-6 py-3 text-xs">{accountLabel(t.to_account_id)}</td>
                    <td className="px-6 py-3 text-right"><Money amount={Number(t.amount)} /></td>
                    <td className="px-6 py-3"><StatusPill status={t.status as any} /></td>
                    <td className="px-6 py-3 text-right">
                      {t.status === "pending" ? (
                        <button
                          className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/20"
                          onClick={() => clear.mutate(t.id)}
                        >
                          Clear
                        </button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
