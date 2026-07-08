import { FileDown, FileSpreadsheet, FileText, Printer } from "lucide-react";
import {
  exportCsv,
  exportExcel,
  exportPdf,
  exportPrint,
  type ExportColumn,
} from "@/lib/exports";

type Props<T> = {
  title: string;
  subtitle?: string;
  filename?: string;
  columns: ExportColumn<T>[];
  rows: T[];
};

export function ExportBar<T>({ title, subtitle, filename, columns, rows }: Props<T>) {
  const opts = { title, subtitle, filename, columns, rows };
  const btn =
    "inline-flex items-center gap-1.5 rounded border border-emerald-deep/15 bg-card px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-deep hover:bg-cream transition-colors";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button className={btn} onClick={() => exportPdf(opts)} title="Export PDF with QR + barcode">
        <FileText className="h-3 w-3" /> PDF
      </button>
      <button className={btn} onClick={() => exportExcel(opts)} title="Export Excel workbook">
        <FileSpreadsheet className="h-3 w-3" /> Excel
      </button>
      <button className={btn} onClick={() => exportCsv(opts)} title="Export CSV">
        <FileDown className="h-3 w-3" /> CSV
      </button>
      <button className={btn} onClick={() => exportPrint(opts)} title="Print-ready view">
        <Printer className="h-3 w-3" /> Print
      </button>
    </div>
  );
}
