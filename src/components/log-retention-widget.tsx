import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Clock, Trash2, Save, RefreshCw, AlertTriangle } from "lucide-react";
import { SectionCard } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getLogRetention,
  updateLogRetention,
  previewLogRetention,
  runManualLogPurge,
  type RetentionPolicy,
  type RetentionPreviewRow,
} from "@/lib/admin-log-retention.functions";

function fmtBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function LogRetentionWidget() {
  const qc = useQueryClient();
  const getFn = useServerFn(getLogRetention);
  const setFn = useServerFn(updateLogRetention);
  const previewFn = useServerFn(previewLogRetention);
  const purgeFn = useServerFn(runManualLogPurge);

  const policyQ = useQuery({
    queryKey: ["admin", "log-retention", "policy"],
    queryFn: () => getFn({}),
  });

  const [draft, setDraft] = useState<RetentionPolicy | null>(null);
  const current = draft ?? policyQ.data ?? null;

  const previewQ = useQuery({
    enabled: !!current,
    queryKey: [
      "admin",
      "log-retention",
      "preview",
      current?.retention_error_days,
      current?.retention_warning_days,
      current?.retention_info_days,
    ],
    queryFn: () =>
      previewFn({
        data: {
          error_days: current!.retention_error_days,
          warning_days: current!.retention_warning_days,
          info_days: current!.retention_info_days,
        },
      }),
  });

  const totals = useMemo(() => {
    const rows = (previewQ.data ?? []) as RetentionPreviewRow[];
    return rows.reduce(
      (acc, r) => ({
        del: acc.del + Number(r.rows_to_delete),
        keep: acc.keep + Number(r.rows_to_keep),
        delBytes: acc.delBytes + Number(r.bytes_to_delete),
        keepBytes: acc.keepBytes + Number(r.bytes_to_keep),
      }),
      { del: 0, keep: 0, delBytes: 0, keepBytes: 0 },
    );
  }, [previewQ.data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!current) return;
      await setFn({
        data: {
          auto_purge_enabled: current.auto_purge_enabled,
          retention_error_days: current.retention_error_days,
          retention_warning_days: current.retention_warning_days,
          retention_info_days: current.retention_info_days,
        },
      });
    },
    onSuccess: () => {
      toast.success("Retention policy saved");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["admin", "log-retention"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  const [purgeOpen, setPurgeOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const purgeMut = useMutation({
    mutationFn: () => purgeFn({ data: { confirm: "PURGE" as const } }),
    onSuccess: (r) => {
      toast.success(`Purged ${r.deleted} log entr${r.deleted === 1 ? "y" : "ies"}`);
      setPurgeOpen(false);
      setConfirm("");
      qc.invalidateQueries({ queryKey: ["admin", "runtime-error-logs"] });
      qc.invalidateQueries({ queryKey: ["admin", "log-retention"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Purge failed"),
  });

  if (policyQ.isLoading || !current) {
    return (
      <SectionCard title="Log retention policy">
        <div className="p-6 text-sm text-muted-foreground">Loading policy…</div>
      </SectionCard>
    );
  }
  if (policyQ.isError) {
    return (
      <SectionCard title="Log retention policy">
        <div className="p-6 text-sm text-rose-600">
          Failed to load retention policy. Super admin role required.
        </div>
      </SectionCard>
    );
  }

  const dirty = !!draft;
  const patch = (p: Partial<RetentionPolicy>) =>
    setDraft({ ...(draft ?? policyQ.data!), ...p });
  const preview = (previewQ.data ?? []) as RetentionPreviewRow[];

  return (
    <SectionCard
      title="Log retention policy"
      action={
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Clock className="size-3.5" />
          {current.last_purge_at
            ? `Last purge: ${new Date(current.last_purge_at).toLocaleString()} · ${current.last_purge_deleted ?? 0} deleted`
            : "Never purged"}
        </div>
      }
    >
      <div className="grid gap-4 p-4 md:grid-cols-4">
        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3 md:col-span-1">
          <div>
            <Label className="text-xs font-semibold">Auto purge</Label>
            <p className="text-[11px] text-muted-foreground">Runs daily at 03:15 UTC</p>
          </div>
          <Switch
            checked={current.auto_purge_enabled}
            onCheckedChange={(v) => patch({ auto_purge_enabled: v })}
          />
        </div>
        <RetentionField
          label="Errors kept"
          value={current.retention_error_days}
          onChange={(v) => patch({ retention_error_days: v })}
        />
        <RetentionField
          label="Warnings kept"
          value={current.retention_warning_days}
          onChange={(v) => patch({ retention_warning_days: v })}
        />
        <RetentionField
          label="Info kept"
          value={current.retention_info_days}
          onChange={(v) => patch({ retention_info_days: v })}
        />
      </div>

      <div className="border-t border-border/60 px-4 pb-4">
        <div className="mb-2 flex items-center justify-between pt-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <AlertTriangle className="size-3.5" />
            Expected impact under this policy
          </div>
          {previewQ.isFetching && (
            <span className="text-[11px] text-muted-foreground">calculating…</span>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Severity</th>
                <th className="p-2 text-right">Keep (days)</th>
                <th className="p-2 text-right">Rows total</th>
                <th className="p-2 text-right">To delete</th>
                <th className="p-2 text-right">Freed</th>
                <th className="p-2 text-right">Retained</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((r) => (
                <tr key={r.severity} className="border-t border-border/60">
                  <td className="p-2 font-semibold capitalize">{r.severity}</td>
                  <td className="p-2 text-right">{r.retention_days}</td>
                  <td className="p-2 text-right">{Number(r.rows_total).toLocaleString()}</td>
                  <td className="p-2 text-right text-rose-600">
                    {Number(r.rows_to_delete).toLocaleString()}
                  </td>
                  <td className="p-2 text-right text-rose-600">{fmtBytes(Number(r.bytes_to_delete))}</td>
                  <td className="p-2 text-right">{fmtBytes(Number(r.bytes_to_keep))}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                <td className="p-2">Total</td>
                <td className="p-2 text-right">—</td>
                <td className="p-2 text-right">{(totals.del + totals.keep).toLocaleString()}</td>
                <td className="p-2 text-right text-rose-600">{totals.del.toLocaleString()}</td>
                <td className="p-2 text-right text-rose-600">{fmtBytes(totals.delBytes)}</td>
                <td className="p-2 text-right">{fmtBytes(totals.keepBytes)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => previewQ.refetch()}
            disabled={previewQ.isFetching}
          >
            <RefreshCw className="mr-1 size-3.5" /> Recalculate
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPurgeOpen(true)}
            className="text-rose-600 hover:text-rose-700"
          >
            <Trash2 className="mr-1 size-3.5" /> Run purge now
          </Button>
          <Button
            size="sm"
            disabled={!dirty || saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            <Save className="mr-1 size-3.5" /> {dirty ? "Save policy" : "Saved"}
          </Button>
        </div>
      </div>

      <Dialog open={purgeOpen} onOpenChange={(o) => !o && setPurgeOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Purge runtime error logs</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              This will immediately delete{" "}
              <strong className="text-rose-600">{totals.del.toLocaleString()}</strong> log entr
              {totals.del === 1 ? "y" : "ies"} (~{fmtBytes(totals.delBytes)}) using the current
              retention values. This action is irreversible and will be recorded in the audit log.
            </p>
            <div>
              <Label className="text-xs">
                Type <span className="font-mono">PURGE</span> to confirm
              </Label>
              <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="PURGE" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurgeOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirm !== "PURGE" || purgeMut.isPending}
              onClick={() => purgeMut.mutate()}
            >
              <Trash2 className="mr-1 size-3.5" />
              {purgeMut.isPending ? "Purging…" : "Purge now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

function RetentionField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <Label className="text-xs font-semibold">{label}</Label>
      <div className="mt-1 flex items-center gap-2">
        <Input
          type="number"
          min={1}
          max={3650}
          value={value}
          onChange={(e) => onChange(Math.max(1, Math.min(3650, Number(e.target.value) || 1)))}
          className="h-8"
        />
        <span className="text-[11px] text-muted-foreground">days</span>
      </div>
    </div>
  );
}
