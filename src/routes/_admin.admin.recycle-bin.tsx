import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Archive, RotateCcw, Save, Trash2, ShieldAlert, FileText, Bug } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { BRANDING_QUERY_KEY } from "@/components/branding-provider";
import { listKycVault } from "@/lib/kyc-vault.functions";
import { listLogRecycleBin } from "@/lib/log-recycle-bin.functions";
import {
  listSnapshots,
  createSnapshot,
  restoreSnapshot,
  deleteSnapshot,
} from "@/lib/admin-settings.functions";

export const Route = createFileRoute("/_admin/admin/recycle-bin")({
  head: () => ({
    meta: [
      { title: "Recycle bin & restore points — IT-360 CashApp" },
      {
        name: "description",
        content:
          "Admin-only recycle bin for deleted records and logs, plus configuration restore points.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Recycle bin & restore points" },
      {
        property: "og:description",
        content: "Recover deleted records and roll configuration back to a restore point.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecycleBinPage,
});

function RecycleBinPage() {
  const { hasRole, loading } = useAuth();
  if (loading) return null;
  const isAdmin = hasRole("super_admin") || hasRole("admin");
  if (!isAdmin) return <Navigate to="/admin" replace />;
  return <RecycleBinInner canManageRestorePoints={hasRole("super_admin")} />;
}

function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function RecycleBinInner({ canManageRestorePoints }: { canManageRestorePoints: boolean }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");

  const kycFn = useServerFn(listKycVault);
  const logFn = useServerFn(listLogRecycleBin);
  const listSnapshotsFn = useServerFn(listSnapshots);
  const createFn = useServerFn(createSnapshot);
  const restoreFn = useServerFn(restoreSnapshot);
  const deleteFn = useServerFn(deleteSnapshot);

  const kyc = useQuery({
    queryKey: ["admin", "recycle-hub", "kyc"],
    queryFn: () => kycFn({ data: { page: 1, pageSize: 5 } }),
  });
  const auditBin = useQuery({
    queryKey: ["admin", "recycle-hub", "audit_log"],
    queryFn: () => logFn({ data: { kind: "audit_log", page: 1, pageSize: 5 } }),
  });
  const runtimeBin = useQuery({
    queryKey: ["admin", "recycle-hub", "runtime_error_logs"],
    queryFn: () => logFn({ data: { kind: "runtime_error_logs", page: 1, pageSize: 5 } }),
  });
  const snapshots = useQuery({
    queryKey: ["settings-snapshots"],
    queryFn: () => listSnapshotsFn(),
    enabled: canManageRestorePoints,
  });

  const create = useMutation({
    mutationFn: () => createFn({ data: { label: label.trim(), note: note.trim() } }),
    onSuccess: () => {
      toast.success("Restore point created");
      setLabel("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["settings-snapshots"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create restore point"),
  });

  const restore = useMutation({
    mutationFn: (id: string) => restoreFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Configuration restored");
      qc.invalidateQueries({ queryKey: BRANDING_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["settings-snapshots"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Restore failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Restore point deleted");
      qc.invalidateQueries({ queryKey: ["settings-snapshots"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  const bins = [
    {
      key: "kyc",
      title: "Member KYC records",
      icon: <Archive className="h-4 w-4" />,
      count: kyc.data?.total ?? 0,
      latest: kyc.data?.entries?.[0]?.deleted_at ?? null,
      to: "/admin/vault" as const,
      cta: "Open KYC vault",
      hint: "Deleted member KYC reviews with document snapshots — restorable per member or in bulk.",
    },
    {
      key: "audit",
      title: "Purged audit log entries",
      icon: <FileText className="h-4 w-4" />,
      count: auditBin.data?.total ?? 0,
      latest: auditBin.data?.rows?.[0]?.deleted_at ?? null,
      to: "/admin/log-recycle-bin" as const,
      cta: "Open log recycle bin",
      hint: "Compliance audit rows removed by retention or manual purge.",
    },
    {
      key: "runtime",
      title: "Purged runtime error logs",
      icon: <Bug className="h-4 w-4" />,
      count: runtimeBin.data?.total ?? 0,
      latest: runtimeBin.data?.rows?.[0]?.deleted_at ?? null,
      to: "/admin/log-recycle-bin" as const,
      cta: "Open log recycle bin",
      hint: "Runtime diagnostics awaiting permanent deletion after the retention window.",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        title="Recycle bin & restore points"
        description="Admin-only recovery hub: browse everything that was deleted, restore it, and roll configuration back to a saved restore point."
      />

      <SectionCard
        title="Recycle bin"
        action={
          <Badge variant="outline" className="gap-1">
            <ShieldAlert className="h-3 w-3" /> Admins only
          </Badge>
        }
      >
        <div className="grid gap-4 p-5 md:grid-cols-3">
          {bins.map((b) => (
            <div
              key={b.key}
              className="flex flex-col justify-between rounded-lg border border-border bg-muted/30 p-4"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  {b.icon}
                  {b.title}
                </div>
                <p className="text-3xl font-bold tabular-nums text-foreground">{b.count}</p>
                <p className="text-xs text-muted-foreground">{b.hint}</p>
                <p className="text-xs text-muted-foreground">Last deletion: {fmt(b.latest)}</p>
              </div>
              <Button asChild variant="outline" size="sm" className="mt-4 w-full">
                <Link to={b.to}>{b.cta}</Link>
              </Button>
            </div>
          ))}
        </div>
      </SectionCard>

      {canManageRestorePoints ? (
        <SectionCard title="Restore points" accent="gold">
          <div className="space-y-5 p-5">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="rp-label">Label</Label>
                <Input
                  id="rp-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Before branding change"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rp-note">Note</Label>
                <Textarea
                  id="rp-note"
                  rows={1}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Why this restore point is being taken"
                />
              </div>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                <Save className="mr-2 h-4 w-4" /> Create restore point
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4">Label</th>
                    <th className="py-2 pr-4">Created</th>
                    <th className="py-2 pr-4">By</th>
                    <th className="py-2 pr-4">Note</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(snapshots.data ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-muted-foreground">
                        {snapshots.isFetching ? "Loading…" : "No restore points yet."}
                      </td>
                    </tr>
                  ) : (
                    (snapshots.data ?? []).map((s) => (
                      <tr key={s.id} className="border-b border-border/60">
                        <td className="py-2 pr-4 font-medium">{s.label || "Untitled"}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">{fmt(s.created_at)}</td>
                        <td className="py-2 pr-4">{s.created_by_email ?? "—"}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{s.note ?? "—"}</td>
                        <td className="py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={restore.isPending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Restore configuration from this restore point? Current settings will be overwritten.",
                                  )
                                )
                                  restore.mutate(s.id);
                              }}
                            >
                              <RotateCcw className="mr-2 h-4 w-4" /> Restore
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={remove.isPending}
                              onClick={() => {
                                if (window.confirm("Delete this restore point permanently?"))
                                  remove.mutate(s.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </SectionCard>
      ) : (
        <SectionCard title="Restore points">
          <p className="p-5 text-sm text-muted-foreground">
            Configuration restore points are managed by super admins only.
          </p>
        </SectionCard>
      )}
    </div>
  );
}
