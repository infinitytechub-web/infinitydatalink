import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { EmptyState, KPIStat, Money, PageHeader, SectionCard, StatusPill } from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";
import { Pagination, SortHeader, type SortState } from "@/components/table-controls";
import { formatMoney } from "@/lib/org-config";
import { getMySavings, type SavingsRow } from "@/lib/member-data.functions";
import { Skeleton } from "@/components/ui/skeleton";

const search = z.object({
  page: fallback(z.number().int(), 1).default(1),
  pageSize: fallback(z.number().int(), 10).default(10),
  sortBy: fallback(z.string(), "created_at").default("created_at"),
  sortDir: fallback(z.enum(["asc", "desc"]), "desc").default("desc"),
});

export const Route = createFileRoute("/_member/app/savings")({
  validateSearch: zodValidator(search),
  component: SavingsPage,
});

const savingsQuery = (input: z.infer<typeof search>) =>
  queryOptions({
    queryKey: ["member", "savings", input],
    queryFn: () => getMySavings({ data: input }),
  });

function SavingsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Member portal"
        title="My Savings"
        description="Contribution schedules, goals and interest tracking across every plan."
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <SavingsContent />
      </Suspense>
    </>
  );
}

function SavingsContent() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data } = useSuspenseQuery(savingsQuery(s));
  const rows = data.rows;
  const totalOnPage = rows.reduce((sum: number, p: SavingsRow) => sum + p.balance, 0);
  const sort: SortState = { sortBy: s.sortBy, sortDir: s.sortDir };
  const setSort = (next: SortState) => navigate({ search: (p: any) => ({ ...p, ...next, page: 1 }) });

  return (
    <>
      <section className="grid gap-6 md:grid-cols-3">
        <KPIStat label="Balance (this page)" value={<>GH₵ <span className="tabular">{formatMoney(totalOnPage).replace("GH₵ ", "")}</span></>} hint={`${rows.length} of ${data.total} plan(s)`} />
        <KPIStat label="Total plans" value={<span className="tabular">{data.total}</span>} hint="Across all pages" />
        <KPIStat label="Page" value={<span className="tabular">{s.page}</span>} accent hint={`Per page ${s.pageSize}`} />
      </section>

      <SectionCard
        title="Contribution schedules"
        action={
          <ExportBar
            title="My Savings Contributions"
            subtitle={`${rows.length} rows (page ${s.page})`}
            filename="my_savings"
            permission="export:own_savings"
            columns={[
              { header: "Plan", accessor: (p: SavingsRow) => p.name },
              { header: "Schedule", accessor: (p) => p.schedule },
              { header: "Interest rate", accessor: (p) => `${p.interest_rate}%`, align: "right" },
              { header: "Balance", accessor: (p) => formatMoney(p.balance), align: "right" },
            ]}
            rows={rows}
          />
        }
      >
        {data.total === 0 ? (
          <div className="p-6"><EmptyState title="No savings plans yet" hint="Enroll in a plan to start contributing." /></div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
                  <th className="px-6 py-3 font-medium">Plan</th>
                  <th className="px-6 py-3 font-medium">Schedule</th>
                  <th className="px-6 py-3 text-right font-medium">Rate</th>
                  <SortHeader label="Balance" field="balance" sort={sort} onSort={setSort} align="right" />
                  <SortHeader label="Added" field="created_at" sort={sort} onSort={setSort} align="right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-deep/5">
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="px-6 py-4 text-sm font-semibold">{p.name}</td>
                    <td className="px-6 py-4 text-sm text-emerald-deep/60">{p.schedule}</td>
                    <td className="tabular px-6 py-4 text-right text-sm">{p.interest_rate}%</td>
                    <td className="px-6 py-4 text-right"><Money amount={p.balance} /></td>
                    <td className="px-6 py-4 text-right"><StatusPill status="active" /></td>
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
    </>
  );
}
