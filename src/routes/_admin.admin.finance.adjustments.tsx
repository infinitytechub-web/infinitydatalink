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
} from "@/components/primitives";
import {
  listAdjustments,
  postAdjustment,
  listSavingsForFinance,
  type AdjustmentRow,
} from "@/lib/admin-finance.functions";

export const Route = createFileRoute("/_admin/admin/finance/adjustments")({
  component: AdjustmentsPage,
  errorComponent: ({ error }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <ErrorState title="Adjustments failed to load" message={error.message} onRetry={() => router.invalidate()} />
      </div>
    );
  },
});

const adjustmentsQuery = queryOptions({
  queryKey: ["admin", "adjustments"],
  queryFn: () => listAdjustments({ data: { limit: 100 } }),
});

const accountsQuery = queryOptions({
  queryKey: ["admin", "finance-accounts"],
  queryFn: () => listSavingsForFinance(),
  staleTime: 60_000,
});

function AdjustmentsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Balance Management"
        description="Post credit or debit adjustments to a savings account. Every change is audited with a mandatory reason."
      />
      <Suspense fallback={<SectionCardSkeleton title="Adjustments" rows={8} cols={5} />}>
        <AdjustmentsBody />
      </Suspense>
    </>
  );
}

function AdjustmentsBody() {
  const { data: adjustments } = useSuspenseQuery(adjustmentsQuery);
  const { data: accounts = [] } = useQuery(accountsQuery);
  const qc = useQueryClient();
  const postFn = useServerFn(postAdjustment);

  const [form, setForm] = useState({ account: "", direction: "credit" as "credit" | "debit", amount: "", reason: "" });

  const post = useMutation({
    mutationFn: () =>
      postFn({
        data: {
          savings_account_id: form.account,
          direction: form.direction,
          amount: Number(form.amount),
          reason: form.reason,
        },
      }),
    onSuccess: () => {
      toast.success("Adjustment posted");
      setForm({ account: "", direction: "credit", amount: "", reason: "" });
      qc.invalidateQueries({ queryKey: ["admin", "adjustments"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed"),
  });

  const label = (id: string) => {
    const a = accounts.find((x) => x.id === id);
    return a ? `${a.member_no} · ${a.plan_name ?? "Savings"}` : id.slice(0, 8);
  };

  return (
    <div className="space-y-8">
      <SectionCard title="Post adjustment">
        <form
          className="grid gap-3 p-6 md:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.account || !form.amount || form.reason.trim().length < 3) {
              toast.error("Account, amount and a reason (≥3 chars) are required");
              return;
            }
            post.mutate();
          }}
        >
          <select className="rounded-md border border-border bg-background px-3 py-2 text-sm md:col-span-2" value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })}>
            <option value="">Account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.member_no} · {a.member_name} · {a.plan_name}</option>
            ))}
          </select>
          <select className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as "credit" | "debit" })}>
            <option value="credit">Credit (+)</option>
            <option value="debit">Debit (−)</option>
          </select>
          <input type="number" step="0.01" className="rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <input className="rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="Reason (required)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          <div className="md:col-span-5">
            <button type="submit" disabled={post.isPending} className="rounded-md bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {post.isPending ? "Posting…" : "Post adjustment"}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Adjustment history">
        {adjustments.length === 0 ? (
          <div className="p-6"><EmptyState title="No adjustments yet" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 text-left">Ref</th>
                  <th className="px-6 py-3 text-left">Account</th>
                  <th className="px-6 py-3 text-left">Direction</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                  <th className="px-6 py-3 text-left">Reason</th>
                  <th className="px-6 py-3 text-left">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {adjustments.map((a: AdjustmentRow) => (
                  <tr key={a.id}>
                    <td className="px-6 py-3 font-mono text-xs">{a.ref}</td>
                    <td className="px-6 py-3 text-xs">{label(a.savings_account_id)}</td>
                    <td className="px-6 py-3">
                      <span className={a.direction === "credit" ? "text-primary" : "text-destructive"}>
                        {a.direction === "credit" ? "Credit" : "Debit"}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right"><Money amount={Number(a.amount)} /></td>
                    <td className="px-6 py-3 text-xs">{a.reason}</td>
                    <td className="px-6 py-3 text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</td>
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
