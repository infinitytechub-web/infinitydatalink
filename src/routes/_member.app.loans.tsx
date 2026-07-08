import { createFileRoute } from "@tanstack/react-router";
import { KPIStat, Money, PageHeader, SectionCard, StatusPill } from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";
import { formatMoney } from "@/lib/org-config";

export const Route = createFileRoute("/_member/app/loans")({
  component: LoansPage,
});

const loans = [
  { id: "LN-2025-0918", product: "Business Expansion II", principal: 45000, balance: 18400, next: "Oct 15", installment: 1200, status: "active" as const },
  { id: "LN-2024-4402", product: "Home Improvement", principal: 12000, balance: 0, next: "—", installment: 0, status: "cleared" as const },
];

function LoansPage() {
  return (
    <>
      <PageHeader
        eyebrow="Member portal"
        title="Active Loans"
        description="Application, guarantors, repayment schedule and outstanding balances."
        action={
          <button className="rounded bg-emerald-deep px-4 py-2 text-xs font-bold uppercase tracking-widest text-cream hover:bg-emerald-mid">
            Apply for a loan
          </button>
        }
      />

      <section className="grid gap-6 md:grid-cols-3">
        <KPIStat label="Active loan balance" value={<>GH₵ <span className="tabular">18,400.00</span></>} hint="1 active facility" />
        <KPIStat label="Total repaid this year" value={<>GH₵ <span className="tabular">14,400.00</span></>} hint="On-time · 12/12 instalments" />
        <KPIStat label="Loan eligibility" value={<>GH₵ <span className="tabular">65,000.00</span></>} accent hint="Based on savings + guarantors" />
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
              { header: "Reference", accessor: (l: typeof loans[number]) => l.id },
              { header: "Product", accessor: (l) => l.product },
              { header: "Principal", accessor: (l) => formatMoney(l.principal), align: "right" },
              { header: "Outstanding", accessor: (l) => formatMoney(l.balance), align: "right" },
              { header: "Next", accessor: (l) => l.next },
              { header: "Instalment", accessor: (l) => formatMoney(l.installment), align: "right" },
              { header: "Status", accessor: (l) => l.status.toUpperCase(), align: "right" },
            ]}
            rows={loans}
          />
        }
      >
        <table className="w-full">
          <thead>
            <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
              <th className="px-6 py-3 font-medium">Reference</th>
              <th className="px-6 py-3 font-medium">Product</th>
              <th className="px-6 py-3 text-right font-medium">Principal</th>
              <th className="px-6 py-3 text-right font-medium">Outstanding</th>
              <th className="px-6 py-3 font-medium">Next</th>
              <th className="px-6 py-3 text-right font-medium">Instalment</th>
              <th className="px-6 py-3 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-deep/5">
            {loans.map((l) => (
              <tr key={l.id}>
                <td className="tabular px-6 py-4 text-sm font-semibold">{l.id}</td>
                <td className="px-6 py-4 text-sm">{l.product}</td>
                <td className="px-6 py-4 text-right"><Money amount={l.principal} /></td>
                <td className="px-6 py-4 text-right"><Money amount={l.balance} /></td>
                <td className="tabular px-6 py-4 text-sm">{l.next}</td>
                <td className="px-6 py-4 text-right"><Money amount={l.installment} /></td>
                <td className="px-6 py-4 text-right"><StatusPill status={l.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </>
  );
}
