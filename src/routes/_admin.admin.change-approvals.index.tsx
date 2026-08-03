import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import { CheckCircle2, XCircle, PlayCircle, Loader2, Eye } from "lucide-react";
import { EmptyState, KPIStat, SectionCard } from "@/components/primitives";
import { Pagination } from "@/components/table-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  CHANGE_KINDS,
  CHANGE_STATUSES,
  KIND_LABELS,
  STATUS_LABELS,
  STATUS_TONE,
  describeChange,
  isAppliable,
  type ChangeKind,
  type ChangeStatus,
} from "@/lib/change-approvals";
import {
  applyChangeRequest,
  approveChangeRequest,
  listChangeRequests,
  rejectChangeRequest,
  type ChangeRequestRow,
} from "@/lib/change-approvals.functions";

const SearchSchema = z.object({
  status: z.enum(["all", ...CHANGE_STATUSES]).default("pending"),
  kind: z.enum(["all", ...CHANGE_KINDS]).default("all"),
  q: z.string().default(""),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(100).default(25),
});

export const Route = createFileRoute("/_admin/admin/change-approvals/")({
  validateSearch: (search) => SearchSchema.parse(search),
  component: PendingRequestsPage,
});

type Decision = { row: ChangeRequestRow; mode: "approve" | "reject" | "apply" };

function PendingRequestsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const list = useServerFn(listChangeRequests);
  const approveFn = useServerFn(approveChangeRequest);
  const rejectFn = useServerFn(rejectChangeRequest);
  const applyFn = useServerFn(applyChangeRequest);

  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState("");

  const query = useQuery({
    queryKey: ["change-requests", search],
    queryFn: () =>
      list({
        data: {
          status: search.status,
          kind: search.kind,
          search: search.q,
          page: search.page,
          pageSize: search.pageSize,
        },
      }),
  });

  const closeDialog = () => {
    setDecision(null);
    setNote("");
  };

  const decide = useMutation({
    mutationFn: async ({ row, mode }: Decision) => {
      if (mode === "approve") return approveFn({ data: { id: row.id, note } });
      if (mode === "reject") return rejectFn({ data: { id: row.id, reason: note } });
      return applyFn({ data: { id: row.id, note } });
    },
    onSuccess: (result, variables) => {
      const status = (result as { status?: ChangeStatus }).status;
      const failure = (result as { error?: string | null }).error;
      if (status === "failed") {
        toast.error(`Change could not be applied: ${failure ?? "unknown error"}`);
      } else if (variables.mode === "reject") {
        toast.success("Request rejected");
      } else {
        toast.success("Change applied");
      }
      void queryClient.invalidateQueries({ queryKey: ["change-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["change-audit-history"] });
      closeDialog();
    },
    onError: (error: Error) => toast.error(friendly(error.message)),
  });

  const rows = query.data?.rows ?? [];
  const counts = query.data?.counts ?? {};

  const setSearch = (patch: Partial<z.infer<typeof SearchSchema>>) =>
    navigate({ search: (prev) => ({ ...prev, page: 1, ...patch }) });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {CHANGE_STATUSES.map((status) => (
          <KPIStat
            key={status}
            label={STATUS_LABELS[status]}
            value={String(counts[status] ?? 0)}
            accent={status === "pending"}
          />
        ))}
      </div>

      <SectionCard title="Change requests">
        <div className="flex flex-wrap items-end gap-3 border-b border-border/60 px-5 py-4">
          <div className="grid gap-1.5">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Status</Label>
            <select
              value={search.status}
              onChange={(e) => setSearch({ status: e.target.value as ChangeStatus | "all" })}
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
            >
              <option value="all">All statuses</option>
              {CHANGE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Kind</Label>
            <select
              value={search.kind}
              onChange={(e) => setSearch({ kind: e.target.value as ChangeKind | "all" })}
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
            >
              <option value="all">All kinds</option>
              {CHANGE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Search summary</Label>
            <Input
              value={search.q}
              onChange={(e) => setSearch({ q: e.target.value })}
              placeholder="e.g. paystack"
              className="h-9 w-56"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
            {query.isFetching ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Refresh
          </Button>
        </div>

        {query.isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading requests…</div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No change requests match these filters"
              hint="Staged changes appear here for a second reviewer to approve or reject."
              action={
                <Button asChild size="sm">
                  <Link to="/admin/change-approvals/new">Request a change</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border/60 text-[10px] uppercase tracking-widest text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Requested</th>
                    <th className="px-5 py-3 text-left font-medium">Kind</th>
                    <th className="px-5 py-3 text-left font-medium">Summary</th>
                    <th className="px-5 py-3 text-left font-medium">Requester</th>
                    <th className="px-5 py-3 text-left font-medium">Status</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/40 last:border-0 align-top">
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-muted-foreground tabular-nums">
                        {new Date(row.requested_at).toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-xs">{KIND_LABELS[row.kind] ?? row.kind}</td>
                      <td className="max-w-xs px-5 py-3">
                        <p className="truncate text-foreground">{row.summary ?? "—"}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {describeChange(row.kind, row.payload)}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-xs">
                        {row.requester_email ?? row.requested_by.slice(0, 8)}
                        {row.is_own_request ? (
                          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                            you
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_TONE[row.status]}`}
                        >
                          {STATUS_LABELS[row.status]}
                        </span>
                        {row.error ? (
                          <p className="mt-1 max-w-[16rem] truncate text-[11px] text-rose-600" title={row.error}>
                            {row.error}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link to="/admin/change-approvals/$id" params={{ id: row.id }}>
                              <Eye className="mr-1.5 h-3.5 w-3.5" /> View
                            </Link>
                          </Button>
                          {row.status === "pending" && can("approvals", "approve") ? (
                            <Button
                              size="sm"
                              disabled={row.is_own_request}
                              title={row.is_own_request ? "You cannot approve your own request" : undefined}
                              onClick={() => {
                                setDecision({ row, mode: "approve" });
                                setNote("");
                              }}
                            >
                              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Approve
                            </Button>
                          ) : null}
                          {row.status === "pending" && can("approvals", "reject") ? (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                setDecision({ row, mode: "reject" });
                                setNote("");
                              }}
                            >
                              <XCircle className="mr-1.5 h-3.5 w-3.5" /> Reject
                            </Button>
                          ) : null}
                          {isAppliable(row.status) && can("approvals", "approve") ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={row.is_own_request}
                              onClick={() => {
                                setDecision({ row, mode: "apply" });
                                setNote("");
                              }}
                            >
                              <PlayCircle className="mr-1.5 h-3.5 w-3.5" /> Apply
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={search.page}
              pageSize={search.pageSize}
              total={query.data?.total ?? 0}
              onPage={(n) => navigate({ search: (prev) => ({ ...prev, page: n }) })}
              onPageSize={(n) => navigate({ search: (prev) => ({ ...prev, pageSize: n, page: 1 }) })}
            />
          </>
        )}
      </SectionCard>

      <Dialog open={!!decision} onOpenChange={(open) => (open ? null : closeDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision?.mode === "reject"
                ? "Reject change request"
                : decision?.mode === "apply"
                  ? "Apply approved change"
                  : "Approve and apply change"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {decision ? KIND_LABELS[decision.row.kind] : ""} — {decision?.row.summary ?? ""}
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor="decision-note">
                {decision?.mode === "reject" ? "Rejection reason" : "Decision comment"} (required)
              </Label>
              <Textarea
                id="decision-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder="Explain the decision — recorded permanently in the audit history."
              />
              <p className="text-[11px] text-muted-foreground">Minimum 5 characters.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              variant={decision?.mode === "reject" ? "destructive" : "default"}
              disabled={note.trim().length < 5 || decide.isPending}
              onClick={() => decision && decide.mutate(decision)}
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

function friendly(message: string): string {
  if (message.includes("two_person_rule_violation")) return "You cannot review your own change request.";
  if (message.includes("not_pending")) return "This request has already been reviewed.";
  if (message.includes("not_appliable")) return "Only approved or failed requests can be applied.";
  if (message.includes("note_required")) return "A note of at least 5 characters is required.";
  if (message.includes("forbidden")) return "You do not have permission to review change requests.";
  return message;
}
