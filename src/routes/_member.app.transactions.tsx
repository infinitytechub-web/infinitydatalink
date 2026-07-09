import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { EmptyState, Money, PageHeader, SectionCard, StatusPill } from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";
import { formatMoney } from "@/lib/org-config";
import { getMyTransactions, type TxnRow } from "@/lib/member-data.functions";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_member/app/transactions")({
  component: TxPage,
});

const txQuery = queryOptions({
  queryKey: ["member", "transactions"],
  queryFn: () => getMyTransactions(),
});

function TxPage() {
  return (
    <>
      <PageHeader
        eyebrow="Member portal"
        title="Transactions"
        description="Search, filter and export your full ledger of deposits, withdrawals and transfers."
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <TxContent />
      </Suspense>
    </>
  );
}

function TxContent() {
  const { data: all } = useSuspenseQuery(txQuery);
  const [q, setQ] = useState("");
  const rows = all.filter((r) =>
    ((r.note ?? "") + r.ref + (r.channel ?? "") + r.kind).toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <SectionCard
      title="Ledger"
      action={
        <div className="flex items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search transactions…"
            className="rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs outline-none focus:border-emerald-mid"
          />
          <ExportBar
            title="Member Transactions"
            subtitle={`${rows.length} of ${all.length} entries`}
            filename="my_transactions"
            permission="export:own_transactions"
            columns={[
              { header: "Reference", accessor: (r: TxnRow) => r.ref },
              { header: "Description", accessor: (r) => r.note ?? r.kind },
              { header: "Channel", accessor: (r) => r.channel ?? "—" },
              { header: "Date", accessor: (r) => new Date(r.created_at).toLocaleDateString() },
              { header: "Amount", accessor: (r) => formatMoney(r.amount), align: "right" },
              { header: "Status", accessor: (r) => r.status.toUpperCase(), align: "right" },
            ]}
            rows={rows}
          />
        </div>
      }
    >
      {all.length === 0 ? (
        <div className="p-6"><EmptyState title="No transactions yet" hint="Deposits, repayments and transfers will appear here." /></div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
              <th className="px-6 py-3 font-medium">Reference</th>
              <th className="px-6 py-3 font-medium">Description</th>
              <th className="px-6 py-3 font-medium">Channel</th>
              <th className="px-6 py-3 font-medium">Date</th>
              <th className="px-6 py-3 text-right font-medium">Amount</th>
              <th className="px-6 py-3 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-deep/5">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-cream/30">
                <td className="tabular px-6 py-4 text-sm font-semibold">{r.ref}</td>
                <td className="px-6 py-4 text-sm">{r.note ?? r.kind}</td>
                <td className="px-6 py-4 text-sm text-emerald-deep/60">{r.channel ?? "—"}</td>
                <td className="tabular px-6 py-4 text-sm">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className={`px-6 py-4 text-right font-bold ${r.amount < 0 ? "text-destructive" : "text-emerald-mid"}`}>
                  <Money amount={r.amount} signed />
                </td>
                <td className="px-6 py-4 text-right"><StatusPill status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionCard>
  );
}
