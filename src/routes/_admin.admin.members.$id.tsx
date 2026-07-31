import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Check, ExternalLink, FileText, X } from "lucide-react";
import { PageHeader, SectionCard, StatusPill } from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { decideKyc, getMemberKyc, type KycDocumentWithUrl } from "@/lib/admin-kyc.functions";

export const Route = createFileRoute("/_admin/admin/members/$id")({
  head: () => ({ meta: [{ title: "Member review — KYC" }, { name: "robots", content: "noindex" }] }),
  component: MemberDetailPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Member unavailable: {error.message}</div>
  ),
});

const memberQuery = (id: string) =>
  queryOptions({
    queryKey: ["admin", "kyc", "member", id],
    queryFn: () => getMemberKyc({ data: { member_id: id } }),
    staleTime: 15_000,
  });

function MemberDetailPage() {
  return (
    <>
      <div className="mb-4">
        <Link
          to="/admin/members"
          search={{ status: "pending", q: "", page: 1 }}
          className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-emerald-deep/60 hover:text-emerald-deep"
        >
          <ArrowLeft className="h-3 w-3" /> Back to directory
        </Link>
      </div>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <MemberDetailBody />
      </Suspense>
    </>
  );
}

function MemberDetailBody() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(memberQuery(id));
  const { profile, next_of_kin, documents } = data;

  return (
    <>
      <PageHeader
        eyebrow="Member review"
        title={profile.full_name ?? "Unnamed member"}
        description={`Member no. ${profile.member_no ?? "—"} · Joined ${new Date(profile.created_at).toLocaleDateString()}`}
        action={<StatusPill status={profile.kyc as any} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard title="Identity">
            <dl className="grid gap-4 p-6 sm:grid-cols-2">
              <Field label="Phone" value={profile.phone} />
              <Field label="National ID" value={profile.national_id} />
              <Field label="Date of birth" value={profile.date_of_birth} />
              <Field label="Gender" value={profile.gender} />
              <Field label="Region" value={profile.region} />
              <Field label="Digital address" value={profile.digital_address} />
              <Field label="Residential address" value={profile.address_line} className="sm:col-span-2" />
              <Field label="Occupation" value={profile.occupation} />
              <Field label="Employer" value={profile.employer} />
              <Field label="Membership tier" value={profile.tier} />
              <Field
                label="Last reviewed"
                value={profile.kyc_reviewed_at ? new Date(profile.kyc_reviewed_at).toLocaleString() : null}
              />
              {profile.kyc_notes ? (
                <div className="sm:col-span-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-deep/40">
                    Reviewer notes
                  </p>
                  <p className="mt-1 rounded bg-cream/60 p-3 text-sm">{profile.kyc_notes}</p>
                </div>
              ) : null}
            </dl>
          </SectionCard>

          <SectionCard title="Documents">
            {documents.length === 0 ? (
              <div className="p-6 text-sm text-emerald-deep/60">No documents uploaded.</div>
            ) : (
              <ul className="divide-y divide-emerald-deep/5">
                {documents.map((d) => (
                  <DocumentRow key={d.id} doc={d} />
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Next of kin">
            <div
              role="note"
              aria-label="Data handling notice"
              className="mx-6 mt-4 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-emerald-deep/80"
            >
              <span className="font-bold uppercase tracking-widest">Note · Confidential</span>
              <br />
              Third-party contact details, shown for KYC verification only. Identity numbers are
              masked and this panel is limited to compliance staff — do not copy, export, or share
              it outside a review.
            </div>
            {next_of_kin.length === 0 ? (
              <div className="p-6 text-sm text-emerald-deep/60">None recorded.</div>
            ) : (
              <ul className="divide-y divide-emerald-deep/5">
                {next_of_kin.map((n) => (
                  <li key={n.id} className="px-6 py-4">
                    <p className="text-sm font-semibold">{n.full_name}</p>
                    <p className="text-xs text-emerald-deep/60">
                      {n.relationship}
                      {n.phone ? ` · ${n.phone}` : ""}
                      {n.email ? ` · ${n.email}` : ""}
                    </p>
                    {n.national_id_masked ? (
                      <p className="text-[11px] text-emerald-deep/50">
                        ID {n.national_id_masked} (masked)
                      </p>
                    ) : null}
                    {n.address ? <p className="text-[11px] text-emerald-deep/50">{n.address}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

        </div>

        <DecisionPanel memberId={profile.id} kyc={profile.kyc} />
      </div>
    </>
  );
}

function DocumentRow({ doc }: { doc: KycDocumentWithUrl }) {
  const label = doc.doc_type.replace(/_/g, " ");
  return (
    <li className="flex items-center justify-between gap-3 px-6 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <FileText className="h-4 w-4 shrink-0 text-emerald-deep/60" />
        <div className="min-w-0">
          <p className="text-sm font-semibold capitalize">{label}</p>
          <p className="text-[11px] text-emerald-deep/50">
            Uploaded {new Date(doc.created_at).toLocaleString()} · {(doc.size_bytes / 1024).toFixed(0)} KB · {doc.mime_type}
          </p>
          {doc.review_notes ? (
            <p className="mt-0.5 text-[11px] text-emerald-deep/70">Notes: {doc.review_notes}</p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
            doc.status === "approved"
              ? "bg-emerald-mid/10 text-emerald-mid"
              : doc.status === "rejected"
              ? "bg-destructive/10 text-destructive"
              : "bg-gold/10 text-gold"
          }`}
        >
          {doc.status}
        </span>
        {doc.signed_url ? (
          <a
            href={doc.signed_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded border border-emerald-deep/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest hover:bg-cream"
          >
            View <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>
    </li>
  );
}

function DecisionPanel({ memberId, kyc }: { memberId: string; kyc: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const decide = useServerFn(decideKyc);
  const [notes, setNotes] = useState("");
  const mutation = useMutation({
    mutationFn: (input: { decision: "approved" | "rejected" }) =>
      decide({ data: { member_id: memberId, decision: input.decision, notes } }),
    onSuccess: (_d, vars) => {
      toast.success(`Member ${vars.decision === "approved" ? "approved" : "rejected"}`);
      qc.invalidateQueries({ queryKey: ["admin", "kyc"] });
      qc.invalidateQueries({ queryKey: ["admin", "overview"] });
      navigate({ to: "/admin/members", search: { status: "pending", q: "", page: 1 } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canDecide = kyc !== "active";

  return (
    <SectionCard title="Compliance decision">
      <div className="space-y-4 p-6">
        <p className="text-xs text-emerald-deep/60">
          Approving marks the member as verified and clears all pending documents. Rejecting requires a note explaining
          the reason so the member can resubmit.
        </p>
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/60">
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Optional for approval, required for rejection."
            className="rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm font-normal normal-case tracking-normal text-emerald-deep outline-none focus:border-emerald-mid"
          />
        </label>
        <div className="flex gap-2">
          <button
            disabled={mutation.isPending || !canDecide}
            onClick={() => mutation.mutate({ decision: "approved" })}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded bg-emerald-deep px-3 py-2 text-xs font-bold uppercase tracking-widest text-cream hover:bg-emerald-mid disabled:opacity-50"
          >
            <Check className="h-3 w-3" /> Approve
          </button>
          <button
            disabled={mutation.isPending || !canDecide || notes.trim().length < 5}
            onClick={() => mutation.mutate({ decision: "rejected" })}
            title={notes.trim().length < 5 ? "Add at least 5 characters to reject" : ""}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-destructive/40 px-3 py-2 text-xs font-bold uppercase tracking-widest text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            <X className="h-3 w-3" /> Reject
          </button>
        </div>
        {!canDecide ? (
          <p className="text-[11px] text-emerald-deep/50">
            This member is already verified. Upload a new document to reopen review.
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}

function Field({ label, value, className }: { label: string; value: string | null | undefined; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[10px] font-semibold uppercase tracking-widest text-emerald-deep/40">{label}</dt>
      <dd className="mt-1 text-sm">{value ?? "—"}</dd>
    </div>
  );
}
