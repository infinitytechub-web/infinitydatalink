import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KPIStat, Money, PageHeader, SectionCard, StatusPill } from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";
import { formatMoney } from "@/lib/org-config";
import { generateBusinessInsights } from "@/lib/ai-insights.functions";
import { RefreshCw, Sparkles } from "lucide-react";

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
              permission="export:approvals"
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

      <AiBusinessIntelligencePanel />
    </>
  );
}

function AiBusinessIntelligencePanel() {
  return (
    <SectionCard
      title="AI Business Intelligence"
      action={<AiRefreshButton />}
    >
      <AiInsightsGrid />
    </SectionCard>
  );
}

const INSIGHTS_KEY = ["admin", "ai-insights"];

function useAiInsights() {
  const call = useServerFn(generateBusinessInsights);
  return useQuery({
    queryKey: INSIGHTS_KEY,
    queryFn: () => call(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

function AiRefreshButton() {
  const qc = useQueryClient();
  const { isFetching } = useAiInsights();
  return (
    <button
      onClick={() => qc.invalidateQueries({ queryKey: INSIGHTS_KEY })}
      disabled={isFetching}
      className="inline-flex items-center gap-1.5 rounded border border-gold/30 bg-gold/10 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-gold hover:bg-gold/20 disabled:opacity-50"
    >
      <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
      {isFetching ? "Analyzing…" : "Refresh insights"}
    </button>
  );
}

function AiInsightsGrid() {
  const { data, isLoading, isError, error } = useAiInsights();

  if (isLoading) {
    return (
      <div className="grid gap-6 p-6 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="animate-pulse rounded border border-gold/20 bg-gold/5 p-5">
            <div className="h-3 w-24 rounded bg-gold/30" />
            <div className="mt-3 h-5 w-40 rounded bg-emerald-deep/20" />
            <div className="mt-2 h-3 w-32 rounded bg-emerald-deep/10" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 text-sm text-destructive">
        AI insights unavailable: {(error as Error)?.message ?? "unknown error"}
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-6 p-6 md:grid-cols-3">
        {data?.insights.map((i) => (
          <div key={i.title} className="rounded border border-gold/20 bg-gold/5 p-5">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gold">
              <Sparkles className="h-3 w-3" /> {i.title}
            </p>
            <p className="mt-1 font-serif text-lg text-emerald-deep">{i.value}</p>
            <p className="mt-1 text-xs text-emerald-deep/60">{i.hint}</p>
          </div>
        ))}
      </div>
      {data ? (
        <p className="border-t border-emerald-deep/5 px-6 py-3 text-[10px] uppercase tracking-widest text-emerald-deep/40">
          Generated {new Date(data.generatedAt).toLocaleString()} · {data.model}
        </p>
      ) : null}
    </>
  );
}
