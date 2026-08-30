/**
 * Analytics dashboard reporting.
 *
 * Turns an `AdminInsights` snapshot into a multi-section report (KPI summary +
 * every chart series and mix breakdown) and renders it as either a multi-block
 * CSV workbook-style file or a branded, paginated PDF. Client-side only: the
 * heavy PDF library is imported lazily inside the export call so route modules
 * that reference these helpers stay SSR-safe.
 */
import { getOrgConfig, formatMoney } from "./org-config";
import type { AdminInsights } from "./admin-insights.functions";

export type ReportAlign = "left" | "right" | "center";

export type ReportSection = {
  name: string;
  note?: string;
  columns: { header: string; align?: ReportAlign }[];
  rows: (string | number)[][];
};

export type AnalyticsReport = {
  title: string;
  subtitle: string;
  filename: string;
  sections: ReportSection[];
};

const BRAND = {
  name: "IT-360 CashApp",
  tagline: "Enterprise Financial Management · Analytics & Business Intelligence",
  address: "Institutional Portal · Confidential",
  emerald: "#064e3b",
  gold: "#c9a84c",
  cream: "#f5f0e0",
};

const pctText = (v: number) => `${(Number(v) * 100).toFixed(1)}%`;

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function safeFilename(name: string) {
  return name.replace(/[^a-z0-9-_]+/gi, "_");
}

/** Neutralise spreadsheet formula-injection payloads in exported cells. */
function sanitizeCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (s.length === 0) return s;
  return /^[=+\-@\t\r\n]/.test(s) ? "'" + s : s;
}

function csvCell(v: unknown): string {
  const s = sanitizeCell(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// --------------------------------------------------------------------------
// Report assembly
// --------------------------------------------------------------------------

const MIX_COLUMNS: ReportSection["columns"] = [
  { header: "Label" },
  { header: "Value", align: "right" },
];

function mixSection(name: string, rows: { label: string; value: number }[]): ReportSection {
  return {
    name,
    columns: MIX_COLUMNS,
    rows: rows.map((r) => [r.label, r.value]),
  };
}

/** Builds every section of the analytics dashboard report. */
export function buildAnalyticsReport(
  data: AdminInsights,
  meta: { from: string; to: string; granularity: string; entityLabel: string },
): AnalyticsReport {
  const subtitle = `${meta.from} to ${meta.to} · ${meta.granularity} · ${meta.entityLabel}`;

  const kpi: ReportSection = {
    name: "KPI summary",
    columns: [{ header: "Metric" }, { header: "Value", align: "right" }],
    rows: [
      ["Opening balance", formatMoney(data.savings.opening_balance)],
      ["Closing balance", formatMoney(data.savings.closing_balance)],
      ["Deposits in range", formatMoney(data.savings.deposits_total)],
      ["Withdrawals in range", formatMoney(data.savings.withdrawals_total)],
      ["Savings growth", pctText(data.savings.growth_rate)],
      ["Withdrawals requested", formatMoney(data.withdrawals.requested_total)],
      ["Withdrawals paid", formatMoney(data.withdrawals.paid_total)],
      ["Withdrawal approval rate", pctText(data.withdrawals.approval_rate)],
      ["Avg decision hours", data.withdrawals.avg_decision_hours.toFixed(1)],
      ["Loans disbursed", formatMoney(data.loans.disbursed_total)],
      ["Loans repaid", formatMoney(data.loans.repaid_total)],
      ["Outstanding principal", formatMoney(data.loans.outstanding_principal)],
      ["On-time repayment rate", pctText(data.loans.on_time_rate)],
      ["Overdue instalments", String(data.loans.overdue_installments)],
      ["Cancellation requests", String(data.cancellations.total_requests)],
      ["Cancelled", String(data.cancellations.total_cancelled)],
      ["Cancellation rate", pctText(data.cancellations.cancellation_rate)],
      ["Admin-initiated cancellations", pctText(data.cancellations.admin_share)],
    ],
  };

  const savings: ReportSection = {
    name: "Savings growth series",
    note: "Deposits, withdrawals, net movement and cumulative balance per bucket.",
    columns: [
      { header: "Period" },
      { header: "Deposits", align: "right" },
      { header: "Withdrawals", align: "right" },
      { header: "Net", align: "right" },
      { header: "Cumulative", align: "right" },
    ],
    rows: data.savings.series.map((b) => [
      b.bucket,
      b.deposits,
      b.withdrawals,
      b.net,
      b.cumulative,
    ]),
  };

  const withdrawals: ReportSection = {
    name: "Withdrawal trend series",
    columns: [
      { header: "Period" },
      { header: "Requested", align: "right" },
      { header: "Approved", align: "right" },
      { header: "Paid", align: "right" },
      { header: "Rejected", align: "right" },
      { header: "Cancelled", align: "right" },
      { header: "Amount", align: "right" },
    ],
    rows: data.withdrawals.series.map((b) => [
      b.bucket,
      b.requested,
      b.approved,
      b.paid,
      b.rejected,
      b.cancelled,
      b.amount,
    ]),
  };

  const loans: ReportSection = {
    name: "Loan performance series",
    columns: [
      { header: "Period" },
      { header: "Disbursed", align: "right" },
      { header: "Repaid", align: "right" },
      { header: "Applications", align: "right" },
    ],
    rows: data.loans.series.map((b) => [b.bucket, b.disbursed, b.repaid, b.applications]),
  };

  const cancellations: ReportSection = {
    name: "Cancellation series",
    columns: [
      { header: "Period" },
      { header: "Requests", align: "right" },
      { header: "Cancelled", align: "right" },
      { header: "Admin cancelled", align: "right" },
      { header: "Member cancelled", align: "right" },
      { header: "Rate", align: "right" },
    ],
    rows: data.cancellations.series.map((b) => [
      b.bucket,
      b.total,
      b.cancelled,
      b.admin_cancelled,
      b.member_cancelled,
      pctText(b.rate),
    ]),
  };

  const sections: ReportSection[] = [
    kpi,
    savings,
    withdrawals,
    mixSection("Withdrawal status mix", data.withdrawals.status_mix),
    mixSection("Withdrawal channel mix", data.withdrawals.channel_mix),
    loans,
    mixSection("Loan status mix", data.loans.status_mix),
    mixSection("Loan product mix", data.loans.product_mix),
    cancellations,
    mixSection("Cancellation reason mix", data.cancellations.reason_mix),
  ].filter((s) => s.rows.length > 0);

  return {
    title: "Analytics dashboard report",
    subtitle,
    filename: `analytics_dashboard_${meta.from}_to_${meta.to}`,
    sections,
  };
}

/** Total data rows across all sections — used for audit metadata. */
export function reportRowCount(report: AnalyticsReport): number {
  return report.sections.reduce((n, s) => n + s.rows.length, 0);
}

// --------------------------------------------------------------------------
// CSV
// --------------------------------------------------------------------------

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Multi-section CSV: a titled block per dashboard panel. */
export function exportAnalyticsCsv(report: AnalyticsReport) {
  const cfg = getOrgConfig();
  const lines: string[] = [
    [BRAND.name].map(csvCell).join(","),
    [report.title].map(csvCell).join(","),
    [report.subtitle].map(csvCell).join(","),
    [`Currency: ${cfg.currency.code}`].map(csvCell).join(","),
    [`Generated: ${new Date().toISOString()}`].map(csvCell).join(","),
  ];

  for (const section of report.sections) {
    lines.push("");
    lines.push(csvCell(section.name));
    if (section.note) lines.push(csvCell(section.note));
    lines.push(section.columns.map((c) => csvCell(c.header)).join(","));
    for (const row of section.rows) lines.push(row.map(csvCell).join(","));
  }

  // BOM keeps Excel happy with UTF-8 currency symbols.
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  download(blob, `${safeFilename(report.filename)}_${nowStamp()}.csv`);
}

// --------------------------------------------------------------------------
// PDF
// --------------------------------------------------------------------------

/** Branded, paginated PDF with one table per dashboard panel. */
export async function exportAnalyticsPdf(report: AnalyticsReport) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const cfg = getOrgConfig();
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const drawHeader = () => {
    doc.setFillColor(BRAND.emerald);
    doc.rect(0, 0, pageW, 64, "F");
    doc.setFillColor(BRAND.gold);
    doc.rect(0, 64, pageW, 2, "F");
    doc.setTextColor(BRAND.cream);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(BRAND.name, 32, 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(BRAND.tagline, 32, 44);
    doc.text(`Currency: ${cfg.currency.code}`, 32, 55);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(report.title, pageW - 32, 30, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(report.subtitle, pageW - 32, 44, { align: "right" });
  };

  const drawFooter = (page: number, total: number) => {
    const y = pageH - 26;
    doc.setDrawColor(BRAND.gold);
    doc.setLineWidth(0.5);
    doc.line(32, y - 12, pageW - 32, y - 12);
    doc.setTextColor(90);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(BRAND.address, 32, y);
    doc.text(`Generated ${new Date().toLocaleString(cfg.currency.locale)}`, pageW / 2, y, {
      align: "center",
    });
    doc.setFont("helvetica", "bold");
    doc.text(`Page ${page} of ${total}`, pageW - 32, y, { align: "right" });
  };

  let cursorY = 92;
  report.sections.forEach((section, index) => {
    if (index > 0 && cursorY > pageH - 180) {
      doc.addPage();
      cursorY = 92;
    }
    doc.setTextColor(BRAND.emerald);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(section.name, 32, cursorY);
    if (section.note) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(110);
      doc.text(section.note, 32, cursorY + 11);
    }

    autoTable(doc, {
      head: [section.columns.map((c) => c.header)],
      body: section.rows.map((r) => r.map((cell) => String(cell))),
      startY: cursorY + (section.note ? 20 : 10),
      margin: { top: 92, bottom: 48, left: 32, right: 32 },
      styles: { font: "helvetica", fontSize: 8, cellPadding: 4, textColor: 30 },
      headStyles: { fillColor: BRAND.emerald, textColor: BRAND.cream, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 240, 224] },
      columnStyles: Object.fromEntries(
        section.columns.map((c, i) => [i, { halign: c.align ?? "left" }]),
      ),
      didDrawPage: () => drawHeader(),
    });

    const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    cursorY = (last?.finalY ?? cursorY) + 26;
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    drawFooter(i, pageCount);
  }

  doc.save(`${safeFilename(report.filename)}_${nowStamp()}.pdf`);
}
