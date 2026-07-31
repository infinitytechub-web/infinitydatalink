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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/org-config";
import { listAdminLoans } from "@/lib/admin-loans.functions";
import {
  decideLoanRestructure,
  listLoanRestructures,
  requestLoanRestructure,
  type RestructureRow,
} from "@/lib/loan-workouts.functions";

export const Route = createFileRoute("/_admin/admin/loan-workouts")({
  head: () => ({
    meta: [
      { title: "Loan Workouts & Write-offs — Approvals" },
      {
        name: "description",
        content:
          "Request and approve loan reschedules, grace periods and write-offs under the two-person rule with a full audit trail.",
      },
      { property: "og:title", content: "Loan Workouts & Write-offs" },
      {
        property: "og:description",
        content: "Two-person approval workflow for loan restructuring, grace periods and partial write-offs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkoutsPage,
  errorComponent: ({ error }) => <PageError error={error} />,
});

function PageError({ error }: { error: Error }) {
  const router = useRouter();
  return (
    <div className="p-6">
      <ErrorState title="Workouts failed to load" message={error.message} onRetry={() => router.invalidate()} />
    </div>
  );
}

const restructuresQuery = (status: string) =>
  queryOptions({
    queryKey: ["admin", "loan-workouts", status],
    queryFn: () => listLoanRestructures({ data: { status: status as any, limit: 100 } }),
  });

const activeLoansQuery = queryOptions({
  queryKey: ["admin", "loans", "active-for-workout"],
  queryFn: () => listAdminLoans({ data: { limit: 200, status: "active" } }),
});

const KIND_LABEL: Record<string, string> = {
  reschedule: "Reschedule",
  grace_period: "Grace period",
  write_off: "Write-off",
};

function WorkoutsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Collections governance"
        title="Workouts & write-off approvals"
        description="Reschedules, grace periods and partial write-offs. Every request needs a second officer to decide it, and each step is written to the audit trail."
      />
      <Suspense
        fallback={
          <div className="space-y-8">
            <KPIGridSkeleton count={4} />
            <SectionCardSkeleton title="Pending workout requests" rows={5} cols={6} />
          </div>
        }
      >
        <WorkoutsContent />
      </Suspense>
    </>
  );
}

function WorkoutsContent() {
  const { data: all } = useSuspenseQuery(restructuresQuery("all"));
  const [historyStatus, setHistoryStatus] = useState("approved");
  const [requesting, setRequesting] = useState(false);
  const [deciding, setDeciding] = useState<{ row: RestructureRow; approve: boolean } | null>(null);

  const pending = useMemo(() => all.filter((r) => r.status === "pending"), [all]);
  const history = useMemo(
    () => all.filter((r) => (historyStatus === "all" ? r.status !== "pending" : r.status === historyStatus)),
    [all, historyStatus],
  );
  const writeOffTotal = useMemo(
    () =>
      all
        .filter((r) => r.status === "approved" && r.kind === "write_off")
        .reduce((sum, r) => sum + (r.write_off_amount ?? 0), 0),
    [all],
  );

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPIStat label="Awaiting decision" value={String(pending.length)} />
        <KPIStat label="Approved workouts" value={String(all.filter((r) => r.status === "approved").length)} />
        <KPIStat label="Rejected" value={String(all.filter((r) => r.status === "rejected").length)} />
        <KPIStat label="Approved write-offs" value={formatMoney(writeOffTotal)} />
      </div>

      <SectionCard
        title={`Pending workout requests (${pending.length})`}
        action={<Button size="sm" onClick={() => setRequesting(true)}>New workout request</Button>}
      >
        {pending.length === 0 ? (
          <EmptyState title="No requests awaiting decision" hint="Raise a workout request to start the approval flow." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Loan</th>
                  <th className="py-2 pr-4">Member</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Proposed terms</th>
                  <th className="py-2 pr-4">Requested by</th>
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
                    </td>
                    <td className="py-3 pr-4">{r.member_name ?? "—"}</td>
                    <td className="py-3 pr-4">{KIND_LABEL[r.kind] ?? r.kind}</td>
                    <td className="py-3 pr-4 text-xs">
                      <Terms row={r} />
                      {r.request_note && <div className="mt-1 text-muted-foreground">“{r.request_note}”</div>}
                    </td>
                    <td className="py-3 pr-4 text-xs">
                      <div>{r.requested_by_email ?? "—"}</div>
                      <div className="text-muted-foreground">{new Date(r.requested_at).toLocaleString()}</div>
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
            <SelectTrigger className="h-9 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="all">All decided</SelectItem>
            </SelectContent>
          </Select>
        }
      >
        {history.length === 0 ? (
          <EmptyState title="No decisions yet" hint="Approved and rejected workouts appear here with their notes." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Loan</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Outcome</th>
                  <th className="py-2 pr-4">Requested by</th>
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
                      <div className="text-xs text-muted-foreground">{r.member_name ?? ""}</div>
                    </td>
                    <td className="py-3 pr-4">
                      <div>{KIND_LABEL[r.kind] ?? r.kind}</div>
                      <div className="text-xs text-muted-foreground">
                        <Terms row={r} />
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <StatusPill status={r.status === "approved" ? "approved" : "rejected"} />
                    </td>
                    <td className="py-3 pr-4 text-xs">
                      <div>{r.requested_by_email ?? "—"}</div>
                      <div className="text-muted-foreground">{new Date(r.requested_at).toLocaleString()}</div>
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

      <RequestDialog open={requesting} onClose={() => setRequesting(false)} />
      <DecideDialog pending={deciding} onClose={() => setDeciding(null)} />
    </div>
  );
}

function Terms({ row }: { row: RestructureRow }) {
  const parts: string[] = [];
  if (row.new_term_months) parts.push(`term → ${row.new_term_months} mo`);
  if (row.new_interest_rate != null) parts.push(`rate → ${row.new_interest_rate}%`);
  if (row.grace_months) parts.push(`grace ${row.grace_months} mo`);
  if (row.write_off_amount) parts.push(`write off ${formatMoney(row.write_off_amount)}`);
  return <span>{parts.length ? parts.join(" · ") : "—"}</span>;
}

function RequestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [loanId, setLoanId] = useState("");
  const [kind, setKind] = useState("reschedule");
  const [term, setTerm] = useState("");
  const [rate, setRate] = useState("");
  const [grace, setGrace] = useState("");
  const [writeOff, setWriteOff] = useState("");
  const [note, setNote] = useState("");

  const qc = useQueryClient();
  const request = useServerFn(requestLoanRestructure);
  const mutation = useMutation({
    mutationFn: () =>
      request({
        data: {
          loan_id: loanId,
          kind: kind as "reschedule" | "grace_period" | "write_off",
          new_term_months: kind === "reschedule" && term ? Number(term) : null,
          new_interest_rate: kind === "reschedule" && rate ? Number(rate) : null,
          grace_months: kind === "grace_period" && grace ? Number(grace) : null,
          write_off_amount: kind === "write_off" && writeOff ? Number(writeOff) : null,
          note: note.trim(),
        },
      }),
    onSuccess: () => {
      toast.success("Workout request raised", { description: "A second officer must approve it." });
      qc.invalidateQueries({ queryKey: ["admin", "loan-workouts"] });
      setLoanId("");
      setTerm("");
      setRate("");
      setGrace("");
      setWriteOff("");
      setNote("");
      onClose();
    },
    onError: (e: Error) => toast.error("Request failed", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New workout request</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Suspense fallback={<div className="text-xs text-muted-foreground">Loading active loans…</div>}>
            <LoanPicker value={loanId} onChange={setLoanId} />
          </Suspense>
          <div className="space-y-1.5">
            <Label>Workout type</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reschedule">Reschedule (new term / rate)</SelectItem>
                <SelectItem value="grace_period">Grace period</SelectItem>
                <SelectItem value="write_off">Partial write-off</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {kind === "reschedule" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>New term (months)</Label>
                <Input inputMode="numeric" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="24" />
              </div>
              <div className="space-y-1.5">
                <Label>New rate (% p.a.)</Label>
                <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="18" />
              </div>
            </div>
          )}
          {kind === "grace_period" && (
            <div className="space-y-1.5">
              <Label>Grace period (months)</Label>
              <Input inputMode="numeric" value={grace} onChange={(e) => setGrace(e.target.value)} placeholder="3" />
            </div>
          )}
          {kind === "write_off" && (
            <div className="space-y-1.5">
              <Label>Write-off amount</Label>
              <Input
                inputMode="decimal"
                value={writeOff}
                onChange={(e) => setWriteOff(e.target.value)}
                placeholder="1500"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Justification (required, min 10 characters)</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending || !loanId || note.trim().length < 10}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Submitting…" : "Submit request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LoanPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: loans } = useSuspenseQuery(activeLoansQuery);
  return (
    <div className="space-y-1.5">
      <Label>Active loan</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select a loan" />
        </SelectTrigger>
        <SelectContent>
          {loans.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.ref} · {l.member_name ?? "member"} · {formatMoney(l.amount)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DecideDialog({
  pending,
  onClose,
}: {
  pending: { row: RestructureRow; approve: boolean } | null;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const qc = useQueryClient();
  const decide = useServerFn(decideLoanRestructure);
  const mutation = useMutation({
    mutationFn: () =>
      decide({ data: { request_id: pending!.row.id, approve: pending!.approve, note: note.trim() } }),
    onSuccess: () => {
      toast.success(pending?.approve ? "Workout approved and applied" : "Workout rejected");
      qc.invalidateQueries({ queryKey: ["admin", "loan-workouts"] });
      qc.invalidateQueries({ queryKey: ["admin", "loans"] });
      qc.invalidateQueries({ queryKey: ["admin", "loan-arrears"] });
      setNote("");
      onClose();
    },
    onError: (e: Error) => toast.error("Decision failed", { description: e.message }),
  });

  return (
    <Dialog open={pending !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{pending?.approve ? "Approve workout" : "Reject workout"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {pending && (
            <div className="rounded-md border border-border/60 p-3 text-xs">
              <div className="font-mono">{pending.row.loan_ref ?? pending.row.loan_id}</div>
              <div className="text-muted-foreground">{pending.row.member_name ?? ""}</div>
              <div className="mt-1">
                {KIND_LABEL[pending.row.kind] ?? pending.row.kind} — <Terms row={pending.row} />
              </div>
              <div className="mt-1 text-muted-foreground">
                Requested by {pending.row.requested_by_email ?? "—"}. The requester cannot decide their own request.
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Decision note (required, min 10 characters)</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={mutation.isPending || note.trim().length < 10} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Saving…" : pending?.approve ? "Approve" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
