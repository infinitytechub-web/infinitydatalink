import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Suspense, useMemo, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  EmptyState,
  ErrorState,
  KPIGridSkeleton,
  KPIStat,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
  StatusPill,
} from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/org-config";
import {
  decideSettlementRequest,
  listSettlementRequests,
  type SettlementRequestRow,
} from "@/lib/loan-settlements.functions";

export const Route = createFileRoute("/_admin/admin/loan-settlements")({
  head: () => ({
    meta: [
      { title: "Early Settlement Approvals — Loan Payoff Queue" },
      {
        name: "description",
        content:
          "Review, approve or reject member early loan settlement requests with a mandatory decision note, full audit trail and automatic member notifications.",
      },
      { property: "og:title", content: "Early Settlement Approvals" },
      {
        property: "og:description",
        content: "Finance approval queue for early loan payoff requests, with audit trail and member notifications.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettlementsPage,
  errorComponent: ({ error }) => <PageError error={error} />,
});

function PageError({ error }: { error: Error }) {
  const router = useRouter();
  return (
    <div className="p-6">
      <ErrorState
        title="Settlement queue failed to load"
        message={error.message}
        onRetry={() => router.invalidate()}
      />
    </div>
  );
}

const requestsQuery = queryOptions({
  queryKey: ["admin", "loan-settlements", "all"],
  queryFn: () => listSettlementRequests({ data: { status: "all", limit: 200 } }),
});

function SettlementsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Loan governance"
        title="Early settlement approvals"
        description="Members requesting to pay off a loan ahead of schedule. Each decision needs a note, is written to the audit trail, and notifies the member automatically."
      />
      <Suspense
        fallback={
          <div className="space-y-8">
            <KPIGridSkeleton count={4} />
            <SectionCardSkeleton title="Awaiting decision" rows={5} cols={6} />
          </div>
        }
      >
        <SettlementsContent />
      </Suspense>
    </>
  );
}

function SettlementsContent() {
  const { data: all } = useSuspenseQuery(requestsQuery);
  const [historyStatus, setHistoryStatus] = useState("approved");
  const [deciding, setDeciding] = useState<{ row: SettlementRequestRow; approve: boolean } | null>(null);

  const pending = useMemo(() => all.filter((r) => r.status === "pending"), [all]);
  const history = useMemo(
    () => all.filter((r) => (historyStatus === "all" ? r.status !== "pending" : r.status === historyStatus)),
    [all, historyStatus],
  );
  const pendingValue = useMemo(() => pending.reduce((s, r) => s + r.quoted_total, 0), [pending]);
  const approvedValue = useMemo(
    () => all.filter((r) => r.status === "approved").reduce((s, r) => s + r.quoted_total, 0),
    [all],
  );

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPIStat label="Awaiting decision" value={String(pending.length)} />
        <KPIStat label="Value in queue" value={formatMoney(pendingValue)} />
        <KPIStat label="Approved settlements" value={String(all.filter((r) => r.status === "approved").length)} />
        <KPIStat label="Approved value" value={formatMoney(approvedValue)} />
      </div>

      <SectionCard title={`Awaiting decision (${pending.length})`}>
        {pending.length === 0 ? (
          <EmptyState
            title="No settlement requests pending"
            hint="Member early-payoff requests land here for a finance decision."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Loan</th>
                  <th className="py-2 pr-4">Member</th>
                  <th className="py-2 pr-4">Settle on</th>
                  <th className="py-2 pr-4">Quoted payoff</th>
                  <th className="py-2 pr-4">Requested</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {pending.map((r) => (
                  <tr key={r.id} className="border-t border-border/60 align-top">
                    <td className="py-3 pr-4">
                      <Link
                        to="/admin/loans/$loanId"
                        params={{ loanId: r.loan_id }}
                        className="font-mono text-xs underline decoration-dotted"
                      >
                        {r.loan_ref ?? r.loan_id.slice(0, 8)}
                      </Link>
                      <div className="text-xs text-muted-foreground">{r.product ?? ""}</div>
                    </td>
                    <td className="py-3 pr-4">
                      <div>{r.member_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.member_no ?? ""}</div>
                    </td>
                    <td className="py-3 pr-4">{r.settle_on}</td>
                    <td className="py-3 pr-4">
                      <div className="font-semibold">{formatMoney(r.quoted_total)}</div>
                      {r.outstanding_principal != null && (
                        <div className="text-xs text-muted-foreground">
                          principal {formatMoney(r.outstanding_principal)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-xs">
                      <div className="text-muted-foreground">{new Date(r.requested_at).toLocaleString()}</div>
                      {r.member_note && <div className="mt-1">“{r.member_note}”</div>}
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => setDeciding({ row: r, approve: true })}>
                          Approve
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setDeciding({ row: r, approve: false })}>
                          Reject
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Decision audit trail"
        action={
          <Select value={historyStatus} onValueChange={setHistoryStatus}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="all">All decided</SelectItem>
            </SelectContent>
          </Select>
        }
      >
        {history.length === 0 ? (
          <EmptyState title="No decisions yet" hint="Approved, rejected and cancelled requests appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Loan</th>
                  <th className="py-2 pr-4">Member</th>
                  <th className="py-2 pr-4">Settle on</th>
                  <th className="py-2 pr-4">Quoted payoff</th>
                  <th className="py-2 pr-4">Outcome</th>
                  <th className="py-2 pr-4">Decided by</th>
                  <th className="py-2 pr-4">Decision note</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id} className="border-t border-border/60 align-top">
                    <td className="py-3 pr-4">
                      <Link
                        to="/admin/loans/$loanId"
                        params={{ loanId: r.loan_id }}
                        className="font-mono text-xs underline decoration-dotted"
                      >
                        {r.loan_ref ?? r.loan_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="py-3 pr-4">{r.member_name ?? "—"}</td>
                    <td className="py-3 pr-4">{r.settle_on}</td>
                    <td className="py-3 pr-4">{formatMoney(r.quoted_total)}</td>
                    <td className="py-3 pr-4">
                      <StatusPill status={r.status === "approved" ? "approved" : "rejected"} />
                      <div className="text-xs text-muted-foreground">{r.status}</div>
                    </td>
                    <td className="py-3 pr-4 text-xs">
                      <div>{r.decided_by_email ?? "—"}</div>
                      <div className="text-muted-foreground">
                        {r.decided_at ? new Date(r.decided_at).toLocaleString() : ""}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-xs text-muted-foreground">{r.decision_note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <DecideDialog pending={deciding} onClose={() => setDeciding(null)} />
    </div>
  );
}

function DecideDialog({
  pending,
  onClose,
}: {
  pending: { row: SettlementRequestRow; approve: boolean } | null;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const qc = useQueryClient();
  const decide = useServerFn(decideSettlementRequest);
  const mutation = useMutation({
    mutationFn: () =>
      decide({ data: { request_id: pending!.row.id, approve: pending!.approve, note: note.trim() } }),
    onSuccess: () => {
      toast.success(pending?.approve ? "Settlement approved" : "Settlement rejected", {
        description: "The member has been notified and the decision is in the audit trail.",
      });
      qc.invalidateQueries({ queryKey: ["admin", "loan-settlements"] });
      setNote("");
      onClose();
    },
    onError: (e: Error) => toast.error("Decision failed", { description: e.message }),
  });

  const valid = note.trim().length >= 10;

  return (
    <Dialog open={!!pending} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {pending?.approve ? "Approve early settlement" : "Reject early settlement"}
          </DialogTitle>
        </DialogHeader>
        {pending && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Loan</span>
                <span className="font-mono text-xs">{pending.row.loan_ref ?? pending.row.loan_id.slice(0, 8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Member</span>
                <span>{pending.row.member_name ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Settlement date</span>
                <span>{pending.row.settle_on}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Quoted payoff</span>
                <span>{formatMoney(pending.row.quoted_total)}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settlement-note">Decision note (required)</Label>
              <Textarea
                id="settlement-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder={
                  pending.approve
                    ? "Confirm the figure verified, funding source and value date."
                    : "Explain why the settlement request is declined."
                }
              />
              <p className="text-xs text-muted-foreground">
                At least 10 characters. Stored on the request and in the audit log, and shared with the member on
                rejection.
              </p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Saving…" : pending?.approve ? "Approve settlement" : "Reject settlement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
