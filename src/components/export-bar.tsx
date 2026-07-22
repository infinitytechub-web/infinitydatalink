import { useState } from "react";
import { FileDown, FileSpreadsheet, FileText, Lock, Printer, SlidersHorizontal } from "lucide-react";
import {
  exportCsv,
  exportExcel,
  exportPdf,
  exportPrint,
  type ExportColumn,
} from "@/lib/exports";
import { useAuth, type Permission } from "@/lib/auth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";


type Props<T> = {
  title: string;
  subtitle?: string;
  filename?: string;
  columns: ExportColumn<T>[];
  rows: T[];
  /** Required RBAC permission. If the current session lacks it, controls are locked. */
  permission: Permission;
};

export function ExportBar<T>({ title, subtitle, filename, columns, rows, permission }: Props<T>) {
  const { user, hasPermission } = useAuth();
  const allowed = hasPermission(permission);
  // Column selection applies to CSV & Excel only; PDF/Print always render the full column set.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(columns.map((c) => c.header)));

  const selectedColumns = columns.filter((c) => selected.has(c.header));
  const csvExcelColumns = selectedColumns.length ? selectedColumns : columns;

  const opts = { title, subtitle, filename, columns, rows };
  const csvExcelOpts = { title, subtitle, filename, columns: csvExcelColumns, rows };

  const btn =
    "inline-flex items-center gap-1.5 rounded border border-emerald-deep/15 bg-card px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-deep hover:bg-cream transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-card";

  const guard = (fn: () => void | Promise<void>) => () => {
    if (!allowed) {
      console.warn(`[RBAC] Blocked export — missing permission: ${permission}`);
      return;
    }
    void fn();
  };

  const toggle = (header: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(header)) next.delete(header);
      else next.add(header);
      return next;
    });
  };

  if (!allowed) {
    return (
      <div
        className="inline-flex items-center gap-2 rounded border border-gold/30 bg-gold/10 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-gold"
        title={
          user
            ? `Requires permission: ${permission}. Sign in with a role that grants export access.`
            : "Admin sign-in required to export."
        }
      >
        <Lock className="h-3 w-3" />
        Export locked
      </div>
    );
  }

  const noneSelected = selectedColumns.length === 0;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        className={btn}
        onClick={guard(() => void exportPdf(opts))}
        title="Export PDF with QR + barcode (all columns)"
      >
        <FileText className="h-3 w-3" /> PDF
      </button>
      <button
        className={btn}
        disabled={noneSelected}
        onClick={guard(() => exportExcel(csvExcelOpts))}
        title={
          noneSelected
            ? "Select at least one column"
            : `Export Excel with ${selectedColumns.length} of ${columns.length} columns`
        }
      >
        <FileSpreadsheet className="h-3 w-3" /> Excel
      </button>
      <button
        className={btn}
        disabled={noneSelected}
        onClick={guard(() => exportCsv(csvExcelOpts))}
        title={
          noneSelected
            ? "Select at least one column"
            : `Export CSV with ${selectedColumns.length} of ${columns.length} columns`
        }
      >
        <FileDown className="h-3 w-3" /> CSV
      </button>
      <button
        className={btn}
        onClick={guard(() => void exportPrint(opts))}
        title="Print-ready view (all columns)"
      >
        <Printer className="h-3 w-3" /> Print
      </button>
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={btn}
            title="Choose columns for CSV & Excel"
            aria-label="Choose columns for CSV and Excel exports"
          >
            <SlidersHorizontal className="h-3 w-3" />
            <span className="tabular">
              {selectedColumns.length}/{columns.length}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-0">
          <div className="border-b border-emerald-deep/10 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-deep">
              CSV & Excel columns
            </p>
            <p className="mt-0.5 text-[10px] text-emerald-deep/60">
              PDF and Print always include every column.
            </p>
          </div>
          <ul className="max-h-64 overflow-auto py-1">
            {columns.map((c) => {
              const on = selected.has(c.header);
              return (
                <li key={c.header}>
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-emerald-deep hover:bg-cream/60">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(c.header)}
                      className="h-3 w-3 accent-emerald-deep"
                    />
                    <span className="truncate">{c.header}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-between gap-2 border-t border-emerald-deep/10 px-3 py-2">
            <button
              type="button"
              className="text-[10px] font-bold uppercase tracking-widest text-emerald-deep/70 hover:text-emerald-deep"
              onClick={() => setSelected(new Set(columns.map((c) => c.header)))}
            >
              Select all
            </button>
            <button
              type="button"
              className="text-[10px] font-bold uppercase tracking-widest text-emerald-deep/70 hover:text-emerald-deep"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
