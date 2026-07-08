import { FileDown, FileSpreadsheet, FileText, Lock, Printer } from "lucide-react";
import {
  exportCsv,
  exportExcel,
  exportPdf,
  exportPrint,
  type ExportColumn,
} from "@/lib/exports";
import { useAuth, type Permission } from "@/lib/auth";


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
  const opts = { title, subtitle, filename, columns, rows };

  const btn =
    "inline-flex items-center gap-1.5 rounded border border-emerald-deep/15 bg-card px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-deep hover:bg-cream transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-card";

  const guard = (fn: () => void) => () => {
    if (!allowed) {
      console.warn(`[RBAC] Blocked export — missing permission: ${permission}`);
      return;
    }
    fn();
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

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        className={btn}
        disabled={!allowed}
        onClick={guard(() => void exportPdf(opts))}
        title="Export PDF with QR + barcode"
      >
        <FileText className="h-3 w-3" /> PDF
      </button>
      <button
        className={btn}
        disabled={!allowed}
        onClick={guard(() => exportExcel(opts))}
        title="Export Excel workbook"
      >
        <FileSpreadsheet className="h-3 w-3" /> Excel
      </button>
      <button
        className={btn}
        disabled={!allowed}
        onClick={guard(() => exportCsv(opts))}
        title="Export CSV"
      >
        <FileDown className="h-3 w-3" /> CSV
      </button>
      <button
        className={btn}
        disabled={!allowed}
        onClick={guard(() => void exportPrint(opts))}
        title="Print-ready view"
      >
        <Printer className="h-3 w-3" /> Print
      </button>
    </div>
  );
}
