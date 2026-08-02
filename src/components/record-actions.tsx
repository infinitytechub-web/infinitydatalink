/**
 * Shared, permission-aware administrative action toolbar.
 *
 * Every admin table/detail view renders the same set of controls — View, Edit,
 * Delete, Download, Print, Approve, Reject — and each button is hidden unless
 * the signed-in role holds the matching `module.action` capability from the
 * database permission matrix. Handlers stay in the caller so each module keeps
 * its own business logic.
 */
import { useState, type ReactNode } from "react";
import {
  Check,
  Download,
  Eye,
  Pencil,
  Printer,
  Trash2,
  X,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import type { PermAction, PermModule } from "@/lib/permissions";

export type RecordActionKey =
  | "view"
  | "edit"
  | "delete"
  | "download"
  | "print"
  | "approve"
  | "reject";

type Handler = () => void | Promise<void>;

export type RecordActionsProps = {
  /** Permission module the record belongs to, e.g. `"kyc"` or `"loans"`. */
  module: PermModule;
  /** Human label used in confirmation copy, e.g. "KYC application". */
  label?: string;
  onView?: Handler;
  onEdit?: Handler;
  onDelete?: Handler;
  onDownload?: Handler;
  onPrint?: Handler;
  onApprove?: Handler;
  onReject?: Handler;
  /** Actions to render as disabled (e.g. already-approved records). */
  disabled?: Partial<Record<RecordActionKey, boolean>>;
  /** Actions that should skip the built-in confirm prompt (caller shows its own dialog). */
  noConfirm?: RecordActionKey[];
  /** Extra buttons rendered after the standard set. */
  extra?: ReactNode;
  size?: "sm" | "md";
  className?: string;
};


const ACTION_META: Record<
  RecordActionKey,
  { permission: PermAction; icon: ReactNode; label: string; tone: string; confirm?: boolean }
> = {
  view: {
    permission: "view",
    icon: <Eye className="h-3.5 w-3.5" />,
    label: "View",
    tone: "text-royal hover:bg-royal/10",
  },
  edit: {
    permission: "edit",
    icon: <Pencil className="h-3.5 w-3.5" />,
    label: "Edit",
    tone: "text-emerald-deep hover:bg-emerald-mid/10",
  },
  approve: {
    permission: "approve",
    icon: <Check className="h-3.5 w-3.5" />,
    label: "Approve",
    tone: "text-emerald-mid hover:bg-emerald-mid/10",
    confirm: true,
  },
  reject: {
    permission: "reject",
    icon: <X className="h-3.5 w-3.5" />,
    label: "Reject",
    tone: "text-destructive hover:bg-destructive/10",
    confirm: true,
  },
  download: {
    permission: "download",
    icon: <Download className="h-3.5 w-3.5" />,
    label: "Download",
    tone: "text-muted-foreground hover:bg-muted",
  },
  print: {
    permission: "print",
    icon: <Printer className="h-3.5 w-3.5" />,
    label: "Print",
    tone: "text-muted-foreground hover:bg-muted",
  },
  delete: {
    permission: "delete",
    icon: <Trash2 className="h-3.5 w-3.5" />,
    label: "Delete",
    tone: "text-destructive hover:bg-destructive/10",
    confirm: true,
  },
};

const ORDER: RecordActionKey[] = [
  "view",
  "edit",
  "approve",
  "reject",
  "download",
  "print",
  "delete",
];

export function RecordActions({
  module,
  label = "record",
  onView,
  onEdit,
  onDelete,
  onDownload,
  onPrint,
  onApprove,
  onReject,
  disabled,
  extra,
  size = "sm",
  className,
}: RecordActionsProps) {
  const { can } = useAuth();
  const [busy, setBusy] = useState<RecordActionKey | null>(null);

  const handlers: Partial<Record<RecordActionKey, Handler | undefined>> = {
    view: onView,
    edit: onEdit,
    approve: onApprove,
    reject: onReject,
    download: onDownload,
    print: onPrint,
    delete: onDelete,
  };

  const run = async (key: RecordActionKey, handler: Handler) => {
    const meta = ACTION_META[key];
    if (meta.confirm && typeof window !== "undefined") {
      const ok = window.confirm(`${meta.label} this ${label}? This action is audit-logged.`);
      if (!ok) return;
    }
    setBusy(key);
    try {
      await handler();
    } finally {
      setBusy(null);
    }
  };

  const visible = ORDER.filter((key) => {
    const handler = handlers[key];
    return !!handler && can(module, ACTION_META[key].permission);
  });

  if (visible.length === 0 && !extra) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)} role="group" aria-label={`${label} actions`}>
      {visible.map((key) => {
        const meta = ACTION_META[key];
        const handler = handlers[key]!;
        const isDisabled = !!disabled?.[key] || busy !== null;
        return (
          <button
            key={key}
            type="button"
            title={meta.label}
            aria-label={`${meta.label} ${label}`}
            disabled={isDisabled}
            onClick={() => void run(key, handler)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border border-border/60 font-semibold uppercase tracking-wider transition disabled:cursor-not-allowed disabled:opacity-40",
              size === "sm" ? "px-2 py-1 text-[10px]" : "px-2.5 py-1.5 text-xs",
              meta.tone,
            )}
          >
            {busy === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : meta.icon}
            <span className="hidden sm:inline">{meta.label}</span>
          </button>
        );
      })}
      {extra}
    </div>
  );
}

/** Convenience guard for rendering any permission-gated block. */
export function IfCan({
  module,
  action,
  children,
  fallback = null,
}: {
  module: PermModule;
  action: PermAction;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can } = useAuth();
  return <>{can(module, action) ? children : fallback}</>;
}
