import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  EmptyState,
  ErrorState,
  KPIStat,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
  StatusPill,
} from "@/components/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KycRecordActions } from "@/components/kyc-record-actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getEntity,
  decideEntity,
  addEntityMember,
  removeEntityMember,
  lookupMemberByNumber,
  listEntityDocuments,
  uploadEntityDocument,
  getEntityDocumentUrl,
  listEntityTimeline,
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
  queryOptions({ queryKey: ["admin", "entity", id], queryFn: () => getEntity({ data: { id } }) });

function EntityDetail() {
  const { entityId } = Route.useParams();
  return (
    <>
      <div className="mb-4">
        <Link
          to="/admin/entities"
          search={{ type: "all", status: "all", q: "", page: 1 }}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
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
  const [decideDialog, setDecideDialog] = useState<null | "approve" | "suspend">(null);
  const [decideNote, setDecideNote] = useState("");

  const decide = useMutation({
    mutationFn: (vars: { action: "approve" | "suspend"; note: string }) =>
      decideFn({ data: { id: entity.id, action: vars.action, note: vars.note } }),
    onSuccess: () => {
      toast.success("Updated");
      setDecideDialog(null);
      setDecideNote("");
      qc.invalidateQueries({ queryKey: ["admin", "entity", entityId] });
      qc.invalidateQueries({ queryKey: ["admin", "entities"] });
      qc.invalidateQueries({ queryKey: ["admin", "entity-timeline", entityId] });
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

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <KPIStat label="Status" value={<span className="capitalize">{entity.status}</span>} />
        <KPIStat label="Members" value={<span className="tabular">{members.length}</span>} />
        <KPIStat label="Region" value={entity.region ?? "—"} />
        <KPIStat
          label="Registered"
          value={new Date(entity.created_at).toLocaleDateString()}
          hint={entity.reviewed_at ? `Reviewed ${new Date(entity.reviewed_at).toLocaleDateString()}` : "Never reviewed"}
        />
      </section>

      <div className="mb-4">
        <KycRecordActions
          size="md"
          label={`${entity.type} KYC record`}
          title={`${entity.type.toUpperCase()} KYC — ${entity.name}`}
          subtitle={`Status ${entity.status}`}
          filename={`entity_kyc_${entity.name}`}
          fields={[
            { label: "Name", value: entity.name },
            { label: "Type", value: entity.type },
            { label: "Status", value: entity.status },
            { label: "Region", value: entity.region ?? "—" },
            { label: "Registration no.", value: (entity as any).reg_no ?? "—" },
            { label: "Members", value: String(members.length) },
            { label: "Registered", value: new Date(entity.created_at).toLocaleString() },
            {
              label: "Reviewed",
              value: entity.reviewed_at ? new Date(entity.reviewed_at).toLocaleString() : "Never",
            },
            { label: "Review notes", value: entity.kyc_notes ?? "—" },
          ]}
          approveLabel="Approve"
          rejectLabel={entity.status === "pending" ? "Reject" : "Suspend"}
          disabled={{
            approve: entity.status !== "pending",
            reject: entity.status !== "pending" && entity.status !== "active",
          }}
          onDecide={async (decision, note) => {
            await decide.mutateAsync({
              action: decision === "approved" ? "approve" : "suspend",
              note,
            });
          }}
        />
      </div>


      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <SectionCard title="Registration details">
            <dl className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3 text-sm">
              <Detail label="Registration no." value={entity.registration_no} />
              <Detail label="Tax ID" value={entity.tax_id} />
              <Detail label="Region" value={entity.region} />
              <Detail label="Address" value={entity.address_line} />
              <Detail label="Digital address" value={entity.digital_address} />
              <Detail label="Contact email" value={entity.contact_email} />
              <Detail label="Contact phone" value={entity.contact_phone} />
              <Detail
                label="Reviewed at"
                value={entity.reviewed_at ? new Date(entity.reviewed_at).toLocaleString() : null}
              />
              <Detail label="Created" value={new Date(entity.created_at).toLocaleString()} />
            </dl>
          </SectionCard>
        </TabsContent>

        <TabsContent value="members">
          <MembersTab entityId={entity.id} members={members} />
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsTab entityId={entity.id} />
        </TabsContent>

        <TabsContent value="timeline">
          <TimelineTab entityId={entity.id} />
        </TabsContent>
      </Tabs>

      <Dialog open={decideDialog !== null} onOpenChange={(o) => (!o ? setDecideDialog(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decideDialog === "approve" ? "Approve entity" : "Suspend entity"}</DialogTitle>
            <DialogDescription>
              {decideDialog === "approve"
                ? "This activates the entity so members can transact. A note is required for audit."
                : "This suspends the entity immediately. Provide a reason for compliance records."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <Textarea
              id="note"
              rows={4}
              placeholder={decideDialog === "approve" ? "Approval note…" : "Reason for suspension…"}
              value={decideNote}
              onChange={(e) => setDecideNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDecideDialog(null)} disabled={decide.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => decide.mutate({ action: decideDialog!, note: decideNote.trim() })}
              disabled={decide.isPending || decideNote.trim().length < 3}
              variant={decideDialog === "suspend" ? "destructive" : "default"}
            >
              {decide.isPending ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ----------------------------- Members ----------------------------- */

function MembersTab({
  entityId,
  members,
}: {
  entityId: string;
  members: Awaited<ReturnType<typeof getEntity>>["members"];
}) {
  const qc = useQueryClient();
  const addFn = useServerFn(addEntityMember);
  const removeFn = useServerFn(removeEntityMember);
  const lookupFn = useServerFn(lookupMemberByNumber);
  const [memberNo, setMemberNo] = useState("");
  const [role, setRole] = useState<"owner" | "admin" | "member">("member");

  const lookup = useQuery({
    queryKey: ["member-lookup", memberNo],
    queryFn: () => lookupFn({ data: { member_no: memberNo.trim() } }),
    enabled: memberNo.trim().length >= 3,
    staleTime: 30_000,
  });

  const add = useMutation({
    mutationFn: () => addFn({ data: { entity_id: entityId, member_no: memberNo, role } }),
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
    <SectionCard title="Members">
      <form
        className="grid gap-3 border-b border-border p-6 md:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!memberNo.trim()) return;
          add.mutate();
        }}
      >
        <div className="md:col-span-2">
          <Input
            placeholder="Member number (e.g. MB-00042)"
            value={memberNo}
            onChange={(e) => setMemberNo(e.target.value)}
          />
          {memberNo.trim().length >= 3 ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {lookup.isFetching
                ? "Searching…"
                : lookup.data
                ? `Match: ${lookup.data.full_name ?? "(no name)"}`
                : "No match — cannot add"}
            </p>
          ) : null}
        </div>
        <select
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={role}
          onChange={(e) => setRole(e.target.value as any)}
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
          <option value="owner">Owner</option>
        </select>
        <Button type="submit" disabled={add.isPending || !lookup.data}>
          {add.isPending ? "Adding…" : "Add member"}
        </Button>
      </form>
      {members.length === 0 ? (
        <div className="p-6"><EmptyState title="No members yet" /></div>
      ) : (
        <div className="overflow-x-auto">
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
                  <td className="px-6 py-3 text-xs text-muted-foreground">
                    {new Date(m.joined_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {m.role !== "owner" ? (
                      <Button size="sm" variant="ghost" onClick={() => remove.mutate(m.id)}>
                        Remove
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

/* ----------------------------- Documents ----------------------------- */

const DOC_LABEL: Record<string, string> = {
  registration_cert: "Registration cert.",
  tax_cert: "Tax certificate",
  mandate_letter: "Mandate letter",
  id_document: "ID document",
  other: "Other",
};

function DocumentsTab({ entityId }: { entityId: string }) {
  const qc = useQueryClient();
  const uploadFn = useServerFn(uploadEntityDocument);
  const urlFn = useServerFn(getEntityDocumentUrl);
  const [docType, setDocType] = useState<"registration_cert" | "tax_cert" | "mandate_letter" | "id_document" | "other">(
    "registration_cert",
  );
  const [file, setFile] = useState<File | null>(null);

  const q = useQuery({
    queryKey: ["admin", "entity-documents", entityId],
    queryFn: () => listEntityDocuments({ data: { entity_id: entityId } }),
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Select a file");
      const b64: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onerror = () => rej(r.error);
        r.onload = () => res(String(r.result).replace(/^data:[^;]+;base64,/, ""));
        r.readAsDataURL(file);
      });
      await uploadFn({
        data: {
          entity_id: entityId,
          doc_type: docType,
          filename: file.name,
          mime_type: file.type,
          content_base64: b64,
        },
      });
    },
    onSuccess: () => {
      toast.success("Uploaded");
      setFile(null);
      qc.invalidateQueries({ queryKey: ["admin", "entity-documents", entityId] });
      qc.invalidateQueries({ queryKey: ["admin", "entity-timeline", entityId] });
    },
    onError: (e: any) => toast.error(e.message || "Upload failed"),
  });

  const open = useMutation({
    mutationFn: async (id: string) => (await urlFn({ data: { id } })).url,
    onSuccess: (url) => window.open(url, "_blank", "noopener,noreferrer"),
    onError: (e: any) => toast.error(e.message || "Failed"),
  });

  return (
    <SectionCard title="Documents">
      <form
        className="grid gap-3 border-b border-border p-6 md:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          upload.mutate();
        }}
      >
        <select
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={docType}
          onChange={(e) => setDocType(e.target.value as any)}
        >
          {Object.entries(DOC_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input
          className="md:col-span-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
          type="file"
          accept="image/png,image/jpeg,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <Button type="submit" disabled={upload.isPending || !file}>
          {upload.isPending ? "Uploading…" : "Upload"}
        </Button>
      </form>
      {q.isLoading ? (
        <div className="p-6 text-xs text-muted-foreground">Loading…</div>
      ) : (q.data ?? []).length === 0 ? (
        <div className="p-6"><EmptyState title="No documents yet" hint="Attach registration or KYC documents above." /></div>
      ) : (
        <ul className="divide-y divide-border">
          {(q.data ?? []).map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-6 py-3 text-sm">
              <span className="min-w-32 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {DOC_LABEL[d.doc_type] ?? d.doc_type}
              </span>
              <span className="flex-1 truncate">{d.original_name ?? d.storage_path}</span>
              <span className="text-xs text-muted-foreground">
                {d.size_bytes ? `${(d.size_bytes / 1024).toFixed(0)} KB` : ""}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(d.created_at).toLocaleDateString()}
              </span>
              <Button size="sm" variant="ghost" onClick={() => open.mutate(d.id)} disabled={open.isPending}>
                View
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/* ----------------------------- Timeline ----------------------------- */

function TimelineTab({ entityId }: { entityId: string }) {
  const q = useQuery({
    queryKey: ["admin", "entity-timeline", entityId],
    queryFn: () => listEntityTimeline({ data: { entity_id: entityId, limit: 100 } }),
  });
  return (
    <SectionCard title="Audit timeline">
      {q.isLoading ? (
        <div className="p-6 text-xs text-muted-foreground">Loading…</div>
      ) : (q.data ?? []).length === 0 ? (
        <div className="p-6"><EmptyState title="No audit events" hint="Actions on this entity will appear here." /></div>
      ) : (
        <ol className="divide-y divide-border">
          {(q.data ?? []).map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-3 px-6 py-3 text-sm">
              <span className="w-40 shrink-0 text-xs text-muted-foreground">
                {new Date(e.created_at).toLocaleString()}
              </span>
              <span className="font-mono text-xs">{e.action}</span>
              <span className="text-xs text-muted-foreground">
                {e.actor_email ?? "system"} · {e.actor_role ?? "—"}
              </span>
              {e.meta ? (
                <code className="ml-auto max-w-lg truncate rounded bg-muted px-2 py-1 text-[11px]">
                  {JSON.stringify(e.meta)}
                </code>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
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
