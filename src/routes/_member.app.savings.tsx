import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, KPIStat, Money, PageHeader, SectionCard, StatusPill } from "@/components/primitives";

export const Route = createFileRoute("/_member/app/savings")({
  component: SavingsPage,
});

const plans = [
  { name: "Monthly Cooperative Share", schedule: "Monthly", next: "Oct 28", amount: 500, balance: 42000, status: "active" as const },
  { name: "Real Estate Fund", schedule: "Weekly", next: "Oct 21", amount: 250, balance: 144000, status: "active" as const },
  { name: "Emergency Reserve", schedule: "Daily", next: "Oct 15", amount: 20, balance: 9800, status: "active" as const },
  { name: "Education Fund", schedule: "Quarterly", next: "Dec 31", amount: 3000, balance: 24000, status: "pending" as const },
];

function SavingsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Member portal"
        title="My Savings"
        description="Contribution schedules, goals and interest tracking across every plan."
        action={
          <button className="rounded bg-gold px-4 py-2 text-xs font-bold uppercase tracking-widest text-emerald-deep hover:opacity-90">
            New savings plan
          </button>
        }
      />

      <section className="grid gap-6 md:grid-cols-3">
        <KPIStat label="Total Savings" value={<>GH₵ <span className="tabular">219,800.00</span></>} hint="Across 4 plans" />
        <KPIStat label="Interest earned YTD" value={<>GH₵ <span className="tabular">8,120.50</span></>} hint="Blended rate 6.4% p.a." />
        <KPIStat label="Next contribution" value={<span className="tabular">GH₵ 250.00</span>} hint="Real Estate Fund · Oct 21" accent />
      </section>

      <SectionCard title="Contribution schedules">
        <table className="w-full">
          <thead>
            <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
              <th className="px-6 py-3 font-medium">Plan</th>
              <th className="px-6 py-3 font-medium">Schedule</th>
              <th className="px-6 py-3 font-medium">Next</th>
              <th className="px-6 py-3 text-right font-medium">Amount</th>
              <th className="px-6 py-3 text-right font-medium">Balance</th>
              <th className="px-6 py-3 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-deep/5">
            {plans.map((p) => (
              <tr key={p.name}>
                <td className="px-6 py-4 text-sm font-semibold">{p.name}</td>
                <td className="px-6 py-4 text-sm text-emerald-deep/60">{p.schedule}</td>
                <td className="tabular px-6 py-4 text-sm">{p.next}</td>
                <td className="px-6 py-4 text-right"><Money amount={p.amount} /></td>
                <td className="px-6 py-4 text-right"><Money amount={p.balance} /></td>
                <td className="px-6 py-4 text-right"><StatusPill status={p.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title="Savings analytics">
        <div className="p-6">
          <EmptyState title="Analytics visualisations arrive with backend data" hint="Charts render once contributions sync from Lovable Cloud." />
        </div>
      </SectionCard>
    </>
  );
}
