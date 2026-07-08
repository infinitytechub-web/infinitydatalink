import { createFileRoute } from "@tanstack/react-router";
import { KPIStat, Money, PageHeader, SectionCard, StatusPill } from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";
import { formatMoney } from "@/lib/org-config";

export const Route = createFileRoute("/_admin/admin/loans")({
  component: AdminLoans,
});

const pipeline = [
  { id: "LN-0921", member: "Akosua Addo", product: "Business Expansion", amount: 15000, status: "pending" as const },
  { id: "LN-0918", member: "Efua Owusu", product: "School Fees", amount: 6800, status: "pending" as const },
  { id: "LN-0914", member: "Yaw Preko", product: "Home Improvement", amount: 22000, status: "approved" as const },
  { id: "LN-0910", member: "Kojo Antwi", product: "Emergency", amount: 3500, status: "rejected" as const },
];

function AdminLoans() {
  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Loans & Approvals"
        description="Portfolio health, multi-level approval workflow and default prediction."
      />
      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat label="Portfolio" value={<>GH₵ <span className="tabular">3.1M</span></>} />
        <KPIStat label="Repayment rate" value={<span className="tabular">98.2%</span>} hint="Last 90 days" />
        <KPIStat label="At risk" value={<span className="tabular">3</span>} accent hint="Predicted default 30d" />
        <KPIStat label="Awaiting approval" value={<span className="tabular">7</span>} />
      </section>
      <SectionCard
        title="Approval pipeline"
        action={
          <ExportBar
            permission="export:loans"
            title="Loan Approval Pipeline"
            subtitle={`${pipeline.length} applications`}
            filename="loans_pipeline"
            columns={[
              { header: "Ref", accessor: (l: typeof pipeline[number]) => l.id },
              { header: "Member", accessor: (l) => l.member },
              { header: "Product", accessor: (l) => l.product },
              { header: "Amount", accessor: (l) => formatMoney(l.amount), align: "right" },
              { header: "Status", accessor: (l) => l.status.toUpperCase(), align: "right" },
            ]}
            rows={pipeline}
          />
        }
      >
        <table className="w-full">
          <thead>
            <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
              <th className="px-6 py-3 font-medium">Ref</th>
              <th className="px-6 py-3 font-medium">Member</th>
              <th className="px-6 py-3 font-medium">Product</th>
              <th className="px-6 py-3 text-right font-medium">Amount</th>
              <th className="px-6 py-3 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-deep/5">
            {pipeline.map((l) => (
              <tr key={l.id}>
                <td className="tabular px-6 py-4 text-sm font-semibold">{l.id}</td>
                <td className="px-6 py-4 text-sm">{l.member}</td>
                <td className="px-6 py-4 text-sm text-emerald-deep/60">{l.product}</td>
                <td className="px-6 py-4 text-right"><Money amount={l.amount} /></td>
                <td className="px-6 py-4 text-right"><StatusPill status={l.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </>
  );
}
