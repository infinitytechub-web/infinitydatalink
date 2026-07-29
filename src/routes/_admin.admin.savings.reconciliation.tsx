import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, RefreshCw } from "lucide-react";
import { ErrorState, KPIStat, Money, PageHeader, SectionCard, SectionCardSkeleton } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { ExportBar } from "@/components/export-bar";
import { formatMoney } from "@/lib/org-config";
import { adminReconcileSavings, type ReconRow } from "@/lib/savings-reconciliation.functions";

const reconQuery = (onlyDiscrepancies: boolean) =>
  queryOptions({
    queryKey: ["admin", "savings", "reconciliation", onlyDiscrepancies],
    queryFn: () => adminReconcileSavings({ data: { only_discrepancies: onlyDiscrepancies } }),
    staleTime: 30_000,
  });

export const Route = createFileRoute("/_admin/admin/savings/reconciliation")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(reconQuery(true));
  },
  head: () => ({
    meta: [
      { title: "Savings Reconciliation · IT-360 CashApp" },
      { name: "description", content: "Compare savings ledger movements against recorded balances and flag discrepancies." },
      { property: "og:title", content: "Savings Reconciliation · IT-360 CashApp" },
      { property: "og:description", content: "Ledger vs. balance reconciliation for savings accounts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReconciliationPage,
  errorComponent: ({ error }) => (
    <div className="p-6"><ErrorState title="Failed to load reconciliation" message={error.message} /></div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm text-emerald-deep/70">Not found.</div>,
});

function ReconciliationPage() {
  const [onlyDiscrepancies, setOnlyDiscrepancies] = useState(true);
  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Savings reconciliation"
        description="Recomputes each account balance from cleared ledger movements and flags any drift."
        action={
          <Link
            to="/admin/savings"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to savings
          </Link>
        }
      />
      <Suspense fallback={<SectionCardSkeleton title="Reconciliation" rows={6} cols={6} />}>
        <Body onlyDiscrepancies={onlyDiscrepancies} onToggle={setOnlyDiscrepancies} />
      </Suspense>
    </>
  );
}

function Body({ onlyDiscrepancies, onToggle }: { onlyDiscrepancies: boolean; onToggle: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(reconQuery(onlyDiscrepancies));
  const clean = data.discrepancies === 0;

  return (
    <>
      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat label="Accounts checked" value={<span className="tabular">{data.accounts_checked}</span>} hint={`Run ${new Date(data.generated_at).toLocaleString()}`} />
        <KPIStat
          label="Discrepancies"
          value={<span className="tabular">{data.discrepancies}</span>}
          accent={!clean}
          hint={clean ? "Ledger matches balances" : "Needs finance review"}
        />
        <KPIStat label="Net drift" value={<Money amount={data.total_recorded - data.total_computed} />} hint={`Absolute ${formatMoney(data.total_abs_delta)}`} accent={!clean} />
        <KPIStat label="Pending (unposted)" value={<Money amount={data.pending_total} />} hint="Excluded from computed balances" />
      </section>

      <SectionCard
        title={onlyDiscrepancies ? "Flagged accounts" : "All accounts"}
        action={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1" onClick={() => onToggle(!onlyDiscrepancies)}>
              {onlyDiscrepancies ? "Show all accounts" : "Show flagged only"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() => qc.invalidateQueries({ queryKey: ["admin", "savings", "reconciliation"] })}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Re-run
            </Button>
            <ExportBar
              permission="export:savings"
              title="Savings Reconciliation"
              subtitle={`${data.rows.length} rows · ${data.discrepancies} discrepancies`}
              filename="savings_reconciliation"
              columns={[
                { header: "Member", accessor: (r: ReconRow) => r.member_name ?? "—" },
                { header: "Member no", accessor: (r: ReconRow) => r.member_no ?? "—" },
                { header: "Plan", accessor: (r: ReconRow) => r.plan_name ?? "—" },
                { header: "Recorded", accessor: (r: ReconRow) => formatMoney(r.recorded_balance), align: "right" },
                { header: "Computed", accessor: (r: ReconRow) => formatMoney(r.computed_balance), align: "right" },
                { header: "Delta", accessor: (r: ReconRow) => formatMoney(r.delta), align: "right" },
                { header: "Movements", accessor: (r: ReconRow) => r.movements, align: "right" },
              ]}
              rows={data.rows}
            />
          </div>
        }
      >
        {data.rows.length === 0 ? (
          <div className="flex items-center gap-2 p-6 text-sm text-emerald-deep/70">
            <CheckCircle2 className="h-4 w-4 text-emerald-mid" />
            Every savings balance matches its cleared ledger movements.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
                <th className="px-6 py-3 font-medium">Member</th>
                <th className="px-6 py-3 font-medium">Account</th>
                <th className="px-6 py-3 text-right font-medium">Recorded</th>
                <th className="px-6 py-3 text-right font-medium">Computed</th>
                <th className="px-6 py-3 text-right font-medium">Delta</th>
                <th className="px-6 py-3 text-right font-medium">Movements</th>
                <th className="px-6 py-3 text-right font-medium">Pending</th>
                <th className="px-6 py-3 text-right font-medium">Last movement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-deep/5">
              {data.rows.map((r) => (
                <tr key={r.account_id}>
                  <td className="px-6 py-3 text-sm">
                    <div className="font-semibold">{r.member_name ?? "Member"}</div>
                    <div className="text-[11px] text-emerald-deep/50">{r.member_no ?? r.account_id.slice(0, 8)}</div>
                  </td>
                  <td className="px-6 py-3 text-sm text-emerald-deep/70">
                    <div>{r.nickname ?? r.plan_name ?? "Savings"}</div>
                    <div className="text-[11px] capitalize text-emerald-deep/50">{r.status}</div>
                  </td>
                  <td className="px-6 py-3 text-right"><Money amount={r.recorded_balance} /></td>
                  <td className="px-6 py-3 text-right"><Money amount={r.computed_balance} /></td>
                  <td className="px-6 py-3 text-right">
                    {Math.abs(r.delta) > 0.005 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 text-[11px] font-semibold text-destructive">
                        <AlertTriangle className="h-3 w-3" /> {formatMoney(r.delta)}
                      </span>
                    ) : (
                      <span className="tabular text-[11px] text-emerald-deep/50">{formatMoney(r.delta)}</span>
                    )}
                  </td>
                  <td className="tabular px-6 py-3 text-right text-sm">{r.movements}</td>
                  <td className="px-6 py-3 text-right text-[11px] text-emerald-deep/60">
                    {r.pending_count > 0 ? `${r.pending_count} · ${formatMoney(r.pending_amount)}` : "—"}
                  </td>
                  <td className="px-6 py-3 text-right text-[11px] text-emerald-deep/50">
                    {r.last_movement_at ? new Date(r.last_movement_at).toLocaleDateString() : "—"}
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
