/**
 * Drill-down dialog for analytics KPIs and chart buckets.
 *
 * Opening a card or chart bucket fetches the underlying records for the same
 * date range and organisation scope, shows a category breakdown plus a record
 * table, and offers CSV/Excel/PDF export of exactly what is on screen.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";
import { BarList } from "@/components/charts";
import { formatMoney } from "@/lib/org-config";
import { logAnalyticsExport } from "@/lib/analytics-export.functions";
import { toast } from "sonner";
import type { Permission } from "@/lib/auth";
import {
  getInsightDrilldown,
  type DrilldownMetric,
  type DrilldownRow,
} from "@/lib/admin-insights-drilldown.functions";

export type DrilldownTarget = {
  metric: DrilldownMetric;
  /** Card/chart label shown in the dialog title. */
  label: string;
  from: string;
  to: string;
  /** Extra context line, e.g. the bucket that was clicked. */
  context?: string;
  permission: Permission;
  /** When false the amount column is a count rather than money. */
  money?: boolean;
};

export function DrilldownDialog({
  target,
  entity,
  entityLabel,
  onClose,
}: {
  target: DrilldownTarget | null;
  entity: string;
  entityLabel: string;
  onClose: () => void;
}) {
  const fetchFn = useServerFn(getInsightDrilldown);
  const auditExport = useServerFn(logAnalyticsExport);
  const { can } = useAuth();
  const enabled = Boolean(target);

  const { data, isPending, error } = useQuery({
    queryKey: ["admin", "insights", "drilldown", target?.metric, target?.from, target?.to, entity],
    queryFn: () =>
      fetchFn({
        data: {
          metric: target!.metric,
          from: target!.from,
          to: target!.to,
          entity,
        },
      }),
    enabled,
    staleTime: 30_000,
  });

  const money = target?.money !== false;
  const amount = (v: number) => (money ? formatMoney(v) : v.toLocaleString());

  return (
    <Dialog open={enabled} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{target?.label ?? "Drill-down"}</DialogTitle>
          <DialogDescription>
            {target ? `${target.from} to ${target.to} · ${entityLabel}` : null}
            {target?.context ? ` · ${target.context}` : null}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {(error as Error).message}
          </div>
        ) : isPending ? (
          <div className="space-y-3" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading records…</span>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        ) : !data ? null : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="secondary" className="tabular-nums">
                {data.total_rows.toLocaleString()} records
              </Badge>
              <Badge variant="outline" className="tabular-nums">
                Total {amount(data.total_amount)}
              </Badge>
              {data.truncated ? (
                <Badge variant="destructive" className="gap-1">
                  <Loader2 className="h-3 w-3" aria-hidden="true" /> Showing first 500 — narrow the
                  range
                </Badge>
              ) : null}
              <div className="ml-auto">
                <ExportBar
                  permission={target!.permission}
                  alsoRequire={can("reports", "export")}
                  title={`${data.title} — ${target!.label}`}
                  subtitle={`${target!.from} to ${target!.to} · ${entityLabel}`}
                  filename={`${data.metric}_${target!.from}_to_${target!.to}`}
                  columns={[
                    {
                      header: "Date",
                      accessor: (r: DrilldownRow) =>
                        new Date(r.occurred_at).toISOString().slice(0, 10),
                    },
                    { header: "Member", accessor: (r: DrilldownRow) => r.member_name },
                    { header: "Member no", accessor: (r: DrilldownRow) => r.member_no },
                    { header: "Category", accessor: (r: DrilldownRow) => r.category },
                    { header: "Status", accessor: (r: DrilldownRow) => r.status },
                    {
                      header: money ? "Amount" : "Count",
                      accessor: (r: DrilldownRow) => amount(r.amount),
                      align: "right",
                    },
                    { header: "Detail", accessor: (r: DrilldownRow) => r.detail },
                  ]}
                  rows={data.rows}
                  onExport={(format) => {
                    void auditExport({
                      data: {
                        surface: "drilldown",
                        metric: data.metric,
                        format,
                        rows: data.rows.length,
                        sections: 1,
                        date_from: target!.from,
                        date_to: target!.to,
                        granularity: "day",
                        entity,
                        entity_label: entityLabel,
                      },
                    }).catch(() =>
                      toast.warning("Download completed but the audit entry could not be written"),
                    );
                  }}
                />
              </div>
            </div>

            {data.breakdown.length > 0 ? (
              <section
                aria-label="Breakdown by category"
                className="rounded-lg border border-border"
              >
                <h3 className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Breakdown
                </h3>
                <BarList
                  rows={data.breakdown}
                  format={money ? formatMoney : undefined}
                  emptyLabel="No breakdown"
                />
              </section>
            ) : null}

            {data.rows.length === 0 ? (
              <EmptyState title="No underlying records for this selection" />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    {data.title} records for {target!.from} to {target!.to}
                  </caption>
                  <thead className="bg-muted/50">
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="px-3 py-2">
                        Date
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Member
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Category
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Status
                      </th>
                      <th scope="col" className="px-3 py-2 text-right">
                        {money ? "Amount" : "Count"}
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Detail
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.id} className="border-t border-border/60">
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                          {new Date(r.occurred_at).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-medium text-foreground">{r.member_name}</span>
                          <span className="block text-xs text-muted-foreground">{r.member_no}</span>
                        </td>
                        <td className="px-3 py-2">{r.category}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className="capitalize">
                            {r.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{amount(r.amount)}</td>
                        <td className="max-w-[18rem] truncate px-3 py-2 text-muted-foreground">
                          {r.detail}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
