import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { EmptyState, KPIStat, Money, PageHeader, SectionCard, StatusPill } from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";
import { formatMoney } from "@/lib/org-config";
import { getMyLoans, type LoanRow } from "@/lib/member-data.functions";
import { LoanApplicationDialog } from "@/components/loan-application-dialog";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_member/app/loans")({
  component: LoansPage,
});

const loansQuery = queryOptions({
  queryKey: ["member", "loans"],
  queryFn: () => getMyLoans(),
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
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <LoansContent />
      </Suspense>
    </>
  );
}

function LoansContent() {
  const { data: loans } = useSuspenseQuery(loansQuery);
  const active = loans.filter((l) => l.status === "active" || l.status === "approved");
  const activeBalance = active.reduce((s, l) => s + l.amount, 0);
  const pending = loans.filter((l) => l.status === "pending").length;

  return (
    <>
      <section className="grid gap-6 md:grid-cols-3">
        <KPIStat label="Active loan balance" value={<>GH₵ <span className="tabular">{formatMoney(activeBalance).replace("GH₵ ", "")}</span></>} hint={`${active.length} active facility`} />
        <KPIStat label="Pending applications" value={<span className="tabular">{pending}</span>} hint="Awaiting approval" />
        <KPIStat label="Total facilities" value={<span className="tabular">{loans.length}</span>} accent hint="Lifetime record" />
      </section>

      <SectionCard
        title="Loan facilities"
        action={
          <ExportBar
            title="My Loan Facilities"
            subtitle={`${loans.length} facility record(s)`}
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
            rows={loans}
          />
        }
      >
        {loans.length === 0 ? (
          <div className="p-6"><EmptyState title="No loan applications yet" hint="Use “Apply for a loan” to submit your first application." /></div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
                <th className="px-6 py-3 font-medium">Reference</th>
                <th className="px-6 py-3 font-medium">Product</th>
                <th className="px-6 py-3 text-right font-medium">Principal</th>
                <th className="px-6 py-3 text-right font-medium">Term</th>
                <th className="px-6 py-3 text-right font-medium">Rate</th>
                <th className="px-6 py-3 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-deep/5">
              {loans.map((l) => (
                <tr key={l.id}>
                  <td className="tabular px-6 py-4 text-sm font-semibold">{l.ref}</td>
                  <td className="px-6 py-4 text-sm">{l.product}</td>
                  <td className="px-6 py-4 text-right"><Money amount={l.amount} /></td>
                  <td className="tabular px-6 py-4 text-right text-sm">{l.term_months} mo</td>
                  <td className="tabular px-6 py-4 text-right text-sm">{l.interest_rate}%</td>
                  <td className="px-6 py-4 text-right"><StatusPill status={l.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </>
  );
}
