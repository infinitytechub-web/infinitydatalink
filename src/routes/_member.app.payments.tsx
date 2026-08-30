import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { EmptyState, Money, PageHeader, SectionCard, StatusPill } from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { getMyLoans, getMyTransactions } from "@/lib/member-data.functions";
import { PayNowPanel } from "@/components/pay-now-panel";

export const Route = createFileRoute("/_member/app/payments")({
  component: PaymentsPage,
});

const activeLoansQuery = queryOptions({
  queryKey: ["member", "loans", "active"],
  queryFn: () => getMyLoans({ data: { page: 1, pageSize: 20, sortBy: "created_at", sortDir: "desc" } }),
});
const recentTxnsQuery = queryOptions({
  queryKey: ["member", "transactions", "recent"],
  queryFn: () => getMyTransactions({ data: { page: 1, pageSize: 8, sortBy: "created_at", sortDir: "desc" } }),
});

function PaymentsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Member portal"
        title="Payments"
        description="Repay active loans, top up savings, and track every transaction across every rail."
      />

      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <PayNowPanel />
      </Suspense>


      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <ActiveLoansPanel />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <RecentTransactionsPanel />
      </Suspense>
    </>
  );
}

function ActiveLoansPanel() {
  const { data } = useSuspenseQuery(activeLoansQuery);
  const active = data.rows.filter((l) => l.status === "active");
  return (
    <SectionCard title="Repay a loan">
      {active.length === 0 ? (
        <div className="p-6"><EmptyState title="No active loans" hint="You'll see repayment options here once a loan is disbursed." /></div>
      ) : (
        <div className="divide-y divide-emerald-deep/5">
          {active.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <div className="text-sm font-semibold">{l.ref} · {l.product}</div>
                <div className="text-[11px] text-muted-foreground">
                  Outstanding <Money amount={l.outstanding_principal} /> · Monthly {l.monthly_payment != null ? <Money amount={l.monthly_payment} /> : "—"}
                </div>
              </div>
              <Link
                to="/app/loans/$loanId"
                params={{ loanId: l.id }}
                className="rounded bg-emerald-deep px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-cream hover:bg-emerald-mid"
              >
                Make repayment
              </Link>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function RecentTransactionsPanel() {
  const { data } = useSuspenseQuery(recentTxnsQuery);
  return (
    <SectionCard title="Recent transactions" action={<Link to="/app/transactions" className="text-[11px] font-semibold uppercase tracking-widest text-emerald-mid hover:underline">View all →</Link>}>
      {data.rows.length === 0 ? (
        <div className="p-6"><EmptyState title="No transactions yet" hint="Submitted payments appear here." /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-6 py-3 font-medium">Ref</th>
                <th className="px-6 py-3 font-medium">Kind</th>
                <th className="px-6 py-3 font-medium">Channel</th>
                <th className="px-6 py-3 text-right font-medium">Amount</th>
                <th className="px-6 py-3 text-right font-medium">Status</th>
                <th className="px-6 py-3 text-right font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-deep/5">
              {data.rows.map((t) => (
                <tr key={t.id}>
                  <td className="px-6 py-3 font-mono text-[11px] text-muted-foreground">{t.ref}</td>
                  <td className="px-6 py-3 text-sm capitalize">{t.kind.replace("_", " ")}</td>
                  <td className="px-6 py-3 text-[11px] text-muted-foreground">{t.channel ?? "—"}</td>
                  <td className="px-6 py-3 text-right"><Money amount={t.amount} /></td>
                  <td className="px-6 py-3 text-right"><StatusPill status={t.status as any} /></td>
                  <td className="px-6 py-3 text-right text-[11px] text-muted-foreground">{new Date(t.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
