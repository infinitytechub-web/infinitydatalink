import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { EmptyState, Money, SectionCard } from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import {
  adminReconcilePayment,
  getLoanRepaymentBook,
  type RepaymentBookRow,
} from "@/lib/admin-loans.functions";

type SortKey = "overdue" | "balance" | "next_due" | "ref";
const PAGE = 10;

export function RepaymentBook() {
  const qc = useQueryClient();
  const fetchBook = useServerFn(getLoanRepaymentBook);
  const reconcile = useServerFn(adminReconcilePayment);
  const book = useQuery({
    queryKey: ["admin", "loan-repayment-book"],
    queryFn: () => fetchBook(),
    refetchInterval: 30_000,
  });
  const [filter, setFilter] = useState<"all" | "overdue" | "pending">("all");
  const [sort, setSort] = useState<SortKey>("overdue");
  const [page, setPage] = useState(0);

  const confirm = useMutation({
    mutationFn: (txnId: string) =>
      reconcile({ data: { txn_id: txnId, decision: "approve", note: "Confirmed from loan dashboard" } }),
    onSuccess: () => {
      toast.success("Repayment confirmed", { description: "The member's ledger has been updated." });
      qc.invalidateQueries({ queryKey: ["admin", "loan-repayment-book"] });
    },
    onError: (e: Error) => toast.error("Could not confirm", { description: e.message }),
  });

  const rows = useMemo(() => {
    let r: RepaymentBookRow[] = book.data ?? [];
    if (filter === "overdue") r = r.filter((x) => x.installments_overdue > 0);
    if (filter === "pending") r = r.filter((x) => x.pending.length > 0);
    const sorted = [...r].sort((a, b) => {
      if (sort === "overdue") return b.installments_overdue - a.installments_overdue;
      if (sort === "balance") return b.balance_due - a.balance_due;
      if (sort === "next_due") return (a.next_due_date ?? "9999").localeCompare(b.next_due_date ?? "9999");
      return a.ref.localeCompare(b.ref);
    });
    return sorted;
  }, [book.data, filter, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE, current * PAGE + PAGE);

  const ctl =
    "rounded border border-emerald-deep/15 bg-card px-2 py-1 text-xs outline-none focus:border-emerald-mid";

  return (
    <SectionCard
      title="Repayments"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter repayments"
            className={ctl}
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value as typeof filter);
              setPage(0);
            }}
          >
            <option value="all">All loans</option>
            <option value="overdue">Overdue only</option>
            <option value="pending">Awaiting confirmation</option>
          </select>
          <select
            aria-label="Sort repayments"
            className={ctl}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="overdue">Most overdue</option>
            <option value="balance">Highest balance</option>
            <option value="next_due">Next due date</option>
            <option value="ref">Loan ref</option>
          </select>
        </div>
      }
    >
      {book.isLoading ? (
        <div className="space-y-2 p-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : book.error ? (
        <div className="p-6 text-sm text-destructive">{(book.error as Error).message}</div>
      ) : rows.length === 0 ? (
        <div className="p-6">
          <EmptyState title="Nothing to show" hint="Disbursed loans and their installments appear here." />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Loan</th>
                  <th className="px-6 py-3 font-medium">Member</th>
                  <th className="px-6 py-3 text-right font-medium">Paid</th>
                  <th className="px-6 py-3 text-right font-medium">Overdue</th>
                  <th className="px-6 py-3 text-right font-medium">Remaining</th>
                  <th className="px-6 py-3 text-right font-medium">Amount paid</th>
                  <th className="px-6 py-3 text-right font-medium">Balance</th>
                  <th className="px-6 py-3 text-right font-medium">Next due</th>
                  <th className="px-6 py-3 text-right font-medium">Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-deep/5">
                {visible.map((r) => (
                  <tr key={r.loan_id}>
                    <td className="px-6 py-4 text-sm">
                      <Link
                        to="/admin/loans/$loanId"
                        params={{ loanId: r.loan_id }}
                        className="tabular font-semibold hover:underline"
                      >
                        {r.ref}
                      </Link>
                      <div className="text-[11px] text-muted-foreground">{r.product}</div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="font-medium">{r.member_name ?? "—"}</div>
                      <div className="tabular text-[11px] text-muted-foreground">{r.member_no ?? ""}</div>
                    </td>
                    <td className="tabular px-6 py-4 text-right text-sm">
                      {r.installments_paid}/{r.installments_total}
                    </td>
                    <td
                      className={`tabular px-6 py-4 text-right text-sm ${r.installments_overdue > 0 ? "font-semibold text-destructive" : ""}`}
                    >
                      {r.installments_overdue}
                    </td>
                    <td className="tabular px-6 py-4 text-right text-sm">{r.installments_remaining}</td>
                    <td className="px-6 py-4 text-right">
                      <Money amount={r.amount_paid} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Money amount={r.balance_due} />
                    </td>
                    <td className="tabular px-6 py-4 text-right text-xs text-muted-foreground">
                      {r.next_due_date ?? "—"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {r.pending.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          {r.pending.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => confirm.mutate(p.id)}
                              disabled={confirm.isPending}
                              className="rounded bg-emerald-deep px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-cream hover:bg-emerald-mid disabled:opacity-50"
                            >
                              Confirm GH₵ {p.amount.toFixed(2)}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border px-6 py-3 text-xs text-muted-foreground">
            <span>
              {rows.length} loan{rows.length === 1 ? "" : "s"} · page {current + 1} of {pages}
            </span>
            <div className="flex gap-2">
              <button className={ctl} disabled={current === 0} onClick={() => setPage(current - 1)}>
                Previous
              </button>
              <button className={ctl} disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </SectionCard>
  );
}
