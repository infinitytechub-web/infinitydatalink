import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { EmptyState, Money, PageHeader, SectionCard, SectionCardSkeleton, StatusPill } from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";
import { Pagination, SortHeader, type SortState } from "@/components/table-controls";
import { formatMoney } from "@/lib/org-config";
import { getMyTransactions, type TxnRow } from "@/lib/member-data.functions";

const search = z.object({
  page: fallback(z.number().int(), 1).default(1),
  pageSize: fallback(z.number().int(), 10).default(10),
  sortBy: fallback(z.string(), "created_at").default("created_at"),
  sortDir: fallback(z.enum(["asc", "desc"]), "desc").default("desc"),
});

export const Route = createFileRoute("/_member/app/transactions")({
  validateSearch: zodValidator(search),
  component: TxPage,
});

const txQuery = (input: z.infer<typeof search>) =>
  queryOptions({
    queryKey: ["member", "transactions", input],
    queryFn: () => getMyTransactions({ data: input }),
  });

function TxPage() {
  return (
    <>
      <PageHeader
        eyebrow="Member portal"
        title="Transactions"
        description="Search, filter and export your full ledger of deposits, withdrawals and transfers."
      />
      <Suspense fallback={<SectionCardSkeleton title="Your ledger" rows={8} cols={5} />}>
        <TxContent />
      </Suspense>
    </>
  );
}

function TxContent() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data } = useSuspenseQuery(txQuery(s));
  const [q, setQ] = useState("");
  const filtered = data.rows.filter((r: TxnRow) =>
    ((r.note ?? "") + r.ref + (r.channel ?? "") + r.kind).toLowerCase().includes(q.toLowerCase()),
  );
  const sort: SortState = { sortBy: s.sortBy, sortDir: s.sortDir };
  const setSort = (next: SortState) => navigate({ search: (p: any) => ({ ...p, ...next, page: 1 }) });

  return (
    <SectionCard
      title="Ledger"
      action={
        <div className="flex items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search current page…"
            className="rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs outline-none focus:border-emerald-mid"
          />
          <ExportBar
            title="Member Transactions"
            subtitle={`${filtered.length} of ${data.total} entries`}
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
            rows={filtered}
          />
        </div>
      }
    >
      {data.total === 0 ? (
        <div className="p-6"><EmptyState title="No transactions yet" hint="Deposits, repayments and transfers will appear here." /></div>
      ) : (
        <>
          <table className="w-full">
            <thead>
              <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <SortHeader label="Reference" field="ref" sort={sort} onSort={setSort} />
                <th className="px-6 py-3 font-medium">Description</th>
                <th className="px-6 py-3 font-medium">Channel</th>
                <SortHeader label="Date" field="created_at" sort={sort} onSort={setSort} />
                <SortHeader label="Amount" field="amount" sort={sort} onSort={setSort} align="right" />
                <SortHeader label="Status" field="status" sort={sort} onSort={setSort} align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-deep/5">
              {filtered.map((r: TxnRow) => (
                <tr key={r.id} className="hover:bg-cream/30">
                  <td className="tabular px-6 py-4 text-sm font-semibold">{r.ref}</td>
                  <td className="px-6 py-4 text-sm">{r.note ?? r.kind}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{r.channel ?? "—"}</td>
                  <td className="tabular px-6 py-4 text-sm">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className={`px-6 py-4 text-right font-bold ${r.amount < 0 ? "text-destructive" : "text-emerald-mid"}`}>
                    <Money amount={r.amount} signed />
                  </td>
                  <td className="px-6 py-4 text-right"><StatusPill status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={s.page}
            pageSize={s.pageSize}
            total={data.total}
            onPage={(n) => navigate({ search: (p: any) => ({ ...p, page: n }) })}
            onPageSize={(n) => navigate({ search: (p: any) => ({ ...p, pageSize: n, page: 1 }) })}
          />
        </>
      )}
    </SectionCard>
  );
}
