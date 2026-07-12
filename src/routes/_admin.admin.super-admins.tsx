import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { EmptyState, PageHeader, SectionCard, StatusPill } from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import {
  grantSuperAdmin,
  listSeedEmails,
  listSuperAdmins,
  revokeSuperAdmin,
  type SeedEmailRow,
  type SuperAdminRow,
} from "@/lib/admin-roles.functions";

export const Route = createFileRoute("/_admin/admin/super-admins")({
  head: () => ({
    meta: [
      { title: "Super Admins — Infinity Wealth" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SuperAdminsPage,
});

const rowsQuery = () =>
  queryOptions({
    queryKey: ["admin", "super-admins"],
    queryFn: async () => await listSuperAdmins(),
  });

const seedQuery = () =>
  queryOptions({
    queryKey: ["admin", "super-admins", "seed"],
    queryFn: async () => await listSeedEmails(),
  });

function SuperAdminsPage() {
  const { user, hasRole, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  if (!hasRole("super_admin")) return <Navigate to="/admin" />;
  return (
    <>
      <PageHeader
        eyebrow="Governance"
        title="Super Admin directory"
        description="Grant, revoke and audit Super Admin access. Only Super Admins can view or modify this list."
      />
      <Suspense fallback={<SkeletonRows />}>
        <Directory currentUserId={user.id} />
      </Suspense>
    </>
  );
}

function SkeletonRows() {
  return (
    <SectionCard title="Loading">
      <div className="space-y-2 p-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </SectionCard>
  );
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
}

function Directory({ currentUserId }: { currentUserId: string }) {
  const rows = useSuspenseQuery(rowsQuery()).data;
  const seed = useSuspenseQuery(seedQuery()).data;
  const qc = useQueryClient();

  const [grantOpen, setGrantOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<SuperAdminRow | null>(null);

  const grantFn = useServerFn(grantSuperAdmin);
  const revokeFn = useServerFn(revokeSuperAdmin);

  const grant = useMutation({
    mutationFn: async (vars: { email: string; note?: string }) =>
      await grantFn({ data: vars }),
    onSuccess: (r) => {
      toast.success("Super Admin granted", { description: r?.email });
      setGrantOpen(false);
      void qc.invalidateQueries({ queryKey: ["admin", "super-admins"] });
    },
    onError: (err: Error) => toast.error("Grant failed", { description: err.message }),
  });

  const revoke = useMutation({
    mutationFn: async (vars: { user_id: string; reason: string }) =>
      await revokeFn({ data: vars }),
    onSuccess: () => {
      toast.success("Super Admin revoked");
      setRevokeTarget(null);
      void qc.invalidateQueries({ queryKey: ["admin", "super-admins"] });
    },
    onError: (err: Error) => toast.error("Revoke failed", { description: err.message }),
  });

  return (
    <>
      <SectionCard
        title={`Super Admins (${rows.length})`}
        action={
          <button
            onClick={() => setGrantOpen(true)}
            className="rounded bg-gold px-4 py-2 text-xs font-semibold uppercase tracking-widest text-emerald-deep hover:opacity-90"
          >
            Grant Super Admin
          </button>
        }
      >
        {rows.length === 0 ? (
          <EmptyState title="No Super Admins" hint="This should never happen — contact support." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
                  <th className="px-6 py-3 font-medium">Member</th>
                  <th className="px-6 py-3 font-medium">Email</th>
                  <th className="px-6 py-3 font-medium">Granted</th>
                  <th className="px-6 py-3 font-medium">Granted by</th>
                  <th className="px-6 py-3 font-medium">Source</th>
                  <th className="px-6 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isSelf = r.user_id === currentUserId;
                  return (
                    <tr key={r.user_id} className="border-b border-emerald-deep/5">
                      <td className="px-6 py-3">
                        <div className="font-medium">{r.full_name ?? "—"}</div>
                        <div className="text-xs text-emerald-deep/50">{r.member_no ?? "—"}</div>
                      </td>
                      <td className="px-6 py-3 tabular">{r.email}</td>
                      <td className="px-6 py-3 tabular">{fmtDate(r.granted_at)}</td>
                      <td className="px-6 py-3 tabular">{r.granted_by_email ?? "system"}</td>
                      <td className="px-6 py-3">
                        <StatusPill status={r.seeded ? "cleared" : "pending"} />

                      </td>
                      <td className="px-6 py-3 text-right">
                        <button
                          disabled={isSelf}
                          onClick={() => setRevokeTarget(r)}
                          className="rounded border border-emerald-deep/15 px-3 py-1 text-xs uppercase tracking-widest disabled:opacity-40"
                          title={isSelf ? "You cannot revoke your own role" : "Revoke Super Admin"}
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SeedList seed={seed} />

      <GrantDialog
        open={grantOpen}
        onOpenChange={setGrantOpen}
        pending={grant.isPending}
        onSubmit={(email, note) => grant.mutate({ email, note })}
      />
      <RevokeDialog
        target={revokeTarget}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
        pending={revoke.isPending}
        onSubmit={(reason) => {
          if (!revokeTarget) return;
          revoke.mutate({ user_id: revokeTarget.user_id, reason });
        }}
      />
    </>
  );
}

function SeedList({ seed }: { seed: SeedEmailRow[] }) {
  return (
    <SectionCard title={`Seeded emails (${seed.length})`}>
      <div className="border-b border-emerald-deep/5 px-6 py-3 text-xs text-emerald-deep/60">
        Emails on this allow-list may self-provision Super Admin on first confirmed sign-in. Managed automatically when granting or revoking.
      </div>
      {seed.length === 0 ? (
        <EmptyState title="No seeded emails" hint="Every Super Admin was granted manually." />
      ) : (
        <ul className="divide-y divide-emerald-deep/5">
          {seed.map((s) => (
            <li key={s.email} className="flex items-center justify-between px-6 py-3 text-sm">
              <div>
                <div className="tabular">{s.email}</div>
                {s.note ? (
                  <div className="text-xs text-emerald-deep/50">{s.note}</div>
                ) : null}
              </div>
              <div className="text-xs text-emerald-deep/50 tabular">{fmtDate(s.created_at)}</div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function GrantDialog({
  open,
  onOpenChange,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (email: string, note?: string) => void;
  pending: boolean;
}) {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant Super Admin</DialogTitle>
          <DialogDescription>
            The account must already exist and have a confirmed email. This will be recorded in the audit log.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <label className="block text-xs uppercase tracking-widest text-emerald-deep/60">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="w-full rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm"
          />
          <label className="block text-xs uppercase tracking-widest text-emerald-deep/60">Note (optional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm"
          />
        </div>
        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded border border-emerald-deep/15 px-4 py-2 text-xs uppercase tracking-widest"
          >
            Cancel
          </button>
          <button
            disabled={pending || !email}
            onClick={() => onSubmit(email.trim(), note.trim() || undefined)}
            className="rounded bg-emerald-deep px-4 py-2 text-xs font-semibold uppercase tracking-widest text-cream disabled:opacity-40"
          >
            {pending ? "Granting…" : "Grant"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevokeDialog({
  target,
  onOpenChange,
  onSubmit,
  pending,
}: {
  target: SuperAdminRow | null;
  onOpenChange: (o: boolean) => void;
  onSubmit: (reason: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke Super Admin</DialogTitle>
          <DialogDescription>
            Removes Super Admin from <b>{target?.email}</b> and their seed entry. Provide a reason for the audit log.
          </DialogDescription>
        </DialogHeader>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Reason for revoking (required, min 3 characters)"
          className="mt-2 w-full rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm"
        />
        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded border border-emerald-deep/15 px-4 py-2 text-xs uppercase tracking-widest"
          >
            Cancel
          </button>
          <button
            disabled={pending || reason.trim().length < 3}
            onClick={() => onSubmit(reason.trim())}
            className="rounded bg-red-600 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-cream disabled:opacity-40"
          >
            {pending ? "Revoking…" : "Revoke"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
