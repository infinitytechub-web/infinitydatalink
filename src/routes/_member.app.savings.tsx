import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Suspense } from "react";
import { EmptyState, KPIStat, Money, PageHeader, SectionCard, StatusPill } from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";
import { formatMoney } from "@/lib/org-config";
import { getMySavings, type SavingsRow } from "@/lib/member-data.functions";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_member/app/savings")({
  component: SavingsPage,
});

const savingsQuery = queryOptions({
  queryKey: ["member", "savings"],
  queryFn: () => getMySavings(),
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
  const { data: plans } = useSuspenseQuery(savingsQuery);
  const total = plans.reduce((s, p) => s + p.balance, 0);
  const avgRate = plans.length ? plans.reduce((s, p) => s + p.interest_rate, 0) / plans.length : 0;

  return (
    <>
      <section className="grid gap-6 md:grid-cols-3">
        <KPIStat label="Total Savings" value={<>GH₵ <span className="tabular">{formatMoney(total).replace("GH₵ ", "")}</span></>} hint={`Across ${plans.length} plan(s)`} />
        <KPIStat label="Blended interest rate" value={<span className="tabular">{avgRate.toFixed(2)}%</span>} hint="Average across active plans" />
        <KPIStat label="Active plans" value={<span className="tabular">{plans.length}</span>} accent hint="Contribution schedules" />
      </section>

      <SectionCard
        title="Contribution schedules"
        action={
          <ExportBar
            title="My Savings Contributions"
            subtitle={`${plans.length} plan(s)`}
            filename="my_savings"
            permission="export:own_savings"
            columns={[
              { header: "Plan", accessor: (p: SavingsRow) => p.name },
              { header: "Schedule", accessor: (p) => p.schedule },
              { header: "Interest rate", accessor: (p) => `${p.interest_rate}%`, align: "right" },
              { header: "Balance", accessor: (p) => formatMoney(p.balance), align: "right" },
            ]}
            rows={plans}
          />
        }
      >
        {plans.length === 0 ? (
          <div className="p-6"><EmptyState title="No savings plans yet" hint="Enroll in a plan to start contributing." /></div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
                <th className="px-6 py-3 font-medium">Plan</th>
                <th className="px-6 py-3 font-medium">Schedule</th>
                <th className="px-6 py-3 text-right font-medium">Interest rate</th>
                <th className="px-6 py-3 text-right font-medium">Balance</th>
                <th className="px-6 py-3 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-deep/5">
              {plans.map((p) => (
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
        )}
      </SectionCard>
    </>
  );
}
