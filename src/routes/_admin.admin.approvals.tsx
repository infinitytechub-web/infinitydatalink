import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader, SectionCard, EmptyState } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listPendingUsers,
  approveUser,
  rejectUser,
  setUserActive,
  type PendingUserRow,
} from "@/lib/admin-approvals.functions";
import {
  MEMBERSHIP_TYPES,
  MEMBERSHIP_TYPE_LABEL,
  type MembershipType,
} from "@/lib/member-registration";


export const Route = createFileRoute("/_admin/admin/approvals")({
  head: () => ({
    meta: [
      { title: "User Approvals — IT-360 CashApp" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ApprovalsPage,
});

type Status = "pending" | "approved" | "rejected" | "deactivated" | "all";
type MembershipFilter = MembershipType | "all";


function ApprovalsPage() {
  const { hasRole, hasAnyPermission, loading } = useAuth();
  if (loading) return null;
  const allowed = hasRole("super_admin") || hasRole("compliance_officer") || hasAnyPermission(["members:manage"]);
  if (!allowed) return <Navigate to="/admin" replace />;
  return <ApprovalsInner />;
}

function ApprovalsInner() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>("pending");
  const [membershipType, setMembershipType] = useState<MembershipFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const listFn = useServerFn(listPendingUsers);
  const approveFn = useServerFn(approveUser);
  const rejectFn = useServerFn(rejectUser);
  const activeFn = useServerFn(setUserActive);

  const query = useQuery({
    queryKey: ["admin-approvals", status, membershipType, search, page],
    queryFn: () =>
      listFn({ data: { status, membership_type: membershipType, search, page, pageSize } }),
  });


  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-approvals"] });

  const approveMut = useMutation({
    mutationFn: (v: { user_id: string; note?: string }) => approveFn({ data: v }),
    onSuccess: () => {
      toast.success("User approved");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const rejectMut = useMutation({
    mutationFn: (v: { user_id: string; reason: string }) => rejectFn({ data: v }),
    onSuccess: () => {
      toast.success("User rejected");
      invalidate();
      setRejectFor(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const activeMut = useMutation({
    mutationFn: (v: { user_id: string; active: boolean; reason?: string }) =>
      activeFn({ data: v }),
    onSuccess: () => {
      toast.success("Updated");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const [rejectFor, setRejectFor] = useState<PendingUserRow | null>(null);
  const [reason, setReason] = useState("");

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Membership"
        title="User approvals"
        description="Approve or reject newly registered users. Only approved accounts can access the platform."
      />

      <SectionCard title="Filters">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <Label className="text-xs">Status</Label>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as Status);
                setPage(1);
              }}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="deactivated">Deactivated</option>
              <option value="all">All</option>
            </select>
          </div>
          <div className="w-56">
            <Label className="text-xs">Membership type</Label>
            <select
              value={membershipType}
              onChange={(e) => {
                setMembershipType(e.target.value as MembershipFilter);
                setPage(1);
              }}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="all">All categories</option>
              {MEMBERSHIP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {MEMBERSHIP_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[240px] flex-1">
            <Label className="text-xs">Search (name, member no., Ghana Card or phone)</Label>
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search…"
            />
          </div>

          <div className="text-xs text-muted-foreground">
            {total} result{total === 1 ? "" : "s"}
          </div>
        </div>
      </SectionCard>

      <SectionCard title={`${status === "all" ? "All users" : status.charAt(0).toUpperCase() + status.slice(1)}`}>
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="Nothing here" hint="No users match this filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-widest text-muted-foreground">
                  <th className="py-2 pr-3">Member</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Member No.</th>
                  <th className="py-2 pr-3">Ghana Card</th>
                  <th className="py-2 pr-3">Phone</th>
                  <th className="py-2 pr-3">Category</th>

                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Registered</th>
                  <th className="py-2 pr-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.user_id} className="border-b border-border/60">
                    <td className="py-2 pr-3 font-medium">{r.full_name ?? "—"}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.email ?? "—"}</td>
                    <td className="py-2 pr-3">{r.member_no ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <StatusPill status={r.status} />
                      {r.status === "rejected" && r.rejection_reason ? (
                        <div className="mt-1 max-w-[240px] truncate text-xs text-muted-foreground" title={r.rejection_reason}>
                          {r.rejection_reason}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex justify-end gap-2">
                        {r.status !== "approved" ? (
                          <Button
                            size="sm"
                            onClick={() => approveMut.mutate({ user_id: r.user_id })}
                            disabled={approveMut.isPending}
                          >
                            Approve
                          </Button>
                        ) : null}
                        {r.status === "pending" ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setRejectFor(r);
                              setReason("");
                            }}
                          >
                            Reject
                          </Button>
                        ) : null}
                        {r.status === "approved" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              activeMut.mutate({ user_id: r.user_id, active: false })
                            }
                          >
                            Deactivate
                          </Button>
                        ) : null}
                        {r.status === "deactivated" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              activeMut.mutate({ user_id: r.user_id, active: true })
                            }
                          >
                            Reactivate
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </SectionCard>

      <Dialog open={!!rejectFor} onOpenChange={(open) => !open && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject registration</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Provide a reason. The user will not be able to sign in.
            </p>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="Reason for rejection (required)"
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 3 || rejectMut.isPending}
              onClick={() => {
                if (!rejectFor) return;
                rejectMut.mutate({ user_id: rejectFor.user_id, reason: reason.trim() });
              }}
            >
              {rejectMut.isPending ? "Rejecting…" : "Confirm reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "approved"
      ? "bg-emerald-100 text-emerald-800"
      : status === "pending"
        ? "bg-amber-100 text-amber-800"
        : status === "rejected"
          ? "bg-red-100 text-red-800"
          : "bg-slate-200 text-slate-800";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls}`}>
      {status}
    </span>
  );
}
