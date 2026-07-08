import { createFileRoute } from "@tanstack/react-router";
import { KPIStat, Money, PageHeader, SectionCard, StatusPill } from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";
import { formatMoney } from "@/lib/org-config";

export const Route = createFileRoute("/_admin/admin/")({
  component: AdminDashboard,
});

const approvals = [
  { id: "APP-2201", member: "Akosua Addo", type: "Loan · Business Expansion", amount: 15000, status: "pending" as const },
  { id: "APP-2199", member: "Yaw Preko", type: "Withdrawal · Emergency", amount: 4200, status: "pending" as const },
  { id: "APP-2194", member: "Efua Owusu", type: "Loan · School Fees", amount: 6800, status: "pending" as const },
];

const live = [
  { who: "Kwame Mensah", what: "Signed in from Accra", when: "just now" },
  { who: "System", what: "Nightly backup completed", when: "2h ago" },
  { who: "Ama Serwaa", what: "Made deposit of GH₵ 500", when: "3h ago" },
  { who: "Admin (Kojo)", what: "Approved loan APP-2189", when: "6h ago" },
];

function AdminDashboard() {
  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Institutional analytics"
        description="Real-time posture across membership, savings, loans, payments and security."
      />

      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat label="Members" value={<span className="tabular">4,218</span>} hint="+142 this month" />
        <KPIStat label="Assets under management" value={<>GH₵ <span className="tabular">12.4M</span></>} hint="+3.1% MoM" />
        <KPIStat label="Active loans" value={<>GH₵ <span className="tabular">3.1M</span></>} hint="98.2% on-time" />
        <KPIStat label="Pending approvals" value={<span className="tabular">17</span>} accent hint="3 loans · 14 withdrawals" />
      </section>

      <div className="grid gap-8 lg:grid-cols-3">
        <SectionCard
          title="Approval queue"
          className="lg:col-span-2"
          action={
            <ExportBar
              title="Approval Queue"
              subtitle={`${approvals.length} pending items`}
              filename="approval_queue"
              columns={[
                { header: "Ref", accessor: (a: typeof approvals[number]) => a.id },
                { header: "Member", accessor: (a) => a.member },
                { header: "Type", accessor: (a) => a.type },
                { header: "Amount", accessor: (a) => formatMoney(a.amount), align: "right" },
                { header: "Status", accessor: (a) => a.status.toUpperCase(), align: "right" },
              ]}
              rows={approvals}
            />
          }
        >
          <table className="w-full">
            <thead>
              <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
                <th className="px-6 py-3 font-medium">Ref</th>
                <th className="px-6 py-3 font-medium">Member</th>
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 text-right font-medium">Amount</th>
                <th className="px-6 py-3 text-right font-medium">Status</th>
                <th className="px-6 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-deep/5">
              {approvals.map((a) => (
                <tr key={a.id}>
                  <td className="tabular px-6 py-4 text-sm font-semibold">{a.id}</td>
                  <td className="px-6 py-4 text-sm">{a.member}</td>
                  <td className="px-6 py-4 text-sm text-emerald-deep/60">{a.type}</td>
                  <td className="px-6 py-4 text-right"><Money amount={a.amount} /></td>
                  <td className="px-6 py-4 text-right"><StatusPill status={a.status} /></td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button className="rounded bg-emerald-deep px-2.5 py-1 text-[10px] font-bold uppercase text-cream hover:bg-emerald-mid">
                        Approve
                      </button>
                      <button className="rounded border border-emerald-deep/15 px-2.5 py-1 text-[10px] font-bold uppercase hover:bg-cream">
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>

        <SectionCard title="Live activity">
          <ul className="divide-y divide-emerald-deep/5">
            {live.map((l, i) => (
              <li key={i} className="p-4">
                <p className="text-sm font-semibold">{l.who}</p>
                <p className="text-xs text-emerald-deep/60">{l.what}</p>
                <p className="mt-1 text-[10px] uppercase tracking-widest text-emerald-deep/40">
                  {l.when}
                </p>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="AI Business Intelligence">
        <div className="grid gap-6 p-6 md:grid-cols-3">
          {[
            ["Default risk (30d)", "3 members flagged", "Trend down 0.8pt"],
            ["Savings forecast", "GH₵ 620K next quarter", "+8% YoY"],
            ["Cash reserve advice", "Reallocate GH₵ 150K", "Move to Prosperity Fund"],
          ].map(([t, v, h]) => (
            <div key={t} className="rounded border border-gold/20 bg-gold/5 p-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gold">{t}</p>
              <p className="mt-1 font-serif text-lg text-emerald-deep">{v}</p>
              <p className="mt-1 text-xs text-emerald-deep/60">{h}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  );
}
