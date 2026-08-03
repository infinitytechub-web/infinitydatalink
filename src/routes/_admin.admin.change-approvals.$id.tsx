import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Copy, Loader2, PlayCircle, XCircle } from "lucide-react";
import { EmptyState, SectionCard } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { KIND_LABELS, STATUS_LABELS, STATUS_TONE, isAppliable } from "@/lib/change-approvals";
import {
  applyChangeRequest,
  approveChangeRequest,
  getChangeRequest,
  rejectChangeRequest,
} from "@/lib/change-approvals.functions";

export const Route = createFileRoute("/_admin/admin/change-approvals/$id")({
  component: ChangeRequestDetailPage,
});

const ACTION_LABELS: Record<string, string> = {
  "settings.change.requested": "Requested",
  "settings.change.approved": "Approved & applied",
  "settings.change.rejected": "Rejected",
  "settings.change.applied": "Applied (retry)",
};

function ChangeRequestDetailPage() {
  const { id } = Route.useParams();
  const { can } = useAuth();
  const queryClient = useQueryClient();

  const load = useServerFn(getChangeRequest);
  const approveFn = useServerFn(approveChangeRequest);
  const rejectFn = useServerFn(rejectChangeRequest);
  const applyFn = useServerFn(applyChangeRequest);

  const [mode, setMode] = useState<"approve" | "reject" | "apply" | null>(null);
  const [note, setNote] = useState("");

  const query = useQuery({
    queryKey: ["change-request", id],
    queryFn: () => load({ data: { id } }),
  });

  const decide = useMutation({
    mutationFn: async () => {
      if (mode === "approve") return approveFn({ data: { id, note } });
      if (mode === "reject") return rejectFn({ data: { id, reason: note } });
      return applyFn({ data: { id, note } });
    },
    onSuccess: (result) => {
      const status = (result as { status?: string }).status;
      const failure = (result as { error?: string | null }).error;
      if (status === "failed") toast.error(`Apply failed: ${failure ?? "unknown error"}`);
      else if (mode === "reject") toast.success("Request rejected");
      else toast.success("Change applied");
      setMode(null);
      setNote("");
      void queryClient.invalidateQueries({ queryKey: ["change-request", id] });
      void queryClient.invalidateQueries({ queryKey: ["change-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["change-audit-history"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isLoading) {
    return <div className="p-10 text-center text-sm text-muted-foreground">Loading request…</div>;
  }
  if (query.error || !query.data) {
    return (
      <EmptyState
        title="Change request not found"
        hint={(query.error as Error | null)?.message ?? "It may have been removed."}
        action={
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/change-approvals" search={{}}>Back to pending review</Link>
          </Button>
        }
      />
    );
  }

  const request = query.data.request;
  const audit = query.data.audit;
  const payloadJson = JSON.stringify(request.payload, null, 2);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild size="sm" variant="outline">
          <Link to="/admin/change-approvals" search={{}}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to pending review
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {request.status === "pending" && can("approvals", "approve") ? (
            <Button
              size="sm"
              disabled={request.is_own_request}
              title={request.is_own_request ? "You cannot approve your own request" : undefined}
              onClick={() => {
                setMode("approve");
                setNote("");
              }}
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Approve
            </Button>
          ) : null}
          {request.status === "pending" && can("approvals", "reject") ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setMode("reject");
                setNote("");
              }}
            >
              <XCircle className="mr-1.5 h-3.5 w-3.5" /> Reject
            </Button>
          ) : null}
          {isAppliable(request.status) && can("approvals", "approve") ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={request.is_own_request}
              onClick={() => {
                setMode("apply");
                setNote("");
              }}
            >
              <PlayCircle className="mr-1.5 h-3.5 w-3.5" /> Apply now
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title={KIND_LABELS[request.kind] ?? request.kind}>
          <dl className="grid gap-3 p-5 text-sm">
            <Field label="Status">
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_TONE[request.status]}`}
              >
                {STATUS_LABELS[request.status]}
              </span>
            </Field>
            <Field label="Summary">{request.summary ?? "—"}</Field>
            <Field label="Requested by">
              {request.requester_email ?? request.requested_by}
              {request.is_own_request ? " (you)" : ""}
            </Field>
            <Field label="Requested at">{new Date(request.requested_at).toLocaleString()}</Field>
            <Field label="Reviewed by">{request.reviewer_email ?? request.reviewed_by ?? "—"}</Field>
            <Field label="Reviewed at">
              {request.reviewed_at ? new Date(request.reviewed_at).toLocaleString() : "—"}
            </Field>
            <Field label="Decision comment">{request.review_note ?? "—"}</Field>
            <Field label="Applied at">
              {request.applied_at ? new Date(request.applied_at).toLocaleString() : "—"}
            </Field>
            {request.error ? (
              <Field label="Error">
                <span className="text-rose-600">{request.error}</span>
              </Field>
            ) : null}
          </dl>
        </SectionCard>

        <SectionCard
          title="Change payload"
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(payloadJson);
                toast.success("Payload copied");
              }}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy JSON
            </Button>
          }
        >
          <pre className="max-h-96 overflow-auto p-5 font-mono text-xs text-muted-foreground">{payloadJson}</pre>
        </SectionCard>
      </div>

      <SectionCard title="Audit history for this request">
        {audit.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No audit entries yet" hint="Lifecycle events appear here as they happen." />
          </div>
        ) : (
          <ol className="divide-y divide-border/40">
            {audit.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-start gap-3 px-5 py-3 text-sm">
                <span className="w-40 shrink-0 text-xs text-muted-foreground tabular-nums">
                  {new Date(entry.created_at).toLocaleString()}
                </span>
                <span className="font-medium text-foreground">{ACTION_LABELS[entry.action] ?? entry.action}</span>
                <span className="text-xs text-muted-foreground">
                  {entry.actor_email ?? "system"}
                  {entry.actor_role ? ` · ${entry.actor_role}` : ""}
                </span>
                <code className="ml-auto max-w-full truncate rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {JSON.stringify(entry.meta)}
                </code>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>

      <Dialog open={!!mode} onOpenChange={(open) => (open ? null : setMode(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {mode === "reject"
                ? "Reject change request"
                : mode === "apply"
                  ? "Apply approved change"
                  : "Approve and apply change"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="detail-note">
              {mode === "reject" ? "Rejection reason" : "Decision comment"} (required)
            </Label>
            <Textarea
              id="detail-note"
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Recorded permanently in the audit history."
            />
            <p className="text-[11px] text-muted-foreground">Minimum 5 characters.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button
              variant={mode === "reject" ? "destructive" : "default"}
              disabled={note.trim().length < 5 || decide.isPending}
              onClick={() => decide.mutate()}
            >
              {decide.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_minmax(0,1fr)] gap-3">
      <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  );
}
