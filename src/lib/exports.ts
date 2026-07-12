// Export utilities for admin tables: PDF (with QR/barcode + header/footer),
// Excel, CSV, and Print. Client-side only.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import { getOrgConfig } from "./org-config";

export type ExportColumn<T> = {
  header: string;
  accessor: (row: T) => string | number;
  align?: "left" | "right" | "center";
};

export type ExportOptions<T> = {
  title: string;
  subtitle?: string;
  filename?: string;
  columns: ExportColumn<T>[];
  rows: T[];
  docId?: string; // used for QR + barcode content
};

const BRAND = {
  name: "Infinity Wealth",
  tagline: "Enterprise Financial Management · Savings · Loans · Payments",
  address: "Institutional Portal · Confidential",
  emerald: "#064e3b",
  gold: "#c9a84c",
  cream: "#f5f0e0",
};

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function safeFilename(name: string) {
  return name.replace(/[^a-z0-9-_]+/gi, "_");
}

function generateDocId(prefix = "IW") {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${y}${m}${day}-${rand}`;
}

async function makeQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    margin: 0,
    width: 220,
    color: { dark: BRAND.emerald, light: "#ffffff" },
  });
}

function makeBarcodeDataUrl(text: string): string {
  const canvas = document.createElement("canvas");
  JsBarcode(canvas, text, {
    format: "CODE128",
    displayValue: false,
    height: 40,
    margin: 0,
    lineColor: BRAND.emerald,
  });
  return canvas.toDataURL("image/png");
}

// ----------------------- PDF -----------------------
export async function exportPdf<T>(opts: ExportOptions<T>) {
  const cfg = getOrgConfig();
  const docId = opts.docId || generateDocId();
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const qrDataUrl = await makeQrDataUrl(
    JSON.stringify({ id: docId, title: opts.title, org: cfg.name, ts: new Date().toISOString() }),
  );
  const barcodeDataUrl = makeBarcodeDataUrl(docId);

  const drawHeader = () => {
    // Emerald band
    doc.setFillColor(BRAND.emerald);
    doc.rect(0, 0, pageW, 70, "F");
    // Gold accent line
    doc.setFillColor(BRAND.gold);
    doc.rect(0, 70, pageW, 2, "F");

    doc.setTextColor(BRAND.cream);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(BRAND.name, 32, 32);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(BRAND.tagline, 32, 46);
    doc.text(`Region: ${cfg.name} · Currency: ${cfg.currency.code}`, 32, 58);

    // Title on right
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(opts.title, pageW - 32, 32, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    if (opts.subtitle) doc.text(opts.subtitle, pageW - 32, 46, { align: "right" });
    doc.text(`Doc ID: ${docId}`, pageW - 32, 58, { align: "right" });

    // QR top-right corner (below band)
    doc.addImage(qrDataUrl, "PNG", pageW - 78, 82, 56, 56);
  };

  const drawFooter = (pageNum: number, pageCount: number) => {
    const y = pageH - 46;
    doc.setDrawColor(BRAND.gold);
    doc.setLineWidth(0.5);
    doc.line(32, y, pageW - 32, y);

    // Barcode bottom-left
    doc.addImage(barcodeDataUrl, "PNG", 32, y + 6, 140, 26);

    doc.setTextColor(80);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(BRAND.address, pageW / 2, y + 16, { align: "center" });
    doc.text(
      `Generated ${new Date().toLocaleString(cfg.currency.locale)}`,
      pageW / 2,
      y + 28,
      { align: "center" },
    );
    doc.setFont("helvetica", "bold");
    doc.text(`Page ${pageNum} of ${pageCount}`, pageW - 32, y + 22, { align: "right" });
  };

  const head = [opts.columns.map((c) => c.header)];
  const body = opts.rows.map((r) => opts.columns.map((c) => String(c.accessor(r))));

  autoTable(doc, {
    head,
    body,
    startY: 150,
    margin: { top: 150, bottom: 60, left: 32, right: 32 },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 6, textColor: 30 },
    headStyles: { fillColor: BRAND.emerald, textColor: BRAND.cream, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 240, 224] },
    columnStyles: Object.fromEntries(
      opts.columns.map((c, i) => [i, { halign: c.align || "left" }]),
    ),
    didDrawPage: () => {
      drawHeader();
    },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    drawFooter(i, pageCount);
  }

  const filename = `${safeFilename(opts.filename || opts.title)}_${nowStamp()}.pdf`;
  doc.save(filename);
}

// ----------------------- Excel -----------------------
export function exportExcel<T>(opts: ExportOptions<T>) {
  const cfg = getOrgConfig();
  const docId = opts.docId || generateDocId();
  const headerRows = [
    [BRAND.name],
    [BRAND.tagline],
    [`Report: ${opts.title}`],
    ...(opts.subtitle ? [[`Subtitle: ${opts.subtitle}`]] : []),
    [`Region: ${cfg.name}   Currency: ${cfg.currency.code}`],
    [`Doc ID: ${docId}`],
    [`Generated: ${new Date().toLocaleString(cfg.currency.locale)}`],
    [],
    opts.columns.map((c) => c.header),
    ...opts.rows.map((r) => opts.columns.map((c) => c.accessor(r))),
    [],
    [BRAND.address],
  ];
  const ws = XLSX.utils.aoa_to_sheet(headerRows);
  ws["!cols"] = opts.columns.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, opts.title.slice(0, 28));
  XLSX.writeFile(wb, `${safeFilename(opts.filename || opts.title)}_${nowStamp()}.xlsx`);
}

// ----------------------- CSV -----------------------
export function exportCsv<T>(opts: ExportOptions<T>) {
  const cfg = getOrgConfig();
  const docId = opts.docId || generateDocId();
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [];
  lines.push(`# ${BRAND.name}`);
  lines.push(`# ${BRAND.tagline}`);
  lines.push(`# Report: ${opts.title}`);
  if (opts.subtitle) lines.push(`# Subtitle: ${opts.subtitle}`);
  lines.push(`# Region: ${cfg.name}   Currency: ${cfg.currency.code}`);
  lines.push(`# Doc ID: ${docId}`);
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(opts.columns.map((c) => escape(c.header)).join(","));
  for (const r of opts.rows) {
    lines.push(opts.columns.map((c) => escape(c.accessor(r))).join(","));
  }
  lines.push("");
  lines.push(`# ${BRAND.address}`);

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFilename(opts.filename || opts.title)}_${nowStamp()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ----------------------- Print -----------------------
export async function exportPrint<T>(opts: ExportOptions<T>) {
  const cfg = getOrgConfig();
  const docId = opts.docId || generateDocId();
  const qr = await makeQrDataUrl(
    JSON.stringify({ id: docId, title: opts.title, org: cfg.name, ts: new Date().toISOString() }),
  );
  const barcode = makeBarcodeDataUrl(docId);
  const win = window.open("", "_blank", "width=1100,height=800");
  if (!win) return;

  const rowsHtml = opts.rows
    .map(
      (r) =>
        `<tr>${opts.columns
          .map(
            (c) =>
              `<td style="text-align:${c.align || "left"}">${String(c.accessor(r))
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");

  const headHtml = opts.columns
    .map((c) => `<th style="text-align:${c.align || "left"}">${c.header}</th>`)
    .join("");

  win.document.write(`<!doctype html><html><head><meta charset="utf-8"/>
  <title>${opts.title} · ${BRAND.name}</title>
  <style>
    @page { size: A4 landscape; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #0b1f1a; margin: 0; }
    .header { display:flex; justify-content:space-between; align-items:flex-start;
      background:${BRAND.emerald}; color:${BRAND.cream}; padding:16px 20px;
      border-bottom:2px solid ${BRAND.gold}; }
    .brand h1 { margin:0; font-size:18px; letter-spacing:0.5px; }
    .brand p { margin:2px 0; font-size:10px; opacity:0.9; }
    .meta { text-align:right; font-size:10px; }
    .meta h2 { margin:0; font-size:13px; }
    .qr { margin-top:8px; }
    .qr img { width:64px; height:64px; background:#fff; padding:4px; }
    .body { padding:16px 20px; }
    table { width:100%; border-collapse: collapse; font-size:11px; }
    thead th { background:${BRAND.emerald}; color:${BRAND.cream}; text-align:left;
      padding:8px; font-weight:700; text-transform:uppercase; font-size:9px; letter-spacing:1px; }
    tbody td { padding:8px; border-bottom:1px solid #e6e0cc; }
    tbody tr:nth-child(even) td { background:${BRAND.cream}; }
    .footer { position: fixed; bottom: 0; left: 0; right: 0;
      display:flex; justify-content:space-between; align-items:center;
      border-top:1px solid ${BRAND.gold}; padding:8px 20px; font-size:9px; color:#333;
      background:#fff; }
    .footer img { height:34px; }
    @media print { .noprint { display:none; } .footer { position: fixed; } }
    .toolbar { padding:10px 20px; background:#f4f4f4; border-bottom:1px solid #ddd; }
    .toolbar button { padding:6px 14px; font-weight:600; cursor:pointer; }
  </style></head><body>
    <div class="toolbar noprint">
      <button onclick="window.print()">Print</button>
      <button onclick="window.close()">Close</button>
    </div>
    <div class="header">
      <div class="brand">
        <h1>${BRAND.name}</h1>
        <p>${BRAND.tagline}</p>
        <p>Region: ${cfg.name} · Currency: ${cfg.currency.code}</p>
      </div>
      <div class="meta">
        <h2>${opts.title}</h2>
        ${opts.subtitle ? `<p>${opts.subtitle}</p>` : ""}
        <p>Doc ID: ${docId}</p>
        <p>Generated: ${new Date().toLocaleString(cfg.currency.locale)}</p>
        <div class="qr"><img src="${qr}" alt="Document verification QR code"/></div>
      </div>
    </div>
    <div class="body">
      <table>
        <thead><tr>${headHtml}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div style="height:80px"></div>
    </div>
    <div class="footer">
      <img src="${barcode}" alt="Document identifier barcode"/>
      <div style="text-align:center; flex:1">
        ${BRAND.address}<br/>
        Doc ID ${docId} · ${new Date().toISOString()}
      </div>
      <div style="font-weight:700">${BRAND.name}</div>
    </div>
  </body></html>`);
  win.document.close();
}
