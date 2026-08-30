/**
 * Vault retention policy panel — super-admin only.
 *
 * Configures how long archived KYC snapshots are kept before the scheduled
 * secure purge destroys them, and allows a manual (audited) purge run.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarClock, Timer, Trash2 } from "lucide-react";
import { SectionCard } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getVaultRetention,
  previewVaultPurge,
  runVaultPurge,
  updateVaultRetention,
} from "@/lib/kyc-vault-retention.functions";

export function VaultRetentionPanel() {
  const qc = useQueryClient();
  const getFn = useServerFn(getVaultRetention);
  const updateFn = useServerFn(updateVaultRetention);
  const previewFn = useServerFn(previewVaultPurge);
  const purgeFn = useServerFn(runVaultPurge);

  const { data, error } = useQuery({
    queryKey: ["kyc-vault-retention"],
    queryFn: () => getFn(),
    retry: false,
  });

  const [enabled, setEnabled] = useState(false);
  const [years, setYears] = useState(7);
  const [holdDays, setHoldDays] = useState(30);
  const [reason, setReason] = useState("");
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeReason, setPurgeReason] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    if (!data) return;
    setEnabled(data.policy.auto_purge_enabled);
    setYears(data.policy.retention_years);
    setHoldDays(data.policy.legal_hold_days);
  }, [data]);

  const saveMut = useMutation({
    mutationFn: async () =>
      await updateFn({
        data: {
          auto_purge_enabled: enabled,
          retention_years: years,
          legal_hold_days: holdDays,
          reason: reason.trim(),
        },
      }),
    onSuccess: (res) => {
      toast.success(`Retention policy saved · ${res.entries_rescheduled} snapshot(s) rescheduled`);
      setReason("");
      void qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save policy"),
  });

  const previewMut = useMutation({
    mutationFn: async () => await previewFn({}),
    onSuccess: (res) => {
      toast.info(
        `${res.entries_purged} snapshot(s) and ${res.documents_purged} document(s) are due for removal`,
      );
    },
    onError: (e: any) => toast.error(e?.message ?? "Preview failed"),
  });

  const purgeMut = useMutation({
    mutationFn: async () =>
      await purgeFn({ data: { confirm: "PURGE" as const, reason: purgeReason.trim() } }),
    onSuccess: (res) => {
      if (res.failed > 0) toast.warning(`${res.entries_purged} purged · ${res.failed} failed`);
      else
        toast.success(
          `${res.entries_purged} snapshot(s) and ${res.documents_purged} document(s) permanently removed`,
        );
      setPurgeOpen(false);
      setPurgeReason("");
      setConfirm("");
      void qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e?.message ?? "Purge failed"),
  });

  if (error) return null; // not a super admin — panel stays hidden

  const dirty =
    !!data &&
    (enabled !== data.policy.auto_purge_enabled ||
      years !== data.policy.retention_years ||
      holdDays !== data.policy.legal_hold_days);

  return (
    <SectionCard
      title="Retention & secure purge"
      action={
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Timer className="size-3.5" /> Super admin only
        </span>
      }
    >
      <div className="space-y-5 px-6 py-5">
        <p className="text-sm text-muted-foreground">
          Archived KYC snapshots and their documents are kept for the retention window below, then
          permanently destroyed by the nightly purge. Every removal is written to the audit log
          before the data disappears.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="ret-years">Keep snapshots for (years)</Label>
            <Input
              id="ret-years"
              type="number"
              min={1}
              max={25}
              value={years}
              onChange={(e) => setYears(Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="ret-hold">Legal hold grace (days)</Label>
            <Input
              id="ret-hold"
              type="number"
              min={0}
              max={3650}
              value={holdDays}
              onChange={(e) => setHoldDays(Number(e.target.value))}
            />
          </div>
          <div className="flex items-end gap-3">
            <Switch id="ret-auto" checked={enabled} onCheckedChange={setEnabled} />
            <Label htmlFor="ret-auto" className="mb-2">
              Automatic scheduled purge
            </Label>
          </div>
        </div>

        <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/30 p-4 text-xs sm:grid-cols-4">
          <Stat label="Snapshots in vault" value={String(data?.total_entries ?? "—")} />
          <Stat label="Due for removal now" value={String(data?.due_now ?? "—")} />
          <Stat
            label="Next scheduled removal"
            value={data?.next_purge_at ? new Date(data.next_purge_at).toLocaleDateString() : "—"}
          />
          <Stat
            label="Last purge"
            value={
              data?.policy.last_purge_at
                ? `${new Date(data.policy.last_purge_at).toLocaleString()} · ${data.policy.last_purge_entries ?? 0} removed`
                : "Never"
            }
          />
        </div>

        <div>
          <Label htmlFor="ret-reason">Reason for the policy change (audited)</Label>
          <Textarea
            id="ret-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Aligning with the 7-year statutory record-keeping requirement"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={!dirty || reason.trim().length < 5 || saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            <CalendarClock className="mr-1.5 size-4" /> Save retention policy
          </Button>
          <Button
            variant="outline"
            disabled={previewMut.isPending}
            onClick={() => previewMut.mutate()}
          >
            Preview what would be purged
          </Button>
          <Button
            variant="destructive"
            disabled={(data?.due_now ?? 0) === 0}
            onClick={() => setPurgeOpen(true)}
          >
            <Trash2 className="mr-1.5 size-4" /> Run purge now
          </Button>
        </div>
      </div>

      <Dialog open={purgeOpen} onOpenChange={(o) => !o && setPurgeOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run secure purge</DialogTitle>
            <DialogDescription>
              This permanently destroys {data?.due_now ?? 0} expired snapshot(s) and{" "}
              {data?.due_documents ?? 0} archived document(s). Restores will no longer be possible.
              Type PURGE to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="purge-reason">Reason (audited)</Label>
              <Textarea
                id="purge-reason"
                rows={2}
                value={purgeReason}
                onChange={(e) => setPurgeReason(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="purge-confirm">Type PURGE</Label>
              <Input
                id="purge-confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPurgeOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirm !== "PURGE" || purgeReason.trim().length < 5 || purgeMut.isPending}
              onClick={() => purgeMut.mutate()}
            >
              Purge permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-medium text-foreground">{value}</div>
    </div>
  );
}
