import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import {
  EmptyState,
  KPIStat,
  Money,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
  StatusPill,
} from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";
import { Pagination, SortHeader, type SortState } from "@/components/table-controls";
import { formatMoney } from "@/lib/org-config";
import { getMyLoans, type LoanRow } from "@/lib/member-data.functions";
import { LoanApplicationDialog } from "@/components/loan-application-dialog";

const search = z.object({
  page: fallback(z.number().int(), 1).default(1),
  pageSize: fallback(z.number().int(), 10).default(10),
  sortBy: fallback(z.string(), "created_at").default("created_at"),
  sortDir: fallback(z.enum(["asc", "desc"]), "desc").default("desc"),
});

export const Route = createFileRoute("/_member/app/loans")({
  validateSearch: zodValidator(search),
  component: LoansPage,
});

const loansQuery = (input: z.infer<typeof search>) =>
  queryOptions({
    queryKey: ["member", "loans", input],
    queryFn: () => getMyLoans({ data: input }),
  });

function LoansPage() {
  return (
    <>
      <PageHeader
        eyebrow="Member portal"
        title="Active Loans"
        description="Application, guarantors, repayment schedule and outstanding balances."
        action={
          <LoanApplicationDialog
            trigger={
              <button className="rounded bg-emerald-deep px-4 py-2 text-xs font-bold uppercase tracking-widest text-cream hover:bg-emerald-mid">
                Apply for a loan
              </button>
            }
          />
        }
      />
      <Suspense fallback={<SectionCardSkeleton title="Your loans" rows={5} cols={5} />}>
        <LoansContent />
      </Suspense>
    </>
  );
}

function LoansContent() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data } = useSuspenseQuery(loansQuery(s));
  const rows = data.rows;
  const sort: SortState = { sortBy: s.sortBy, sortDir: s.sortDir };
  const setSort = (next: SortState) =>
    navigate({ search: (p: any) => ({ ...p, ...next, page: 1 }) });
  const activeOnPage = rows.filter(
    (l: LoanRow) => l.status === "active" || l.status === "approved",
  );
  const activeBalance = activeOnPage.reduce((sum: number, l: LoanRow) => sum + l.amount, 0);
  const pendingOnPage = rows.filter((l: LoanRow) => l.status === "pending").length;

  return (
    <>
      <section className="grid gap-6 md:grid-cols-3">
        <KPIStat
          label="Active balance (page)"
          value={
            <>
              GH₵ <span className="tabular">{formatMoney(activeBalance).replace("GH₵ ", "")}</span>
            </>
          }
          hint={`${activeOnPage.length} active on this page`}
        />
        <KPIStat
          label="Pending (page)"
          value={<span className="tabular">{pendingOnPage}</span>}
          hint="Awaiting approval"
        />
        <KPIStat
          label="Total facilities"
          value={<span className="tabular">{data.total}</span>}
          accent
          hint="Across all pages"
        />
      </section>

      <SectionCard
        title="Loan facilities"
        action={
          <ExportBar
            title="My Loan Facilities"
            subtitle={`${rows.length} rows (page ${s.page})`}
            filename="my_loans"
            permission="export:own_loans"
            columns={[
              { header: "Reference", accessor: (l: LoanRow) => l.ref },
              { header: "Product", accessor: (l) => l.product },
              { header: "Principal", accessor: (l) => formatMoney(l.amount), align: "right" },
              { header: "Term", accessor: (l) => `${l.term_months} mo`, align: "right" },
              { header: "Rate", accessor: (l) => `${l.interest_rate}%`, align: "right" },
              { header: "Status", accessor: (l) => l.status.toUpperCase(), align: "right" },
            ]}
            rows={rows}
          />
        }
      >
        {data.total === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No loan applications yet"
              hint="Use “Apply for a loan” to submit your first application."
            />
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                  <SortHeader label="Reference" field="ref" sort={sort} onSort={setSort} />
                  <th className="px-6 py-3 font-medium">Product</th>
                  <SortHeader
                    label="Principal"
                    field="amount"
                    sort={sort}
                    onSort={setSort}
                    align="right"
                  />
                  <SortHeader
                    label="Term"
                    field="term_months"
                    sort={sort}
                    onSort={setSort}
                    align="right"
                  />
                  <th className="px-6 py-3 text-right font-medium">Rate</th>
                  <SortHeader
                    label="Status"
                    field="status"
                    sort={sort}
                    onSort={setSort}
                    align="right"
                  />
                  <th className="px-6 py-3 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-deep/5">
                {rows.map((l: LoanRow) => (
                  <tr key={l.id}>
                    <td className="tabular px-6 py-4 text-sm font-semibold">{l.ref}</td>
                    <td className="px-6 py-4 text-sm">{l.product}</td>
                    <td className="px-6 py-4 text-right">
                      <Money amount={l.amount} />
                    </td>
                    <td className="tabular px-6 py-4 text-right text-sm">{l.term_months} mo</td>
                    <td className="tabular px-6 py-4 text-right text-sm">{l.interest_rate}%</td>
                    <td className="px-6 py-4 text-right">
                      <StatusPill status={l.status} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        to="/app/loans/$loanId"
                        params={{ loanId: l.id }}
                        className="text-[11px] font-semibold uppercase tracking-widest text-emerald-mid hover:underline"
                      >
                        View →
                      </Link>
                    </td>
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
