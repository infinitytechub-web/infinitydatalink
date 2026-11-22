import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Suspense } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
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
import { BarList, TrendChart } from "@/components/charts";
import { formatMoney } from "@/lib/org-config";
import { getLoanOfficerOverview } from "@/lib/admin-loans.functions";
import { RepaymentBook } from "@/components/loans/repayment-book";

export const Route = createFileRoute("/_admin/admin/loan-dashboard")({
  component: LoanDashboard,
  errorComponent: DashboardError,
  head: () => ({
    meta: [
      { title: "Loan Officer Dashboard — Infinity Wealth" },
      {
        name: "description",
        content:
          "Officer view of pending loan applications, approval history and a live approved versus rejected overview.",
      },
      { property: "og:title", content: "Loan Officer Dashboard — Infinity Wealth" },
      {
        property: "og:description",
        content: "Pending applications, decision history and approval analytics for loan officers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function DashboardError({ error }: { error: unknown }) {
  const router = useRouter();
  return (
    <div className="p-6">
      <ErrorState
        title="Loan dashboard failed to load"
        message={(error as Error).message}
        onRetry={() => router.invalidate()}
      />
    </div>
  );
}

const overviewQuery = queryOptions({
  queryKey: ["admin", "loan-dashboard", 30],
  queryFn: () => getLoanOfficerOverview({ data: { days: 30 } }),
  refetchInterval: 60_000,
});

function LoanDashboard() {
  return (
    <>
      <PageHeader
        eyebrow="Loan officer"
        title="Loan Dashboard"
        description="Pending applications, approval history and a live approved vs rejected overview."
      />
      <Suspense
        fallback={
          <div className="space-y-8">
            <KPIGridSkeleton count={4} />
            <SectionCardSkeleton title="Pending applications" rows={5} cols={5} />
          </div>
        }
      >
        <DashboardBody />
      </Suspense>
    </>
  );
}

function DashboardBody() {
  const { data } = useSuspenseQuery(overviewQuery);

  return (
    <>
      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat
          label="Awaiting decision"
          value={<span className="tabular">{data.counts.pending}</span>}
          accent
        />
        <KPIStat
          label="Pending value"
          value={
            <>
              GH₵{" "}
              <span className="tabular">{formatMoney(data.pendingValue).replace("GH₵ ", "")}</span>
            </>
          }
        />
        <KPIStat label="Approval rate" value={<span className="tabular">{data.approvalRate}%</span>} />
        <KPIStat
          label="Avg. decision time"
          value={
            <span className="tabular">
              {data.avgDecisionHours == null ? "—" : `${data.avgDecisionHours} h`}
            </span>
          }
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Approved vs rejected (30 days)">
          <div className="p-4">
            <TrendChart
              title="Decisions per day"
              data={data.trend}
              xKey="day"
              variant="area"
              height={260}
              series={[
                { key: "approved", label: "Approved" },
                { key: "rejected", label: "Rejected" },
              ]}
            />
          </div>
        </SectionCard>

        <SectionCard title="Loan book by status">
          <BarList
            rows={[
              { label: "Pending", value: data.counts.pending },
              { label: "Approved", value: data.counts.approved },
              { label: "Active", value: data.counts.active },
              { label: "Rejected", value: data.counts.rejected },
              { label: "Closed", value: data.counts.closed },
            ]}
            emptyLabel="No loan applications yet"
          />
          <div className="border-t border-border px-6 py-4 text-sm text-muted-foreground">
            Approved &amp; active exposure: <Money amount={data.portfolioValue} />
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Pending applications"
        action={
          <Link
            to="/admin/loans"
            className="rounded border border-emerald-deep/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-cream/50"
          >
            Open pipeline
          </Link>
        }
      >
        {data.pending.length === 0 ? (
          <div className="p-6">
            <EmptyState title="Queue clear" hint="No applications are waiting for a decision." />
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-6 py-3 font-medium">Ref</th>
                <th className="px-6 py-3 font-medium">Member</th>
                <th className="px-6 py-3 font-medium">Product</th>
                <th className="px-6 py-3 text-right font-medium">Amount</th>
                <th className="px-6 py-3 text-right font-medium">Term</th>
                <th className="px-6 py-3 text-right font-medium">Applied</th>
                <th className="px-6 py-3 text-right font-medium">Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-deep/5">
              {data.pending.map((l) => (
                <tr key={l.id}>
                  <td className="tabular px-6 py-4 text-sm font-semibold">{l.ref}</td>
                  <td className="px-6 py-4 text-sm">
                    <div className="font-medium">{l.member_name ?? "—"}</div>
                    <div className="tabular text-[11px] text-muted-foreground">
                      {l.member_no ?? l.user_id.slice(0, 8)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{l.product}</td>
                  <td className="px-6 py-4 text-right">
                    <Money amount={l.amount} />
                  </td>
                  <td className="tabular px-6 py-4 text-right text-sm">
                    {l.term_months} mo · {l.interest_rate}%
                  </td>
                  <td className="tabular px-6 py-4 text-right text-xs text-muted-foreground">
                    {new Date(l.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      to="/admin/loans/$loanId"
                      params={{ loanId: l.id }}
                      className="rounded bg-emerald-deep px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-cream hover:bg-emerald-mid"
                    >
                      Review
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <RepaymentBook />

      <SectionCard
        title="Approval history"
        action={
          <Link
            to="/admin/audit"
            className="rounded border border-emerald-deep/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-cream/50"
          >
            Full audit trail
          </Link>
        }
      >
        {data.recentDecisions.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No decisions yet" hint="Approvals and rejections appear here." />
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-6 py-3 font-medium">Ref</th>
                <th className="px-6 py-3 font-medium">Member</th>
                <th className="px-6 py-3 text-right font-medium">Amount</th>
                <th className="px-6 py-3 text-right font-medium">Decided</th>
                <th className="px-6 py-3 font-medium">Note</th>
                <th className="px-6 py-3 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-deep/5">
              {data.recentDecisions.map((d) => (
                <tr key={d.id}>
                  <td className="tabular px-6 py-4 text-sm font-semibold">
                    <Link
                      to="/admin/loans/$loanId"
                      params={{ loanId: d.id }}
                      className="hover:underline"
                    >
                      {d.ref}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm">{d.member_name ?? d.member_no ?? "—"}</td>
                  <td className="px-6 py-4 text-right">
                    <Money amount={d.amount} />
                  </td>
                  <td className="tabular px-6 py-4 text-right text-xs text-muted-foreground">
                    {d.decided_at ? new Date(d.decided_at).toLocaleString() : "—"}
                  </td>
                  <td className="max-w-[22rem] px-6 py-4 text-xs text-muted-foreground">
                    {d.decision_note ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <StatusPill status={d.status as "approved" | "rejected" | "active" | "closed" | "pending"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </>
  );
}
