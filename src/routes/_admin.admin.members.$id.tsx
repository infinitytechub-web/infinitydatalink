import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Check, ExternalLink, X } from "lucide-react";
import { PageHeader, SectionCard, StatusPill } from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { AgeBadge } from "@/components/biodata-fields";
import { idTypeLabel } from "@/lib/ghana-id-types";
import { MinorAttestationUploads } from "@/components/minor-attestation-uploads";
import { KycRecordActions } from "@/components/kyc-record-actions";
import { DocumentPreviewPanel } from "@/components/document-preview-panel";
import { IfCan } from "@/components/record-actions";



import {
  decideKyc,
  getKycResubmissionDiff,
  getMemberKyc,
  listMinorStatusChanges,
  type KycDiffRow,
} from "@/lib/admin-kyc.functions";
import { ALL_REMEDIATION_ITEMS } from "@/lib/kyc-remediation";
import { RISK_SEVERITY_LABEL } from "@/lib/kyc-risk-rules";
import { useStepUp } from "@/components/step-up-dialog";
import {
  MINOR_DECISION_NOTE_MIN,
  eligibleGuardians,
  evaluateMinorGuardrails,
  type GuardianCandidate,
} from "@/lib/kyc-minor-rules";
import { resolveMinorStatus } from "@/lib/age";
import { useQuery } from "@tanstack/react-query";


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
        action={
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill status={profile.kyc as any} />
            <KycRecordActions
              label="individual KYC record"
              title={`Individual KYC — ${profile.full_name ?? profile.member_no ?? profile.id}`}
              subtitle={`Status ${profile.kyc}`}
              filename={`kyc_${profile.member_no ?? profile.id}`}
              fields={[
                { label: "Member", value: profile.full_name ?? "—" },
                { label: "Member no.", value: profile.member_no ?? "—" },
                { label: "Phone", value: profile.phone ?? "—" },
                { label: "National ID type", value: idTypeLabel(profile.national_id_type) ?? "—" },
                { label: "National ID", value: profile.national_id ?? "—" },
                { label: "Date of birth", value: profile.date_of_birth ?? "—" },
                {
                  label: "Under 18",
                  value: resolveMinorStatus(profile.date_of_birth, profile.is_minor).effective ? "Yes" : "No",
                },
                { label: "Gender", value: profile.gender ?? "—" },
                { label: "Region", value: profile.region ?? "—" },
                { label: "District", value: profile.district ?? "—" },
                { label: "Digital address", value: profile.digital_address ?? "—" },
                { label: "Residential address", value: profile.address_line ?? "—" },
                { label: "Occupation", value: profile.occupation ?? "—" },
                { label: "Employer", value: profile.employer ?? "—" },
                { label: "Membership tier", value: profile.tier ?? "—" },
                { label: "KYC status", value: profile.kyc },
                { label: "Documents on file", value: String(documents.length) },
                { label: "Reviewer notes", value: profile.kyc_notes ?? "—" },
              ]}
              onView={() => {
                document
                  .getElementById("kyc-documents")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              onEdit={() => {
                document
                  .getElementById("kyc-decision")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            />
          </div>
        }
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
                  <AgeBadge dateOfBirth={profile.date_of_birth} storedIsMinor={profile.is_minor} />
                </div>
              </div>
              <Field
                label="Minor saver (under 18)"
                value={
                  profile.date_of_birth || profile.is_minor
                    ? resolveMinorStatus(profile.date_of_birth, profile.is_minor).effective
                      ? "Yes"
                      : "No"
                    : null
                }
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

          <MinorHistoryCard memberId={profile.id} />



          <div id="kyc-documents" />
          <DocumentPreviewPanel
            documents={documents}
            isMinor={resolveMinorStatus(profile.date_of_birth, profile.is_minor).effective}
          />


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

        <div id="kyc-decision" className="contents">
          <IfCan module="kyc" action="approve">
            <DecisionPanel
              memberId={profile.id}
              kyc={profile.kyc}
              isMinor={!!profile.is_minor}
              nextOfKin={next_of_kin}
            />
          </IfCan>
        </div>

        {profile.is_minor ? <MinorAttestationUploads memberId={profile.id} /> : null}


      </div>
    </>
  );
}




function DecisionPanel({
  memberId,
  kyc,
  isMinor,
  nextOfKin,
}: {
  memberId: string;
  kyc: string;
  isMinor: boolean;
  nextOfKin: readonly GuardianCandidate[];
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const decide = useServerFn(decideKyc);
  const { ensure, dialog } = useStepUp();
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const toggleItem = (key: string) =>
    setItems((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  // Minor-specific review state
  const guardians = eligibleGuardians(nextOfKin);
  const [guardianId, setGuardianId] = useState("");
  const [consentRef, setConsentRef] = useState("");
  const [guardianIdVerified, setGuardianIdVerified] = useState(false);
  const [safeguardingAck, setSafeguardingAck] = useState(false);

  const minorReview = {
    guardian_nok_id: guardianId,
    guardian_consent_ref: consentRef.trim(),
    guardian_id_verified: guardianIdVerified,
    safeguarding_ack: safeguardingAck,
  };

  const mutation = useMutation({
    mutationFn: async (input: { decision: "approved" | "rejected" }) => {
      const stepUpToken = isMinor
        ? await ensure(
            `${input.decision === "approved" ? "approve" : "reject"} KYC for a minor account`,
          )
        : undefined;
      return decide({
        data: {
          member_id: memberId,
          decision: input.decision,
          notes,
          remediation_items: input.decision === "rejected" ? items : [],
          ...(isMinor ? { minor_review: minorReview, step_up_token: stepUpToken } : {}),
        },
      });
    },
    onSuccess: (_d, vars) => {
      toast.success(`Member ${vars.decision === "approved" ? "approved" : "rejected"}`);
      qc.invalidateQueries({ queryKey: ["admin", "kyc"] });
      qc.invalidateQueries({ queryKey: ["admin", "overview"] });
      navigate({ to: "/admin/members", search: { status: "pending", q: "", page: 1 } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canDecide = kyc !== "active";
  const minorBlockers = (decision: "approved" | "rejected") =>
    evaluateMinorGuardrails({ isMinor, decision, notes, minorReview, nextOfKin }).blockers;
  const approveBlockers = minorBlockers("approved");
  const rejectBlockers = minorBlockers("rejected");


  return (
    <SectionCard title="Compliance decision">
      <div className="space-y-4 p-6">
        <p className="text-xs text-emerald-deep/60">
          Approving marks the member as verified and unlocks full portal access. Every decision needs a
          reviewer note of at least 5 characters, and approval is only possible once all required details
          and documents have been submitted.
        </p>
        {isMinor ? (
          <div className="rounded border border-gold/40 bg-gold/10 p-3 text-[11px] text-emerald-deep/80">
            <strong className="uppercase tracking-widest">Minor account</strong> — this member is under
            18. Every decision needs a verified guardian, a consent reference, a note of at least{" "}
            {MINOR_DECISION_NOTE_MIN} characters, and fresh re-authentication. Minors are excluded from
            bulk decisions, and each decision is broadcast to compliance leadership for secondary review.
          </div>
        ) : null}
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/60">
          Reviewer notes (required)
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder={
              isMinor
                ? `Required for minors — at least ${MINOR_DECISION_NOTE_MIN} characters.`
                : "Required — at least 5 characters explaining the decision."
            }
            className="rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm font-normal normal-case tracking-normal text-emerald-deep outline-none focus:border-emerald-mid"
          />
        </label>

        {isMinor ? (
          <fieldset className="space-y-3 rounded border border-gold/40 p-3">
            <legend className="px-1 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/60">
              Guardian verification (minor)
            </legend>
            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/60">
              Verified guardian
              <select
                value={guardianId}
                onChange={(e) => setGuardianId(e.target.value)}
                className="rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none focus:border-emerald-mid"
              >
                <option value="">Select guardian…</option>
                {guardians.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.full_name ?? "Unnamed"} · {g.relationship} · {g.phone}
                  </option>
                ))}
              </select>
            </label>
            {guardians.length === 0 ? (
              <p className="text-[11px] text-destructive">
                No eligible guardian on file. Add a next-of-kin with a parent/guardian relationship and a
                phone number before deciding.
              </p>
            ) : null}
            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/60">
              Guardian consent reference
              <input
                value={consentRef}
                onChange={(e) => setConsentRef(e.target.value)}
                placeholder="e.g. CONSENT-2026-014"
                className="rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none focus:border-emerald-mid"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-emerald-deep/80">
              <input
                type="checkbox"
                checked={guardianIdVerified}
                onChange={(e) => setGuardianIdVerified(e.target.checked)}
                className="h-3.5 w-3.5 accent-emerald-deep"
              />
              Guardian identity document sighted and matches the consent
            </label>
            <label className="flex items-center gap-2 text-xs text-emerald-deep/80">
              <input
                type="checkbox"
                checked={safeguardingAck}
                onChange={(e) => setSafeguardingAck(e.target.checked)}
                className="h-3.5 w-3.5 accent-emerald-deep"
              />
              Minor safeguarding checklist completed
            </label>
          </fieldset>
        ) : null}
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
        {isMinor && approveBlockers.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-[11px] text-destructive">
            {approveBlockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        ) : null}
        <div className="flex gap-2">
          <button
            disabled={
              mutation.isPending ||
              !canDecide ||
              notes.trim().length < 5 ||
              approveBlockers.length > 0
            }
            onClick={() => mutation.mutate({ decision: "approved" })}
            title={
              notes.trim().length < 5
                ? "Add a reviewer note of at least 5 characters to approve"
                : (approveBlockers[0] ?? "")
            }
            className="inline-flex flex-1 items-center justify-center gap-1 rounded bg-emerald-deep px-3 py-2 text-xs font-bold uppercase tracking-widest text-cream hover:bg-emerald-mid disabled:opacity-50"
          >
            <Check className="h-3 w-3" /> Approve
          </button>

          <button
            disabled={
              mutation.isPending ||
              !canDecide ||
              notes.trim().length < 5 ||
              items.length === 0 ||
              rejectBlockers.length > 0
            }
            onClick={() => mutation.mutate({ decision: "rejected" })}
            title={
              notes.trim().length < 5
                ? "Add at least 5 characters to reject"
                : items.length === 0
                  ? "Select at least one item to revise"
                  : (rejectBlockers[0] ?? "")
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
      {dialog}
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

        {data.risk.flags.length > 0 ? (
          <div
            className={
              "rounded-lg border p-3 " +
              (data.risk.level === "high"
                ? "border-destructive/30 bg-destructive/5"
                : data.risk.level === "medium"
                  ? "border-gold/40 bg-gold/5"
                  : "border-emerald-deep/15 bg-emerald-deep/5")
            }
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:justify-between">
              <p className="min-w-0 truncate text-[11px] font-bold uppercase tracking-widest text-emerald-deep/70">
                Risk patterns · {RISK_SEVERITY_LABEL[data.risk.level as "low" | "medium" | "high"]} risk
              </p>
              <span
                className={
                  "shrink-0 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-widest " +
                  (data.flagged_at
                    ? "bg-destructive/10 text-destructive"
                    : "bg-emerald-deep/10 text-emerald-deep/60")
                }
              >
                {data.flagged_at
                  ? `Flagged for re-review ${new Date(data.flagged_at).toLocaleDateString()}`
                  : data.auto_flag.enabled
                    ? `Below threshold (${data.auto_flag.min_severity})`
                    : "Auto-flagging off"}
              </span>
            </div>
            <ul className="mt-2 space-y-1 text-xs text-emerald-deep/80">
              {data.risk.flags.map((f) => (
                <li key={f.code} className="flex gap-2">
                  <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-50" />
                  <span className="min-w-0">{f.message}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}


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


/**
 * Trigger-written history of automatic under-18 flag changes for this member.
 * Every entry shows the date of birth that produced the change and when it
 * happened, including changes made outside the app.
 */
function MinorHistoryCard({ memberId }: { memberId: string }) {
  const fetchChanges = useServerFn(listMinorStatusChanges);
  const { data, isLoading } = useQuery({
    queryKey: ["minor-status-changes", memberId],
    queryFn: () => fetchChanges({ data: { member_id: memberId, limit: 20 } }),
  });
  const changes = data?.changes ?? [];

  return (
    <SectionCard title="Under-18 status history">
      {isLoading ? (
        <div className="p-6"><Skeleton className="h-16 w-full" /></div>
      ) : changes.length === 0 ? (
        <div className="p-6 text-sm text-emerald-deep/60">
          No automatic under-18 status changes recorded for this member.
        </div>
      ) : (
        <ul className="divide-y divide-emerald-deep/5">
          {changes.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-6 py-3 text-sm">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-widest ${
                  c.is_minor
                    ? "bg-amber-500/15 text-amber-700"
                    : "bg-emerald-deep/10 text-emerald-deep/80"
                }`}
              >
                {c.was_minor === null
                  ? c.is_minor ? "Set to under 18" : "Set to adult"
                  : c.is_minor ? "Adult → under 18" : "Under 18 → adult"}
              </span>
              <span className="text-emerald-deep/70">
                Source date of birth: <strong>{c.source_date_of_birth ?? "not set"}</strong>
                {c.previous_date_of_birth && c.previous_date_of_birth !== c.source_date_of_birth
                  ? ` (was ${c.previous_date_of_birth})`
                  : ""}
              </span>
              <span className="ml-auto text-xs uppercase tracking-widest text-emerald-deep/50">
                {new Date(c.changed_at).toLocaleString()} · {c.change_kind}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
