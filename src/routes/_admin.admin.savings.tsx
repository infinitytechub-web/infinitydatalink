import { createFileRoute } from "@tanstack/react-router";
import { KPIStat, Money, PageHeader, SectionCard } from "@/components/primitives";

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
      <SectionCard title="Plan breakdown">
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
            {[
              ["Cooperative Shares", "Monthly", 2100, 4_200_000],
              ["Susu Daily", "Daily", 812, 1_820_000],
              ["Real Estate Fund", "Weekly", 340, 1_640_000],
              ["Education Fund", "Quarterly", 160, 1_240_000],
            ].map(([n, s, m, b]) => (
              <tr key={String(n)}>
                <td className="px-6 py-4 text-sm font-semibold">{n as string}</td>
                <td className="px-6 py-4 text-sm text-emerald-deep/60">{s as string}</td>
                <td className="tabular px-6 py-4 text-right">{m as number}</td>
                <td className="px-6 py-4 text-right"><Money amount={b as number} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </>
  );
}
