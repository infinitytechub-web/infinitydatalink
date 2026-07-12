import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Suspense } from "react";
import { queryOptions, useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  EmptyState,
  ErrorState,
  KPIGridSkeleton,
  KPIStat,
  Money,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
  StatusPill,
} from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";
import { formatMoney } from "@/lib/org-config";
import { generateBusinessInsights } from "@/lib/ai-insights.functions";
import { getAdminOverview, type ActivityEntry, type PendingApproval } from "@/lib/admin-analytics.functions";
import { decideLoan } from "@/lib/admin-loans.functions";
import { RefreshCw, Sparkles } from "lucide-react";

const overviewQuery = queryOptions({
  queryKey: ["admin", "overview"],
  queryFn: () => getAdminOverview(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/_admin/admin/")({
  component: AdminDashboard,
  errorComponent: DashboardError,
});

function DashboardError({ error }: { error: Error }) {
  const router = useRouter();
  return (
    <div className="p-6">
      <ErrorState
        title="Dashboard failed to load"
        message={error.message}
        onRetry={() => router.invalidate()}
      />
    </div>
  );
}

function DashboardFallback() {
  return (
    <div className="space-y-8">
      <KPIGridSkeleton count={4} />
      <div className="grid gap-8 lg:grid-cols-3">
        <SectionCardSkeleton title="Pending approvals" rows={5} cols={4} />
        <SectionCardSkeleton title="Latest activity" rows={5} cols={3} />
        <SectionCardSkeleton title="Security" rows={4} cols={2} />
      </div>
    </div>
  );
}

function AdminDashboard() {
  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Institutional analytics"
        description="Real-time posture across membership, savings, loans, payments and security."
      />
      <Suspense fallback={<DashboardFallback />}>
        <DashboardBody />
      </Suspense>
      <AiBusinessIntelligencePanel />
    </>
  );
}

function pctFmt(v: number) {
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(1)}%`;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function DashboardBody() {
  const { data: o } = useSuspenseQuery(overviewQuery);
  return (
    <>
      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat
          tone="indigo"
          label="Members"
          value={<span className="tabular">{o.members_total.toLocaleString()}</span>}
          hint={`+${o.members_new_30d} in last 30 days`}
        />
        <KPIStat
          tone="teal"
          label="Assets under management"
          value={<>GH₵ <span className="tabular">{formatCompact(o.savings_aum)}</span></>}
          hint={`${pctFmt(o.savings_delta_mom)} MoM net contributions`}
        />
        <KPIStat
          tone="emerald"
          label="Active loans"
          value={<>GH₵ <span className="tabular">{formatCompact(o.loans_active_principal)}</span></>}
          hint={`${(o.loans_on_time_rate * 100).toFixed(1)}% approved`}
        />
        <KPIStat
          tone="amber"
          label="Pending approvals"
          value={<span className="tabular">{o.pending_loans + o.pending_withdrawals}</span>}
          hint={`${o.pending_loans} loans · ${o.pending_withdrawals} withdrawals`}
        />
      </section>

      <div className="grid gap-8 lg:grid-cols-3">
        <ApprovalQueue approvals={o.pending_approvals} />
        <LiveActivity items={o.recent_activity} />
      </div>
    </>
  );
}

function formatCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function ApprovalQueue({ approvals }: { approvals: PendingApproval[] }) {
  const qc = useQueryClient();
  const decide = useServerFn(decideLoan);
  const mutation = useMutation({
    mutationFn: (input: { loan_id: string; decision: "approved" | "rejected"; note: string }) =>
      decide({ data: input }),
    onSuccess: (_d, vars) => {
      toast.success(`Loan ${vars.decision}`);
      qc.invalidateQueries({ queryKey: ["admin", "overview"] });
      qc.invalidateQueries({ queryKey: ["admin", "loans"] });
      qc.invalidateQueries({ queryKey: ["admin", "loan-audit"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const act = (loan_id: string, decision: "approved" | "rejected") => {
    const note = window.prompt(
      `Enter a justification note for ${decision.toUpperCase()} (min. 5 chars):`,
      decision === "approved" ? "Meets policy" : "Does not meet criteria",
    );
    if (!note || note.trim().length < 5) {
      toast.error("A decision note of at least 5 characters is required.");
      return;
    }
    mutation.mutate({ loan_id, decision, note: note.trim() });
  };

  return (
    <SectionCard
      title="Approval queue"
      className="lg:col-span-2"
      action={
        <ExportBar
          permission="export:approvals"
          title="Pending Approvals"
          subtitle={`${approvals.length} pending items`}
          filename="approval_queue"
          columns={[
            { header: "Ref", accessor: (a: PendingApproval) => a.ref },
            { header: "Member", accessor: (a) => a.member_name ?? "—" },
            { header: "Member No", accessor: (a) => a.member_no ?? "—" },
            { header: "Product", accessor: (a) => a.product },
            { header: "Amount", accessor: (a) => formatMoney(a.amount), align: "right" },
            { header: "Submitted", accessor: (a) => new Date(a.created_at).toISOString() },
          ]}
          rows={approvals}
        />
      }
    >
      {approvals.length === 0 ? (
        <div className="p-6">
          <EmptyState title="No pending approvals" hint="New loan applications will appear here." />
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
              <th className="px-6 py-3 font-medium">Ref</th>
              <th className="px-6 py-3 font-medium">Member</th>
              <th className="px-6 py-3 font-medium">Product</th>
              <th className="px-6 py-3 text-right font-medium">Amount</th>
              <th className="px-6 py-3 text-right font-medium">Status</th>
              <th className="px-6 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-deep/5">
            {approvals.map((a) => (
              <tr key={a.id}>
                <td className="tabular px-6 py-4 text-sm font-semibold">{a.ref}</td>
                <td className="px-6 py-4 text-sm">
                  <div>{a.member_name ?? "—"}</div>
                  <div className="tabular text-[11px] text-emerald-deep/50">{a.member_no ?? ""}</div>
                </td>
                <td className="px-6 py-4 text-sm text-emerald-deep/60">{a.product}</td>
                <td className="px-6 py-4 text-right"><Money amount={a.amount} /></td>
                <td className="px-6 py-4 text-right"><StatusPill status="pending" /></td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-1">
                    <button
                      disabled={mutation.isPending}
                      onClick={() => act(a.id, "approved")}
                      className="rounded bg-emerald-deep px-2.5 py-1 text-[10px] font-bold uppercase text-cream hover:bg-emerald-mid disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      disabled={mutation.isPending}
                      onClick={() => act(a.id, "rejected")}
                      className="rounded border border-emerald-deep/15 px-2.5 py-1 text-[10px] font-bold uppercase hover:bg-cream disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionCard>
  );
}

function LiveActivity({ items }: { items: ActivityEntry[] }) {
  return (
    <SectionCard title="Live activity">
      {items.length === 0 ? (
        <div className="p-6">
          <EmptyState title="No activity yet" hint="Audit events will appear here." />
        </div>
      ) : (
        <ul className="divide-y divide-emerald-deep/5">
          {items.map((l) => (
            <li key={l.id} className="p-4">
              <p className="text-sm font-semibold">{l.actor_email ?? "System"}</p>
              <p className="text-xs text-emerald-deep/60">{l.action}</p>
              <p className="mt-1 text-[10px] uppercase tracking-widest text-emerald-deep/40">
                {l.actor_role ?? "—"} · {relativeTime(l.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function AiBusinessIntelligencePanel() {
  return (
    <SectionCard title="AI Business Intelligence" action={<AiRefreshButton />}>
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
