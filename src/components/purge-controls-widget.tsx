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
  recycleNotifications,
  purgeAuditLog,
  purgeRecycleBin,
} from "@/lib/notifications.functions";
import { purgeAllLogEntries } from "@/lib/log-purge.functions";
import { useAuth } from "@/lib/auth";

type PurgeKind =
  | "notifications"
  | "read-notifications"
  | "audit"
  | "audit-all"
  | "system"
  | "recycle";
type NoteScope = "read" | "unread" | "all" | "system";

const NOTE_SCOPES: { value: NoteScope; label: string; hint: string }[] = [
  { value: "read", label: "Read only", hint: "Alerts the recipient already opened" },
  { value: "unread", label: "Unread only", hint: "Alerts never opened" },
  { value: "all", label: "Everything", hint: "Every in-app notification" },
  {
    value: "system",
    label: "System-audited",
    hint: "Internal system/audit alerts, incl. KYC auto-flag signals",
  },
];

const TITLES: Record<PurgeKind, string> = {
  notifications: "Clear notifications",
  "read-notifications": "Delete all read messages",
  audit: "Purge audit log",
  "audit-all": "Delete every audit entry",
  system: "Delete every system log",
  recycle: "Empty recycle bin",
};

export function PurgeControlsWidget() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState<PurgeKind | null>(null);
  const [confirm, setConfirm] = useState("");
  const [days, setDays] = useState(365);

  const [noteScope, setNoteScope] = useState<NoteScope>("read");
  const nFn = useServerFn(recycleNotifications);
  const aFn = useServerFn(purgeAuditLog);
  const rFn = useServerFn(purgeRecycleBin);
  const logsFn = useServerFn(purgeAllLogEntries);

  const purgeMut = useMutation({
    mutationFn: async () => {
      if (open === "notifications")
        return {
          label: "notifications moved to the recycle bin",
          n: (await nFn({ data: { scope: noteScope, retention_days: 30, confirm: "PURGE" } }))
            .deleted,
        };
      if (open === "read-notifications")
        return {
          label: "read messages moved to the recycle bin",
          n: (await nFn({ data: { scope: "read", retention_days: 30, confirm: "PURGE" } })).deleted,
        };
      if (open === "audit")
        return {
          label: "audit entries",
          n: (await aFn({ data: { older_than_days: days, confirm: "PURGE" } })).deleted,
        };
      if (open === "audit-all" || open === "system") {
        const scope = open === "audit-all" ? ("audit" as const) : ("system" as const);
        const r = await logsFn({ data: { scope, confirm: "PURGE" } });
        return {
          label: `${scope === "audit" ? "audit" : "system log"} entries archived${r.remaining ? " — run again to continue" : ""}`,
          n: r.archived,
        };
      }
      return {
        label: "recycle-bin entries",
        n: (await rFn({ data: { all: true, confirm: "PURGE" } })).deleted,
      };
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
          hint="Move alerts to the recycle bin (30-day restore)"
          onClick={() => {
            setOpen("notifications");
            setConfirm("");
          }}
          danger
        />
        <PurgeTile
          label="Read messages"
          hint="Clear every alert recipients already opened"
          onClick={() => {
            setOpen("read-notifications");
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
          label="Audit trail — all"
          hint="Archive every audit entry (restorable)"
          onClick={() => {
            setOpen("audit-all");
            setConfirm("");
          }}
          danger
        />
        <PurgeTile
          label="System logs"
          hint="Archive every runtime/system log entry"
          onClick={() => {
            setOpen("system");
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
            <DialogTitle>{open ? TITLES[open] : "Purge"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {open === "notifications" || open === "read-notifications"
                ? "Selected notifications move to the recycle bin and can be restored for 30 days."
                : open === "audit-all" || open === "system"
                  ? "Entries are snapshotted into the log recycle bin before deletion, in batches of 500 (up to 10,000 per click)."
                  : "This is irreversible."}{" "}
              An audit entry will be recorded for the action.
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
            ) : open === "notifications" ? (
              <div className="space-y-2">
                <Label className="text-xs">Which notifications?</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {NOTE_SCOPES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setNoteScope(s.value)}
                      className={`rounded-lg border p-2 text-left text-xs transition ${
                        noteScope === s.value
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <span className="block font-semibold">{s.label}</span>
                      <span className="block text-[11px] text-muted-foreground">{s.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div>
              <Label className="text-xs">
                Type <span className="font-mono">PURGE</span> to confirm
              </Label>
              <Input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="PURGE"
              />
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
