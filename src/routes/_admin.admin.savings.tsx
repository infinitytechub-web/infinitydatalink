import { createFileRoute } from "@tanstack/react-router";
import { KPIStat, Money, PageHeader, SectionCard } from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";
import { formatMoney } from "@/lib/org-config";

export const Route = createFileRoute("/_admin/admin/savings")({
  component: AdminSavings,
});

function AdminSavings() {
  return (
    <>
      <PageHeader eyebrow="Administrator" title="Savings" description="Institution-wide savings positions, plans and interest." />
      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat label="Total balances" value={<>GH₵ <span className="tabular">8.9M</span></>} hint="+4.2% MoM" />
        <KPIStat label="Active plans" value={<span className="tabular">3,412</span>} hint="Across 4,218 members" />
        <KPIStat label="Interest paid YTD" value={<>GH₵ <span className="tabular">412K</span></>} />
        <KPIStat label="Failed contributions" value={<span className="tabular">28</span>} accent hint="24h window" />
      </section>
      {(() => {
        const plans = [
          { name: "Cooperative Shares", schedule: "Monthly", members: 2100, balance: 4_200_000 },
          { name: "Susu Daily", schedule: "Daily", members: 812, balance: 1_820_000 },
          { name: "Real Estate Fund", schedule: "Weekly", members: 340, balance: 1_640_000 },
          { name: "Education Fund", schedule: "Quarterly", members: 160, balance: 1_240_000 },
        ];
        return (
          <SectionCard
            title="Plan breakdown"
            action={
              <ExportBar
                title="Savings Plan Breakdown"
                subtitle={`${plans.length} plans`}
                filename="savings_plans"
                columns={[
                  { header: "Plan", accessor: (p: typeof plans[number]) => p.name },
                  { header: "Schedule", accessor: (p) => p.schedule },
                  { header: "Members", accessor: (p) => p.members, align: "right" },
                  { header: "Balance", accessor: (p) => formatMoney(p.balance), align: "right" },
                ]}
                rows={plans}
              />
            }
          >
            <table className="w-full">
              <thead>
                <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
                  <th className="px-6 py-3 font-medium">Plan</th>
                  <th className="px-6 py-3 font-medium">Schedule</th>
                  <th className="px-6 py-3 text-right font-medium">Members</th>
                  <th className="px-6 py-3 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-deep/5">
                {plans.map((p) => (
                  <tr key={p.name}>
                    <td className="px-6 py-4 text-sm font-semibold">{p.name}</td>
                    <td className="px-6 py-4 text-sm text-emerald-deep/60">{p.schedule}</td>
                    <td className="tabular px-6 py-4 text-right">{p.members}</td>
                    <td className="px-6 py-4 text-right"><Money amount={p.balance} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        );
      })()}
      </SectionCard>
    </>
  );
}
