import { useState } from "react";
import { AlertTriangle, ArrowRight, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { archiveAuditEntries, archiveEventLogEntries } from "@/lib/log-purge.functions";

const CONFIRM_WORD = "PURGE";

/**
 * Bulk "move to recycle bin" control for the audit log and the event log.
 * Only super admins see it — the underlying RPCs enforce the same rule.
 *
 * Confirmation is deliberately two-step: step 1 previews exactly how many rows
 * will move and how long they stay restorable, step 2 requires typing PURGE.
 */
export function LogArchiveBar({
  kind,
  ids,
  onDone,
}: {
  kind: "audit" | "event";
  ids: string[];
  onDone: () => void;
}) {
  const { hasRole } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const archive = useServerFn(kind === "audit" ? archiveAuditEntries : archiveEventLogEntries);

  if (!hasRole("super_admin")) return null;

  const label = kind === "audit" ? "audit entries" : "events";
  const count = ids.length;

  const close = () => {
    if (busy) return;
    setOpen(false);
    setStep(1);
    setConfirmText("");
  };

  const run = async () => {
    if (confirmText.trim().toUpperCase() !== CONFIRM_WORD) return;
    setBusy(true);
    try {
      const res = await archive({ data: { ids } });
      toast.success(`${res.archived} ${label} moved to the recycle bin`, {
        description: "Restorable from the log recycle bin for 2 years.",
      });
      setOpen(false);
      setStep(1);
      setConfirmText("");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Purge failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={count === 0}
        onClick={() => {
          setStep(1);
          setConfirmText("");
          setOpen(true);
        }}
        className="text-rose-700"
      >
        <Trash2 className="mr-1 h-3.5 w-3.5" />
        Purge selected{count > 0 ? ` (${count})` : ""}
      </Button>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {step === 1
                ? `Review purge · ${count} ${label}`
                : `Confirm purge of ${count} ${label}`}
            </DialogTitle>
            <DialogDescription>
              {step === 1
                ? "Check the summary below before continuing. Nothing is removed yet."
                : `Type ${CONFIRM_WORD} to move these rows out of the active log.`}
            </DialogDescription>
          </DialogHeader>

          {step === 1 ? (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-emerald-deep/10 bg-cream/40 p-3">
                <p className="text-2xl font-semibold tabular-nums">{count}</p>
                <p className="text-xs text-muted-foreground">
                  selected {label} will be moved to the recycle bin
                </p>
              </div>
              <p className="flex items-start gap-2 rounded-lg border border-emerald-deep/10 p-3 text-xs text-muted-foreground">
                <Undo2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>Undo window:</strong> a full snapshot of each row is kept for 2 years
                  (730 days) and can be restored any time from the{" "}
                  <Link to="/admin/log-recycle-bin" className="underline">
                    log recycle bin
                  </Link>
                  . After that it is deleted automatically by retention policy.
                </span>
              </p>
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>This purge is itself recorded in the audit log with your name.</span>
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to confirm.
                Snapshots stay restorable for 2 years.
              </p>
              <Input
                aria-label={`Type ${CONFIRM_WORD} to confirm`}
                value={confirmText}
                maxLength={16}
                autoComplete="off"
                placeholder={CONFIRM_WORD}
                onChange={(e) => setConfirmText(e.target.value)}
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={close}>
              Cancel
            </Button>
            {step === 1 ? (
              <Button disabled={count === 0} onClick={() => setStep(2)}>
                Continue
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                variant="destructive"
                disabled={busy || count === 0 || confirmText.trim().toUpperCase() !== CONFIRM_WORD}
                onClick={run}
              >
                {busy ? "Purging…" : "Move to recycle bin"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
