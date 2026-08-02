import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Check, ExternalLink, FileText, X } from "lucide-react";
import { PageHeader, SectionCard, StatusPill } from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { AgeBadge } from "@/components/biodata-fields";
import { idTypeLabel } from "@/lib/ghana-id-types";

import {
  decideKyc,
  getKycResubmissionDiff,
  getMemberKyc,
  type KycDiffRow,
  type KycDocumentWithUrl,
} from "@/lib/admin-kyc.functions";
import { ALL_REMEDIATION_ITEMS } from "@/lib/kyc-remediation";

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
              <Field label="National ID type" value={idTypeLabel(profile.national_id_type)} />
              <Field label="National ID" value={profile.national_id} />
              <Field label="Date of birth" value={profile.date_of_birth} />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-deep/40">Age</p>
                <div className="mt-1 text-sm">
                  <AgeBadge dateOfBirth={profile.date_of_birth} />
                </div>
              </div>
              <Field
                label="Minor saver (under 18)"
                value={profile.date_of_birth ? (profile.is_minor ? "Yes" : "No") : null}
              />
              <Field label="Gender" value={profile.gender} />
              <Field label="Region" value={profile.region} />
              <Field label="District / Municipal" value={profile.district} />
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

          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <ResubmissionDiff memberId={profile.id} />
          </Suspense>
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
  const [items, setItems] = useState<string[]>([]);
  const toggleItem = (key: string) =>
    setItems((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const mutation = useMutation({
    mutationFn: (input: { decision: "approved" | "rejected" }) =>
      decide({
        data: {
          member_id: memberId,
          decision: input.decision,
          notes,
          remediation_items: input.decision === "rejected" ? items : [],
        },
      }),
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
        <fieldset className="rounded border border-emerald-deep/15 p-3">
          <legend className="px-1 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/60">
            Items the member must revise (rejection only)
          </legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {ALL_REMEDIATION_ITEMS.map((item) => (
              <label key={item.key} className="flex items-center gap-2 text-xs text-emerald-deep/80">
                <input
                  type="checkbox"
                  checked={items.includes(item.key)}
                  onChange={() => toggleItem(item.key)}
                  className="h-3.5 w-3.5 accent-emerald-deep"
                />
                {item.label}
              </label>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-emerald-deep/50">
            Only these items will be editable for the member when they resubmit.
          </p>
        </fieldset>
        <div className="flex gap-2">
          <button
            disabled={mutation.isPending || !canDecide}
            onClick={() => mutation.mutate({ decision: "approved" })}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded bg-emerald-deep px-3 py-2 text-xs font-bold uppercase tracking-widest text-cream hover:bg-emerald-mid disabled:opacity-50"
          >
            <Check className="h-3 w-3" /> Approve
          </button>
          <button
            disabled={mutation.isPending || !canDecide || notes.trim().length < 5 || items.length === 0}
            onClick={() => mutation.mutate({ decision: "rejected" })}
            title={
              notes.trim().length < 5
                ? "Add at least 5 characters to reject"
                : items.length === 0
                  ? "Select at least one item to revise"
                  : ""
            }
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

const diffQuery = (id: string) =>
  queryOptions({
    queryKey: ["admin", "kyc", "member", id, "diff"],
    queryFn: () => getKycResubmissionDiff({ data: { member_id: id } }),
    staleTime: 15_000,
  });

/**
 * Side-by-side comparison of the rejected submission and the resubmitted one.
 * Reviewer-requested items are pinned to the top; anything the member changed
 * without being asked is still surfaced so it cannot slip through unnoticed.
 */
function ResubmissionDiff({ memberId }: { memberId: string }) {
  const { data } = useSuspenseQuery(diffQuery(memberId));
  const [showAll, setShowAll] = useState(false);

  if (!data.has_snapshot) {
    return (
      <SectionCard title="Resubmission changes">
        <p className="px-6 py-4 text-sm text-emerald-deep/60">
          No rejected baseline is on file for this member, so there is nothing to compare yet. A
          baseline is captured automatically the next time a submission is declined.
        </p>
      </SectionCard>
    );
  }

  const visible = showAll ? data.rows : data.rows.filter((r) => r.requested || r.changed);

  return (
    <SectionCard
      title="Resubmission changes"
      action={
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-[11px] font-bold uppercase tracking-widest text-emerald-deep/60 hover:text-emerald-deep"
        >
          {showAll ? "Show changes only" : "Show all fields"}
        </button>
      }
    >
      <div className="space-y-3 px-6 py-4">
        <p className="text-xs text-emerald-deep/70">
          Declined {data.reviewed_at ? new Date(data.reviewed_at).toLocaleString() : "—"} · Resubmitted{" "}
          {data.resubmitted_at ? new Date(data.resubmitted_at).toLocaleString() : "not yet"} · Attempt{" "}
          {data.attempts_used}
        </p>
        <div className="flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-widest">
          <span className="rounded bg-success/10 px-2 py-1 text-success">
            {data.changed_count} changed
          </span>
          <span
            className={
              "rounded px-2 py-1 " +
              (data.unchanged_requested_count > 0
                ? "bg-destructive/10 text-destructive"
                : "bg-emerald-deep/5 text-emerald-deep/60")
            }
          >
            {data.unchanged_requested_count} requested but unchanged
          </span>
        </div>

        {visible.length === 0 ? (
          <p className="text-sm text-emerald-deep/60">Nothing changed since the rejection.</p>
        ) : (
          <ul className="divide-y divide-emerald-deep/10">
            {visible.map((row) => (
              <DiffRow key={row.key} row={row} />
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}

function DiffRow({ row }: { row: KycDiffRow }) {
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-emerald-deep">{row.label}</span>
        {row.requested ? (
          <span className="rounded bg-emerald-deep/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/70">
            Requested
          </span>
        ) : null}
        <span
          className={
            "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest " +
            (row.changed ? "bg-success/10 text-success" : "bg-emerald-deep/5 text-emerald-deep/50")
          }
        >
          {row.changed ? "Changed" : "Unchanged"}
        </span>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <DiffSide
          heading="At rejection"
          value={row.before}
          url={row.before_url}
          at={row.before_at}
          tone={row.changed ? "old" : "flat"}
        />
        <DiffSide
          heading="Now"
          value={row.after}
          url={row.after_url}
          at={row.after_at}
          tone={row.changed ? "new" : "flat"}
        />
      </div>
    </li>
  );
}

function DiffSide({
  heading,
  value,
  url,
  at,
  tone,
}: {
  heading: string;
  value: string | null;
  url: string | null;
  at: string | null;
  tone: "old" | "new" | "flat";
}) {
  const toneClass =
    tone === "old"
      ? "border-destructive/25 bg-destructive/5"
      : tone === "new"
        ? "border-success/30 bg-success/5"
        : "border-emerald-deep/10 bg-cream/30";
  return (
    <div className={`rounded border px-3 py-2 ${toneClass}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-deep/50">{heading}</p>
      <p className={`mt-1 break-words text-sm ${tone === "old" ? "line-through opacity-70" : ""}`}>
        {value ?? "—"}
      </p>
      {at ? (
        <p className="mt-1 text-[10px] text-emerald-deep/50">{new Date(at).toLocaleString()}</p>
      ) : null}
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-deep hover:underline"
        >
          Open file <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </div>
  );
}
