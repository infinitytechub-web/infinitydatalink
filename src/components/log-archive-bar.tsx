import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
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

/**
 * Bulk "move to recycle bin" control for the audit log and the event log.
 * Only super admins see it — the underlying RPCs enforce the same rule.
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
  const [busy, setBusy] = useState(false);
  const archive = useServerFn(kind === "audit" ? archiveAuditEntries : archiveEventLogEntries);

  if (!hasRole("super_admin")) return null;

  const label = kind === "audit" ? "audit entries" : "events";

  const run = async () => {
    setBusy(true);
    try {
      const res = await archive({ data: { ids } });
      toast.success(`${res.archived} ${label} moved to the recycle bin`);
      setOpen(false);
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
        disabled={ids.length === 0}
        onClick={() => setOpen(true)}
        className="text-rose-700"
      >
        <Trash2 className="mr-1 h-3.5 w-3.5" />
        Purge selected{ids.length > 0 ? ` (${ids.length})` : ""}
      </Button>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move {ids.length} {label} to recycle bin</DialogTitle>
            <DialogDescription>
              A full snapshot of each entry is stored in the recycle bin for 2 years, where it can
              be reviewed or restored. This purge is itself recorded in the audit log with your
              name.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy} onClick={run}>
              {busy ? "Purging…" : "Move to recycle bin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
