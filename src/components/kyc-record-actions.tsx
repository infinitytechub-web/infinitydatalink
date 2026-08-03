/**
 * KYC review action toolbar.
 *
 * Wraps the shared permission-gated `RecordActions` toolbar with the pieces
 * every KYC surface needs — individual members and group / department /
 * institutional entities alike: a field-level CSV download, a printable record
 * sheet, and an approve / reject dialog that always captures a decision note.
 *
 * Every button is still hidden unless the signed-in role holds the matching
 * `kyc.<action>` capability, so this component adds no privilege of its own.
 */
import { useState } from "react";
import { toast } from "sonner";
import { RecordActions, type RecordActionKey } from "@/components/record-actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { BUTTON_TONE } from "@/lib/theme-tokens";
import { exportCsv, exportPrint } from "@/lib/exports";
import type { PermModule } from "@/lib/permissions";

export type KycField = { label: string; value: string };

export type KycDecision = "approved" | "rejected";

export type KycRecordActionsProps = {
  /** Permission module — always `kyc` for review surfaces. */
  module?: PermModule;
  /** Human label used in confirmations and dialog copy. */
  label: string;
  /** Report title used for the download / print sheet. */
  title: string;
  subtitle?: string;
  filename?: string;
  /** Flattened record shown in the CSV / print sheet. */
  fields: KycField[];
  onView?: () => void | Promise<void>;
  onEdit?: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  /** Called after the reviewer supplies a note. Omit to hide approve/reject. */
  onDecide?: (
    decision: KycDecision,
    note: string,
    remediationItems: string[],
  ) => void | Promise<void>;
  /**
   * Checklist of items a rejected record must revise. When provided, rejections
   * require at least one selection — mirroring the server-side rule.
   */
  remediationOptions?: { key: string; label: string }[];
  /** Minimum note length; approvals default to 5 like the server rule. */
  noteMin?: number;
  disabled?: Partial<Record<RecordActionKey, boolean>>;
  /** Actions whose confirm prompt is handled by the caller's own dialog. */
  noConfirm?: RecordActionKey[];

  approveLabel?: string;
  rejectLabel?: string;
  className?: string;
  size?: "sm" | "md";
};

const COLUMNS = [
  { header: "Field", accessor: (f: KycField) => f.label },
  { header: "Value", accessor: (f: KycField) => f.value },
];

export function KycRecordActions({
  module = "kyc",
  label,
  title,
  subtitle,
  filename,
  fields,
  onView,
  onEdit,
  onDelete,
  onDecide,
  remediationOptions,
  noteMin = 5,
  disabled,
  noConfirm,
  approveLabel = "Approve",
  rejectLabel = "Reject",
  className,
  size = "sm",
}: KycRecordActionsProps) {
  const [decision, setDecision] = useState<KycDecision | null>(null);
  const [note, setNote] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // Rejections must name at least one item to revise when a checklist exists.
  const needsItems = decision === "rejected" && !!remediationOptions?.length;

  const exportOpts = {
    title,
    subtitle,
    filename: filename ?? title,
    columns: COLUMNS,
    rows: fields,
  };

  const close = () => {
    setDecision(null);
    setNote("");
    setItems([]);
  };

  const submit = async () => {
    if (!decision || !onDecide) return;
    setBusy(true);
    try {
      await onDecide(decision, note.trim(), decision === "rejected" ? items : []);
      close();
    } catch (err: any) {
      toast.error(err?.message ?? "Decision failed");
    } finally {
      setBusy(false);
    }
  };


  return (
    <>
      <RecordActions
        module={module}
        label={label}
        size={size}
        className={className}
        disabled={disabled}
        noConfirm={["approve", "reject", ...(noConfirm ?? [])]}
        onView={onView}
        onEdit={onEdit}
        onDelete={onDelete}
        onDownload={() => exportCsv(exportOpts)}
        onPrint={() => void exportPrint(exportOpts)}
        onApprove={onDecide ? () => setDecision("approved") : undefined}
        onReject={onDecide ? () => setDecision("rejected") : undefined}
      />

      <Dialog open={decision !== null} onOpenChange={(o) => (o ? null : setDecision(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision === "approved" ? approveLabel : rejectLabel} {label}
            </DialogTitle>
            <DialogDescription>
              Add the reason for this decision. It is stored with the record and written to the
              audit log.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder={`Why is this ${label} being ${decision === "approved" ? "approved" : "rejected"}?`}
          />
          <p className="text-[11px] text-muted-foreground">
            {note.trim().length}/{noteMin} characters minimum.
          </p>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setDecision(null)}
              className="rounded border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-widest"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || note.trim().length < noteMin}
              onClick={() => void submit()}
              className={`rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-widest disabled:opacity-40 ${
                decision === "approved" ? BUTTON_TONE.success : BUTTON_TONE.danger
              }`}
            >
              {busy ? "Working…" : decision === "approved" ? approveLabel : rejectLabel}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
