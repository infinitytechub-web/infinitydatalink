import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Archive, RotateCcw, Trash2, ShieldCheck, Search, Eye } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  listKycVault,
  restoreKycVault,
  purgeKycVaultEntry,
  bulkRestoreKycVault,
  bulkPurgeKycVault,
} from "@/lib/kyc-vault.functions";
import type { VaultEntry } from "@/lib/kyc-vault.shared";
import { VaultRetentionPanel } from "@/components/vault-retention-panel";
import { VaultEntryDetailsDialog } from "@/components/vault-entry-details";


export const Route = createFileRoute("/_admin/admin/vault")({
  head: () => ({
    meta: [
      { title: "Account Vault — Restore deleted KYC" },
      {
        name: "description",
        content:
          "Restore or permanently purge deleted member KYC reviews. Access limited to admins and roles holding the matching KYC capability.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VaultPage,
});

const PAGE_SIZE = 25;

function VaultPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<{ kind: "restore" | "purge"; entry: VaultEntry } | null>(null);
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkReason, setBulkReason] = useState("");
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeReason, setPurgeReason] = useState("");
  const [purgeConfirm, setPurgeConfirm] = useState("");
  const [details, setDetails] = useState<VaultEntry | null>(null);

  const listFn = useServerFn(listKycVault);
  const restoreFn = useServerFn(restoreKycVault);
  const purgeFn = useServerFn(purgeKycVaultEntry);
  const bulkRestoreFn = useServerFn(bulkRestoreKycVault);
  const bulkPurgeFn = useServerFn(bulkPurgeKycVault);


  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ["kyc-vault", q, page],
    queryFn: () => listFn({ data: { q: q.trim() || undefined, page, pageSize: PAGE_SIZE } }),
  });

  const mut = useMutation({
    mutationFn: async () => {
      if (!action) return null;
      const payload = { data: { id: action.entry.id, reason: reason.trim() } };
      return action.kind === "restore" ? await restoreFn(payload) : await purgeFn(payload);
    },
    onSuccess: () => {
      toast.success(action?.kind === "restore" ? "KYC record restored" : "Vault entry purged");
      setAction(null);
      setReason("");
      void qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e?.message ?? "Action failed"),
  });

  const bulkMut = useMutation({
    mutationFn: async () =>
      await bulkRestoreFn({
        data: { ids: Array.from(selected), reason: bulkReason.trim() },
      }),
    onSuccess: (res) => {
      if (res.failed === 0)
        toast.success(`${res.restored} record${res.restored === 1 ? "" : "s"} restored`);
      else toast.warning(`${res.restored} restored · ${res.failed} blocked`);
      for (const r of res.results.filter((x) => !x.ok)) {
        toast.error(`${r.member_name ?? r.id.slice(0, 8)}: ${r.error}`);
      }
      setSelected(new Set());
      setBulkOpen(false);
      setBulkReason("");
      void qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e?.message ?? "Bulk restore failed"),
  });

  const bulkPurgeMut = useMutation({
    mutationFn: async () =>
      await bulkPurgeFn({
        data: {
          ids: Array.from(selected),
          reason: purgeReason.trim(),
          confirm: "PURGE" as const,
        },
      }),
    onSuccess: (res) => {
      if (res.failed === 0)
        toast.success(`${res.purged} record${res.purged === 1 ? "" : "s"} permanently deleted`);
      else toast.warning(`${res.purged} deleted · ${res.failed} blocked`);
      for (const r of res.results.filter((x) => !x.ok)) {
        toast.error(`${r.member_name ?? r.id.slice(0, 8)}: ${r.error}`);
      }
      setSelected(new Set());
      setPurgeOpen(false);
      setPurgeReason("");
      setPurgeConfirm("");
      void qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e?.message ?? "Bulk delete failed"),
  });



  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const allChecked = entries.length > 0 && entries.every((e) => selected.has(e.id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Account vault"
        description="Deleted member KYC reviews are archived here for the configured retention window. Restore a record to put the member's verification, documents and reviewer decision back exactly as they were."
      />

      <VaultRetentionPanel />



      <SectionCard
        title="Archived KYC reviews"
        action={
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <ShieldCheck className="size-3.5" /> Capability-gated (kyc.view / kyc.edit / kyc.delete)
          </span>
        }
      >
        <div className="flex flex-wrap items-end gap-3 border-b border-border/60 px-6 py-4">
          <div className="min-w-56 flex-1">
            <Label htmlFor="vault-q">Search member, number or actor</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
              <Input
                id="vault-q"
                className="pl-8"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Name, member no, email…"
              />
            </div>
          </div>
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? "Loading…" : "Refresh"}
          </Button>
        </div>

        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-3 border-b border-border/60 bg-muted/30 px-6 py-3 text-xs">
            <span className="font-semibold">{selected.size} selected</span>
            <Button
              size="sm"
              onClick={() => {
                setBulkReason("");
                setBulkOpen(true);
              }}
            >
              <RotateCcw className="mr-1 size-3.5" /> Restore selected
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setPurgeReason("");
                setPurgeConfirm("");
                setPurgeOpen(true);
              }}
            >
              <Trash2 className="mr-1 size-3.5" /> Delete forever
            </Button>
            <button
              onClick={() => setSelected(new Set())}
              className="ml-auto text-[11px] underline text-muted-foreground"
            >
              Clear selection
            </button>
          </div>
        ) : null}

        {error ? (
          <p className="px-6 py-8 text-sm text-red-600 dark:text-red-400">
            {(error as any)?.message ?? "Unable to load the vault."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all vault entries"
                      checked={allChecked}
                      onChange={(e) =>
                        setSelected(e.target.checked ? new Set(entries.map((x) => x.id)) : new Set())
                      }
                    />
                  </th>
                  <th className="px-6 py-3">Member</th>
                  <th className="px-6 py-3">Previous status</th>
                  <th className="px-6 py-3">Docs</th>
                  <th className="px-6 py-3">Deleted</th>
                  <th className="px-6 py-3">Reason</th>
                  <th className="px-6 py-3">Purges after</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center text-muted-foreground">
                      {isFetching ? (
                        "Loading…"
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <Archive className="size-4" /> No deleted KYC records in the vault.
                        </span>
                      )}
                    </td>
                  </tr>
                ) : (
                  entries.map((e) => (
                    <tr key={e.id} className="border-t border-border/40 align-top">
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${e.member_name ?? e.member_id}`}
                          checked={selected.has(e.id)}
                          onChange={() => toggle(e.id)}
                        />
                      </td>
                      <td className="px-6 py-3">
                        <p className="font-semibold">{e.member_name ?? "—"}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {e.member_no ?? e.member_id}
                        </p>
                      </td>
                      <td className="px-6 py-3 text-xs uppercase tracking-wide">
                        {e.previous_kyc ?? "—"}
                      </td>
                      <td className="px-6 py-3">{e.document_count}</td>
                      <td className="px-6 py-3 text-xs text-muted-foreground">
                        {new Date(e.deleted_at).toLocaleString()}
                        <br />
                        {e.deleted_by_email ?? "—"}
                        {e.deleted_by_role ? ` (${e.deleted_by_role})` : ""}
                      </td>
                      <td className="max-w-64 px-6 py-3 text-xs text-muted-foreground">
                        {e.reason ?? "—"}
                      </td>
                      <td className="px-6 py-3 text-xs text-muted-foreground">
                        {new Date(e.purge_after).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setDetails(e)}>
                            <Eye className="mr-1 size-3.5" /> Preview
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              setAction({ kind: "restore", entry: e });
                              setReason("");
                            }}
                          >
                            <RotateCcw className="mr-1 size-3.5" /> Restore
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setAction({ kind: "purge", entry: e });
                              setReason("");
                            }}
                          >
                            <Trash2 className="mr-1 size-3.5" /> Purge
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border/60 px-6 py-3 text-xs text-muted-foreground">
          <span>{total > 0 ? `${total} archived record(s)` : "0 archived records"}</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1 || isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * PAGE_SIZE >= total || isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </SectionCard>

      <VaultEntryDetailsDialog
        entry={details}
        onClose={() => setDetails(null)}
        onRestore={(entry) => {
          setDetails(null);
          setAction({ kind: "restore", entry });
          setReason("");
        }}
      />

      <Dialog open={bulkOpen} onOpenChange={(o) => !o && setBulkOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore {selected.size} KYC record{selected.size === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>
              Each record is validated before anything is written: entries whose archived status is not
              a valid verification state, whose member no longer exists, or whose member has submitted
              again since deletion are skipped and reported instead of overwriting newer data. Every
              member gets their own audit entry and notification.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="vault-bulk-reason">Reason (min 5 characters)</Label>
            <Textarea
              id="vault-bulk-reason"
              rows={3}
              value={bulkReason}
              onChange={(e) => setBulkReason(e.target.value)}
              placeholder="Why are these records being restored?"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={bulkReason.trim().length < 5 || bulkMut.isPending}
              onClick={() => bulkMut.mutate()}
            >
              {bulkMut.isPending ? "Restoring…" : "Restore selected"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action?.kind === "restore" ? "Restore KYC record" : "Permanently purge record"}
            </DialogTitle>
            <DialogDescription>
              {action?.kind === "restore"
                ? "The member's verification status, reviewer decision and uploaded documents are written back and removed from the vault."
                : "This deletes the archived snapshot and its documents for good. It cannot be undone."}{" "}
              An audit entry is recorded.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="vault-reason">Reason (min 5 characters)</Label>
            <Textarea
              id="vault-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                action?.kind === "restore"
                  ? "Why is this record being restored?"
                  : "Why is this record being purged?"
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)}>
              Cancel
            </Button>
            <Button
              variant={action?.kind === "purge" ? "destructive" : "default"}
              disabled={reason.trim().length < 5 || mut.isPending}
              onClick={() => mut.mutate()}
            >
              {mut.isPending ? "Working…" : action?.kind === "restore" ? "Restore" : "Purge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
