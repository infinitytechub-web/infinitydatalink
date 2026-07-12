import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
  StatusPill,
} from "@/components/primitives";
import {
  getEntity,
  decideEntity,
  addEntityMember,
  removeEntityMember,
} from "@/lib/admin-entities.functions";

export const Route = createFileRoute("/_admin/admin/entities/$entityId")({
  component: EntityDetail,
  errorComponent: ({ error }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <ErrorState title="Entity failed to load" message={error.message} onRetry={() => router.invalidate()} />
      </div>
    );
  },
});

const detailQuery = (id: string) =>
  queryOptions({
    queryKey: ["admin", "entity", id],
    queryFn: () => getEntity({ data: { id } }),
  });

function EntityDetail() {
  const { entityId } = Route.useParams();
  return (
    <>
      <div className="mb-4">
        <Link to="/admin/entities" search={{ type: "all", status: "all" }} className="text-xs text-muted-foreground hover:text-foreground">
          ← Back to entities
        </Link>
      </div>
      <Suspense fallback={<SectionCardSkeleton title="Entity" rows={6} cols={2} />}>
        <EntityBody entityId={entityId} />
      </Suspense>
    </>
  );
}

function EntityBody({ entityId }: { entityId: string }) {
  const { data } = useSuspenseQuery(detailQuery(entityId));
  const { entity, members } = data;
  const qc = useQueryClient();
  const decideFn = useServerFn(decideEntity);
  const addFn = useServerFn(addEntityMember);
  const removeFn = useServerFn(removeEntityMember);

  const decide = useMutation({
    mutationFn: (vars: { action: "approve" | "suspend"; note: string }) =>
      decideFn({ data: { id: entity.id, action: vars.action, note: vars.note } }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["admin", "entity", entityId] });
      qc.invalidateQueries({ queryKey: ["admin", "entities"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed"),
  });

  const [memberNo, setMemberNo] = useState("");
  const [role, setRole] = useState<"owner" | "admin" | "member">("member");
  const add = useMutation({
    mutationFn: () => addFn({ data: { entity_id: entity.id, member_no: memberNo, role } }),
    onSuccess: () => {
      toast.success("Member added");
      setMemberNo("");
      qc.invalidateQueries({ queryKey: ["admin", "entity", entityId] });
    },
    onError: (e: any) => toast.error(e.message || "Failed"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["admin", "entity", entityId] });
    },
    onError: (e: any) => toast.error(e.message || "Failed"),
  });

  return (
    <>
      <PageHeader
        eyebrow={entity.type.toUpperCase()}
        title={entity.name}
        description={entity.kyc_notes ?? "Registration details and membership."}
        action={<StatusPill status={entity.status as any} />}
      />

      <div className="space-y-8">
        <SectionCard title="Registration details">
          <dl className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            <Detail label="Registration no." value={entity.registration_no} />
            <Detail label="Tax ID" value={entity.tax_id} />
            <Detail label="Region" value={entity.region} />
            <Detail label="Address" value={entity.address_line} />
            <Detail label="Digital address" value={entity.digital_address} />
            <Detail label="Contact email" value={entity.contact_email} />
            <Detail label="Contact phone" value={entity.contact_phone} />
            <Detail label="Reviewed at" value={entity.reviewed_at ? new Date(entity.reviewed_at).toLocaleString() : null} />
            <Detail label="Created" value={new Date(entity.created_at).toLocaleString()} />
          </dl>
          {entity.status === "pending" ? (
            <div className="flex flex-wrap gap-2 border-t border-border p-6">
              <button
                className="rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
                onClick={() => {
                  const note = window.prompt("Approval note (required)?");
                  if (!note || note.trim().length < 3) return;
                  decide.mutate({ action: "approve", note });
                }}
              >
                Approve
              </button>
              <button
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20"
                onClick={() => {
                  const note = window.prompt("Reason for suspension?");
                  if (!note || note.trim().length < 3) return;
                  decide.mutate({ action: "suspend", note });
                }}
              >
                Suspend
              </button>
            </div>
          ) : entity.status === "active" ? (
            <div className="border-t border-border p-6">
              <button
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20"
                onClick={() => {
                  const note = window.prompt("Reason for suspension?");
                  if (!note || note.trim().length < 3) return;
                  decide.mutate({ action: "suspend", note });
                }}
              >
                Suspend
              </button>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title="Members">
          <form
            className="grid gap-3 border-b border-border p-6 md:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!memberNo.trim()) return;
              add.mutate();
            }}
          >
            <input
              className="rounded-md border border-border bg-background px-3 py-2 text-sm md:col-span-2"
              placeholder="Member number (e.g. MB-00042)"
              value={memberNo}
              onChange={(e) => setMemberNo(e.target.value)}
            />
            <select className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={role} onChange={(e) => setRole(e.target.value as any)}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </select>
            <button type="submit" disabled={add.isPending} className="rounded-md bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {add.isPending ? "Adding…" : "Add member"}
            </button>
          </form>
          {members.length === 0 ? (
            <div className="p-6"><EmptyState title="No members yet" /></div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 text-left">Member #</th>
                  <th className="px-6 py-3 text-left">Name</th>
                  <th className="px-6 py-3 text-left">Role</th>
                  <th className="px-6 py-3 text-left">Joined</th>
                  <th className="px-6 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="px-6 py-3 font-mono text-xs">{m.member_no ?? "—"}</td>
                    <td className="px-6 py-3">{m.member_name ?? "—"}</td>
                    <td className="px-6 py-3 capitalize">{m.role}</td>
                    <td className="px-6 py-3 text-xs text-muted-foreground">{new Date(m.joined_at).toLocaleDateString()}</td>
                    <td className="px-6 py-3 text-right">
                      {m.role !== "owner" ? (
                        <button
                          className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/20"
                          onClick={() => remove.mutate(m.id)}
                        >
                          Remove
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-foreground">{value ?? <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}
