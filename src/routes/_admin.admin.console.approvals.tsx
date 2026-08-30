import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import {
  listSettingsChangeRequests,
  approveSettingsChange,
  rejectSettingsChange,
  type SettingsChangeRequest,
  type SettingsChangeStatus,
  type SettingsChangeKind,
} from "@/lib/admin-settings.functions";

export const Route = createFileRoute("/_admin/admin/console/approvals")({
  head: () => ({
    meta: [
      { title: "Change approvals — IT-360 CashApp" },
      { name: "description", content: "Review and approve staged admin setting changes." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const { hasRole, loading } = useAuth();
  if (loading) return null;
  if (!hasRole("super_admin")) return <Navigate to="/admin" replace />;
  return <ApprovalsInner />;
}

const STATUS_OPTIONS: Array<SettingsChangeStatus | "all"> = [
  "all",
  "pending",
  "approved",
  "applied",
  "rejected",
  "failed",
];
const KIND_OPTIONS: Array<SettingsChangeKind | "all"> = [
  "all",
  "branding",
  "institution",
  "role_grant",
  "role_revoke",
];

function ApprovalsInner() {
  const [status, setStatus] = useState<SettingsChangeStatus | "all">("pending");
  const [kind, setKind] = useState<SettingsChangeKind | "all">("all");
  const [offset, setOffset] = useState(0);
  const LIMIT = 25;

  const listFn = useServerFn(listSettingsChangeRequests);
  const approveFn = useServerFn(approveSettingsChange);
  const rejectFn = useServerFn(rejectSettingsChange);
  const qc = useQueryClient();

  const args = useMemo(() => ({ status, kind, limit: LIMIT, offset }), [status, kind, offset]);

  const { data, isFetching } = useQuery({
    queryKey: ["settings-change-requests", args],
    queryFn: () => listFn({ data: args }),
  });

  const approve = useMutation({
    mutationFn: (row: SettingsChangeRequest) => {
      const note = window.prompt("Approval note (optional)") ?? "";
      return approveFn({ data: { id: row.id, note } });
    },
    onSuccess: () => {
      toast.success("Change approved and applied");
      qc.invalidateQueries({ queryKey: ["settings-change-requests"] });
      qc.invalidateQueries({ queryKey: ["settings-pending-count"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Approval failed"),
  });

  const reject = useMutation({
    mutationFn: (row: SettingsChangeRequest) => {
      const reason = window.prompt("Rejection reason (required)") ?? "";
      if (reason.trim().length < 3) throw new Error("Reason must be at least 3 characters");
      return rejectFn({ data: { id: row.id, reason } });
    },
    onSuccess: () => {
      toast.success("Change rejected");
      qc.invalidateQueries({ queryKey: ["settings-change-requests"] });
      qc.invalidateQueries({ queryKey: ["settings-pending-count"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Rejection failed"),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Governance"
        title="Change approvals"
        description="Staged admin setting changes require a second super admin approval before they take effect."
      />

      <SectionCard title="Filters">
        <div className="grid gap-3 p-6 md:grid-cols-3">
          <div>
            <Label htmlFor="f-status">Status</Label>
            <select
              id="f-status"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as any);
                setOffset(0);
              }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="f-kind">Kind</Label>
            <select
              id="f-kind"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as any);
                setOffset(0);
              }}
            >
              {KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Requests">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-6 py-3">Requested</th>
                <th className="px-6 py-3">Kind</th>
                <th className="px-6 py-3">Summary</th>
                <th className="px-6 py-3">Requester</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-muted-foreground">
                    {isFetching ? "Loading…" : "No change requests."}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <RequestRow
                    key={r.id}
                    row={r}
                    onApprove={() => approve.mutate(r)}
                    onReject={() => reject.mutate(r)}
                    busy={approve.isPending || reject.isPending}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-border/60 px-6 py-3 text-xs text-muted-foreground">
          <span>
            {total > 0
              ? `Showing ${offset + 1}–${Math.min(offset + LIMIT, total)} of ${total}`
              : "0 entries"}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0 || isFetching}
              onClick={() => setOffset(Math.max(0, offset - LIMIT))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + LIMIT >= total || isFetching}
              onClick={() => setOffset(offset + LIMIT)}
            >
              Next
            </Button>
          </div>
        </div>
      </SectionCard>
    </>
  );
}

function statusTone(s: SettingsChangeStatus) {
  switch (s) {
    case "pending":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
    case "approved":
    case "applied":
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
    case "rejected":
    case "failed":
      return "bg-rose-500/15 text-rose-600 dark:text-rose-400";
  }
}

function RequestRow({
  row,
  onApprove,
  onReject,
  busy,
}: {
  row: SettingsChangeRequest;
  onApprove: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="border-t border-border/40">
        <td className="whitespace-nowrap px-6 py-3 text-xs text-muted-foreground">
          {new Date(row.requested_at).toLocaleString()}
        </td>
        <td className="px-6 py-3 font-mono text-xs">{row.kind}</td>
        <td className="px-6 py-3">
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-left text-primary hover:underline"
          >
            {row.summary ?? "(no summary)"}
          </button>
        </td>
        <td className="px-6 py-3 text-xs">{row.requester_email ?? row.requested_by}</td>
        <td className="px-6 py-3">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusTone(row.status)}`}
          >
            {row.status}
          </span>
        </td>
        <td className="px-6 py-3">
          {row.status === "pending" ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={onApprove} disabled={busy}>
                {busy ? (
                  <Loader2 className="mr-1 size-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-1 size-3" />
                )}
                Approve
              </Button>
              <Button size="sm" variant="outline" onClick={onReject} disabled={busy}>
                <XCircle className="mr-1 size-3" />
                Reject
              </Button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              {row.reviewer_email ?? "—"}
              {row.reviewed_at ? ` · ${new Date(row.reviewed_at).toLocaleString()}` : ""}
            </span>
          )}
        </td>
      </tr>
      {open ? (
        <tr className="border-t border-border/40 bg-muted/20">
          <td colSpan={6} className="px-6 py-4">
            <div className="grid gap-2 text-xs">
              {row.review_note ? (
                <div>
                  <b>Review note:</b> {row.review_note}
                </div>
              ) : null}
              {row.error ? (
                <div className="text-rose-500">
                  <b>Error:</b> {row.error}
                </div>
              ) : null}
              <div>
                <b>Payload:</b>
                <pre className="mt-1 max-h-80 overflow-auto rounded bg-background/60 p-3 text-[11px]">
                  {JSON.stringify(row.payload, null, 2)}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
