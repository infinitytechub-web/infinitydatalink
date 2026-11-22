import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
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
  listExpenses,
  listExpenseCategories,
  postExpense,
  decideExpense,
  type ExpenseRow,
} from "@/lib/admin-finance.functions";

export const Route = createFileRoute("/_admin/admin/finance/expenses")({
  component: ExpensesPage,
  errorComponent: ({ error }) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const router = useRouter();
    return (
      <div className="p-6">
        <ErrorState
          title="Expenses failed to load"
          message={(error as Error).message}
          onRetry={() => router.invalidate()}
        />
      </div>
    );
  },
});

const expensesQuery = (status: string) =>
  queryOptions({
    queryKey: ["admin", "expenses", status],
    queryFn: () => listExpenses({ data: { status, limit: 100 } }),
  });

const categoriesQuery = queryOptions({
  queryKey: ["admin", "expense-categories"],
  queryFn: () => listExpenseCategories(),
  staleTime: 5 * 60_000,
});

function ExpensesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Expenses"
        description="Post operational expenses, approve, reject and mark as paid. Every action is audited."
      />
      <Suspense fallback={<SectionCardSkeleton title="Expenses" rows={8} cols={6} />}>
        <ExpensesBody />
      </Suspense>
    </>
  );
}

function ExpensesBody() {
  const [status, setStatus] = useState<string>("pending");
  const { data: expenses } = useSuspenseQuery(expensesQuery(status));
  const { data: categories = [] } = useQuery(categoriesQuery);
  const qc = useQueryClient();
  const postFn = useServerFn(postExpense);
  const decideFn = useServerFn(decideExpense);

  const [form, setForm] = useState({ category_code: "", vendor: "", amount: "", notes: "" });

  const post = useMutation({
    mutationFn: () =>
      postFn({
        data: {
          category_code: form.category_code,
          vendor: form.vendor,
          amount: Number(form.amount),
          notes: form.notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Expense posted");
      setForm({ category_code: "", vendor: "", amount: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["admin", "expenses"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed"),
  });

  const decide = useMutation({
    mutationFn: (vars: { id: string; action: "approve" | "reject" | "pay"; reason?: string }) =>
      decideFn({ data: { id: vars.id, action: vars.action, reason: vars.reason ?? null } }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["admin", "expenses"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed"),
  });

  return (
    <div className="space-y-8">
      <SectionCard title="Post new expense">
        <form
          className="grid gap-3 p-6 md:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.category_code || !form.vendor || !form.amount) {
              toast.error("Category, vendor and amount are required");
              return;
            }
            post.mutate();
          }}
        >
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={form.category_code}
            onChange={(e) => setForm({ ...form, category_code: e.target.value })}
          >
            <option value="">Category…</option>
            {categories.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Vendor / payee"
            value={form.vendor}
            onChange={(e) => setForm({ ...form, vendor: e.target.value })}
          />
          <input
            type="number"
            step="0.01"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Amount"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm md:col-span-1"
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <button
            type="submit"
            disabled={post.isPending}
            className="rounded-md bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {post.isPending ? "Posting…" : "Post expense"}
          </button>
        </form>
      </SectionCard>

      <SectionCard
        title="Expense ledger"
        action={
          <select
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="paid">Paid</option>
            <option value="rejected">Rejected</option>
          </select>
        }
      >
        {expenses.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No expenses" hint="Nothing to show for this filter." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 text-left">Ref</th>
                  <th className="px-6 py-3 text-left">Vendor</th>
                  <th className="px-6 py-3 text-left">Category</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                  <th className="px-6 py-3 text-left">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {expenses.map((e: ExpenseRow) => (
                  <tr key={e.id}>
                    <td className="px-6 py-3 font-mono text-xs">{e.ref}</td>
                    <td className="px-6 py-3">{e.vendor}</td>
                    <td className="px-6 py-3 text-muted-foreground">{e.category_code}</td>
                    <td className="px-6 py-3 text-right">
                      <Money amount={Number(e.amount)} />
                    </td>
                    <td className="px-6 py-3">
                      <StatusPill status={e.status as any} />
                    </td>
                    <td className="px-6 py-3 text-right">
                      {e.status === "pending" ? (
                        <div className="flex justify-end gap-1.5">
                          <button
                            className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/20"
                            onClick={() => decide.mutate({ id: e.id, action: "approve" })}
                          >
                            Approve
                          </button>
                          <button
                            className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/20"
                            onClick={() => {
                              const reason = window.prompt("Reason for rejection?");
                              if (!reason) return;
                              decide.mutate({ id: e.id, action: "reject", reason });
                            }}
                          >
                            Reject
                          </button>
                        </div>
                      ) : e.status === "approved" ? (
                        <button
                          className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted"
                          onClick={() => decide.mutate({ id: e.id, action: "pay" })}
                        >
                          Mark paid
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
