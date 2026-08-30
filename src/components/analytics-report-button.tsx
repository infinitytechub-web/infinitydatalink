import { useState } from "react";
import { FileDown, FileText, Loader2, Lock } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useAuth, type Permission } from "@/lib/auth";
import { logAnalyticsExport } from "@/lib/analytics-export.functions";
import {
  buildAnalyticsReport,
  exportAnalyticsCsv,
  exportAnalyticsPdf,
  reportRowCount,
} from "@/lib/analytics-report";
import type { AdminInsights } from "@/lib/admin-insights.functions";

const EXPORT_PERMISSION: Permission = "export:audit";

type Props = {
  data: AdminInsights;
  from: string;
  to: string;
  granularity: "day" | "week" | "month";
  entity: string;
  entityLabel: string;
};

/**
 * Downloads the whole analytics dashboard — KPI summary plus every chart
 * series and mix breakdown — as one CSV or one branded PDF report. Gated by
 * the export RBAC permission; each download writes an audit entry.
 */
export function AnalyticsReportButton({
  data,
  from,
  to,
  granularity,
  entity,
  entityLabel,
}: Props) {
  const { hasPermission } = useAuth();
  const allowed = hasPermission(EXPORT_PERMISSION);
  const audit = useServerFn(logAnalyticsExport);
  const [busy, setBusy] = useState<"csv" | "pdf" | null>(null);

  const btn =
    "inline-flex items-center gap-1.5 rounded border border-primary/30 bg-card px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-primary transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  if (!allowed) {
    return (
      <div
        className="inline-flex items-center gap-2 rounded border border-gold/30 bg-gold/10 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-gold-ink dark:text-brand-gold"
        title={`Dashboard report download requires permission: ${EXPORT_PERMISSION}`}
      >
        <Lock className="h-3 w-3" /> Report locked
      </div>
    );
  }

  const run = (format: "csv" | "pdf") => async () => {
    setBusy(format);
    try {
      const report = buildAnalyticsReport(data, { from, to, granularity, entityLabel });
      if (report.sections.length === 0) {
        toast.error("Nothing to export for this period");
        return;
      }
      if (format === "csv") exportAnalyticsCsv(report);
      else await exportAnalyticsPdf(report);
      toast.success(
        `Dashboard ${format.toUpperCase()} report downloaded (${report.sections.length} sections)`,
      );
      try {
        await audit({
          data: {
            format,
            rows: reportRowCount(report),
            sections: report.sections.length,
            date_from: from,
            date_to: to,
            granularity,
            entity,
          },
        });
      } catch {
        // The file already downloaded; a failed audit write must not look like
        // a failed export, but it is worth surfacing quietly.
        toast.warning("Download completed but the audit entry could not be written");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Report generation failed");
    } finally {
      setBusy(null);
    }
  };

  const spin = (f: "csv" | "pdf") =>
    busy === f ? <Loader2 className="h-3 w-3 animate-spin" /> : null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        className={btn}
        disabled={busy !== null}
        onClick={() => void run("pdf")()}
        title="Download the full dashboard (KPIs + all chart data) as a branded PDF report"
      >
        {spin("pdf") ?? <FileText className="h-3 w-3" />} Dashboard PDF
      </button>
      <button
        type="button"
        className={btn}
        disabled={busy !== null}
        onClick={() => void run("csv")()}
        title="Download the full dashboard (KPIs + all chart data) as a multi-section CSV"
      >
        {spin("csv") ?? <FileDown className="h-3 w-3" />} Dashboard CSV
      </button>
    </div>
  );
}
