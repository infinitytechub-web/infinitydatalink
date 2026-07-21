import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Save, RotateCcw, Trash2 } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { BRANDING_QUERY_KEY } from "@/components/branding-provider";
import {
  listSnapshots,
  createSnapshot,
  restoreSnapshot,
  deleteSnapshot,
  type SnapshotRow,
} from "@/lib/admin-settings.functions";

export const Route = createFileRoute("/_admin/admin/console/snapshots")({
  head: () => ({
    meta: [
      { title: "Backup & restore — IT-360 CashApp" },
      {
        name: "description",
        content: "Download branding snapshots and restore previous configurations.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SnapshotsPage,
});

function SnapshotsPage() {
  const { hasRole, loading } = useAuth();
  if (loading) return null;
  if (!hasRole("super_admin")) return <Navigate to="/admin" replace />;
  return <SnapshotsInner />;
}

function SnapshotsInner() {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");

  const listFn = useServerFn(listSnapshots);
  const createFn = useServerFn(createSnapshot);
  const restoreFn = useServerFn(restoreSnapshot);
  const deleteFn = useServerFn(deleteSnapshot);

  const { data, isFetching } = useQuery({
    queryKey: ["settings-snapshots"],
    queryFn: () => listFn(),
  });

  const create = useMutation({
    mutationFn: () => createFn({ data: { label: label.trim(), note: note.trim() } }),
    onSuccess: () => {
      toast.success("Snapshot created");
      setLabel("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["settings-snapshots"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to snapshot"),
  });

  const restore = useMutation({
    mutationFn: (id: string) => restoreFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Snapshot restored");
      qc.invalidateQueries({ queryKey: BRANDING_QUERY_KEY });
    },
    onError: (e: any) => toast.error(e?.message ?? "Restore failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Snapshot deleted");
      qc.invalidateQueries({ queryKey: ["settings-snapshots"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  const rows = data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Backup"
        title="Backup & restore"
        description="Save a snapshot of your branding configuration and restore it later. Snapshots are also downloadable as JSON for offline storage."
      />

      <SectionCard title="Create snapshot">
        <div className="grid gap-3 p-6 md:grid-cols-2">
          <div>
            <Label htmlFor="snap-label">Label</Label>
            <Input
              id="snap-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Q1 launch branding"
              maxLength={120}
            />
          </div>
          <div>
            <Label htmlFor="snap-note">Note (optional)</Label>
            <Textarea
              id="snap-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
            />
          </div>
        </div>
        <div className="flex justify-end border-t border-border/60 px-6 py-3">
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            <Save className="mr-1 size-4" />
            {create.isPending ? "Saving…" : "Save snapshot"}
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Snapshots">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-6 py-3">Created</th>
                <th className="px-6 py-3">Label</th>
                <th className="px-6 py-3">Note</th>
                <th className="px-6 py-3">Author</th>
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-muted-foreground">
                    {isFetching ? "Loading…" : "No snapshots yet."}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <SnapshotRowView
                    key={r.id}
                    row={r}
                    onRestore={() => {
                      if (window.confirm(`Restore snapshot "${r.label}"? This overwrites the current branding.`))
                        restore.mutate(r.id);
                    }}
                    onDelete={() => {
                      if (window.confirm(`Delete snapshot "${r.label}"?`)) remove.mutate(r.id);
                    }}
                    busy={restore.isPending || remove.isPending}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </>
  );
}

function SnapshotRowView({
  row,
  onRestore,
  onDelete,
  busy,
}: {
  row: SnapshotRow;
  onRestore: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const download = () => {
    const blob = new Blob([JSON.stringify(row, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `snapshot-${row.label || row.id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  return (
    <tr className="border-t border-border/40">
      <td className="whitespace-nowrap px-6 py-3 text-xs text-muted-foreground">
        {new Date(row.created_at).toLocaleString()}
      </td>
      <td className="px-6 py-3 font-medium">{row.label || "(unlabeled)"}</td>
      <td className="px-6 py-3 text-xs text-muted-foreground">{row.note ?? "—"}</td>
      <td className="px-6 py-3 text-xs">{row.created_by_email ?? "—"}</td>
      <td className="px-6 py-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={download}>
            <Download className="mr-1 size-3" />
            Download
          </Button>
          <Button size="sm" onClick={onRestore} disabled={busy}>
            <RotateCcw className="mr-1 size-3" />
            Restore
          </Button>
          <Button size="sm" variant="outline" onClick={onDelete} disabled={busy}>
            <Trash2 className="mr-1 size-3" />
            Delete
          </Button>
        </div>
      </td>
    </tr>
  );
}
