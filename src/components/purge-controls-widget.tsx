import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Trash2, AlertTriangle } from "lucide-react";
import { SectionCard } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  purgeNotifications,
  purgeAuditLog,
  purgeRecycleBin,
} from "@/lib/notifications.functions";
import { useAuth } from "@/lib/auth";

type PurgeKind = "notifications-read" | "notifications-all" | "audit" | "recycle";

export function PurgeControlsWidget() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState<PurgeKind | null>(null);
  const [confirm, setConfirm] = useState("");
  const [days, setDays] = useState(365);

  const nFn = useServerFn(purgeNotifications);
  const aFn = useServerFn(purgeAuditLog);
  const rFn = useServerFn(purgeRecycleBin);

  const purgeMut = useMutation({
    mutationFn: async () => {
      if (open === "notifications-read")
        return { label: "notifications", n: (await nFn({ data: { scope: "read", confirm: "PURGE" } })).deleted };
      if (open === "notifications-all")
        return { label: "notifications", n: (await nFn({ data: { scope: "all", confirm: "PURGE" } })).deleted };
      if (open === "audit")
        return {
          label: "audit entries",
          n: (await aFn({ data: { older_than_days: days, confirm: "PURGE" } })).deleted,
        };
      return { label: "recycle-bin entries", n: (await rFn({ data: { all: true, confirm: "PURGE" } })).deleted };
    },
    onSuccess: (r) => {
      toast.success(`Purged ${r.n} ${r.label}`);
      qc.invalidateQueries();
      setOpen(null);
      setConfirm("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Purge failed"),
  });

  if (!hasRole("super_admin")) return null;

  return (
    <SectionCard
      title="Purge & maintenance"
      action={
        <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300">
          <AlertTriangle className="size-3.5" /> Super admin only
        </span>
      }
    >
      <div className="grid gap-3 md:grid-cols-3">
        <PurgeTile
          label="Notifications"
          hint="Delete read notifications"
          onClick={() => {
            setOpen("notifications-read");
            setConfirm("");
          }}
          danger
        />
        <PurgeTile
          label="Audit trail"
          hint="Delete entries older than N days"
          onClick={() => {
            setOpen("audit");
            setConfirm("");
          }}
          danger
        />
        <PurgeTile
          label="Recycle bin"
          hint="Empty soft-deleted records"
          onClick={() => {
            setOpen("recycle");
            setConfirm("");
          }}
          danger
        />
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {open === "audit"
                ? "Purge audit log"
                : open === "recycle"
                  ? "Empty recycle bin"
                  : "Purge notifications"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              This is irreversible. An audit entry will be recorded for the purge action.
            </p>
            {open === "audit" ? (
              <div>
                <Label className="text-xs">Older than (days)</Label>
                <Input
                  type="number"
                  min={7}
                  max={3650}
                  value={days}
                  onChange={(e) => setDays(Math.max(7, Number(e.target.value) || 365))}
                />
              </div>
            ) : open === "notifications-read" ? (
              <p>
                <button
                  className="text-xs text-primary underline"
                  onClick={() => setOpen("notifications-all")}
                >
                  Switch to purge ALL notifications (including unread)
                </button>
              </p>
            ) : null}
            <div>
              <Label className="text-xs">
                Type <span className="font-mono">PURGE</span> to confirm
              </Label>
              <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="PURGE" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirm !== "PURGE" || purgeMut.isPending}
              onClick={() => purgeMut.mutate()}
            >
              <Trash2 className="mr-1 size-3.5" />
              {purgeMut.isPending ? "Purging…" : "Purge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

function PurgeTile({
  label,
  hint,
  onClick,
  danger,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex flex-col items-start rounded-xl border p-4 text-left transition hover:shadow-md ${
        danger
          ? "border-red-200 bg-red-50/60 hover:bg-red-50 dark:border-red-900/40 dark:bg-red-950/20"
          : "border-border bg-card"
      }`}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className="mt-1 text-xs text-muted-foreground">{hint}</span>
      <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-red-700 dark:text-red-300">
        <Trash2 className="size-3" /> Purge
      </span>
    </button>
  );
}
