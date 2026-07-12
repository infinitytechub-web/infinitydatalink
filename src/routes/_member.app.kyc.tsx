import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Clock, ShieldCheck, ShieldAlert, Mail, Smartphone } from "lucide-react";
import { PageHeader, SectionCard, StatusPill } from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { getMyKycStatus, type MyKycStatus, type KycStepState } from "@/lib/member-kyc.functions";

const statusQuery = queryOptions({
  queryKey: ["member", "kyc", "status"],
  queryFn: () => getMyKycStatus(),
  staleTime: 15_000,
});

export const Route = createFileRoute("/_member/app/kyc")({
  head: () => ({ meta: [{ title: "KYC verification — Infinity Wealth" }, { name: "robots", content: "noindex" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(statusQuery),
  component: KycStatusPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Verification status failed to load: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm text-emerald-deep/70">Not found.</div>,
});

function KycStatusPage() {
  return (
    <>
      <PageHeader
        eyebrow="Member"
        title="KYC verification"
        description="Track your identity verification progress and see what's needed next."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Body />
      </Suspense>
    </>
  );
}

function Body() {
  const { data } = useSuspenseQuery(statusQuery);
  return (
    <div className="space-y-6">
      <StatusBanner data={data} />
      <div className="grid gap-6 md:grid-cols-3">
        <SectionCard title="Verification progress" className="md:col-span-2">
          <div className="divide-y divide-emerald-deep/5">
            <Step
              index={1}
              label="Complete your personal details"
              hint={
                data.profile_missing_fields.length > 0
                  ? `Still missing: ${data.profile_missing_fields.join(", ")}`
                  : "All required fields are filled."
              }
              state={data.steps.profile}
            />
            <Step
              index={2}
              label="Upload required documents"
              hint={
                data.documents_missing_types.length > 0
                  ? `Still needed: ${data.documents_missing_types.join(", ")}`
                  : "All required documents uploaded."
              }
              state={data.steps.documents}
            />
            <Step
              index={3}
              label="Compliance review"
              hint={
                data.review_state === "approved"
                  ? "Your identity has been verified."
                  : data.review_state === "rejected"
                    ? "Your submission needs updates — see the reviewer note below."
                    : data.review_state === "in_review"
                      ? "Awaiting a compliance officer decision."
                      : "Will start automatically once documents are uploaded."
              }
              state={data.steps.review}
            />
          </div>
        </SectionCard>
        <SectionCard title="Next action">
          {data.next_action ? (
            <div className="space-y-3 p-6">
              <p className="text-sm text-emerald-deep/80">{data.next_action.label}</p>
              <Link
                to={data.next_action.link}
                className="inline-flex items-center rounded bg-emerald-deep px-4 py-2 text-xs font-semibold uppercase tracking-widest text-cream hover:bg-emerald-mid"
              >
                Go now
              </Link>
            </div>
          ) : (
            <div className="p-6 text-sm text-emerald-deep/70">
              You're all set — no action needed from you right now.
            </div>
          )}
        </SectionCard>
      </div>

      {data.latest_decision ? (
        <SectionCard
          title={data.latest_decision.decision === "approved" ? "Latest decision" : "Reviewer feedback"}
        >
          <div className="space-y-3 p-6 text-sm text-emerald-deep/80">
            <div className="flex items-center gap-2">
              {data.latest_decision.decision === "approved" ? (
                <ShieldCheck className="h-4 w-4 text-success" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-destructive" />
              )}

              <span className="font-semibold uppercase tracking-widest text-[11px]">
                {data.latest_decision.decision === "approved" ? "Approved" : "Rejected"}
              </span>
              <span className="text-[11px] text-emerald-deep/50">
                {new Date(data.latest_decision.reviewed_at).toLocaleString()}
              </span>
            </div>
            {data.latest_decision.reviewer_name && data.latest_decision.decision === "approved" ? (
              <div className="text-[11px] text-emerald-deep/50">
                Verified by {data.latest_decision.reviewer_name}
              </div>
            ) : null}
            {data.latest_decision.notes ? (
              <div className="rounded border border-emerald-deep/10 bg-cream/40 px-3 py-2 text-sm">
                {data.latest_decision.notes}
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Notifications">
        {data.notifications.length === 0 ? (
          <div className="p-6 text-sm text-emerald-deep/60">
            No notifications yet. We'll email you when there's an update.
          </div>
        ) : (
          <ul className="divide-y divide-emerald-deep/5">
            {data.notifications.map((n) => (
              <li key={n.id} className="flex items-center gap-3 px-6 py-3 text-sm">
                {n.channel === "email" ? (
                  <Mail className="h-4 w-4 text-emerald-deep/60" />
                ) : (
                  <Smartphone className="h-4 w-4 text-emerald-deep/60" />
                )}
                <div className="flex-1">
                  <div className="font-semibold capitalize">
                    {n.channel} · {n.decision}
                  </div>
                  <div className="text-[11px] text-emerald-deep/50">
                    {n.sent_at
                      ? `Sent ${new Date(n.sent_at).toLocaleString()}`
                      : `Queued ${new Date(n.created_at).toLocaleString()}`}
                  </div>
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                    n.status === "sent"
                      ? "bg-emerald-mid/15 text-emerald-mid"
                      : n.status === "failed"
                        ? "bg-red-100 text-red-700"
                        : "bg-gold/10 text-gold"
                  }`}
                >
                  {n.status}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-emerald-deep/5 px-6 py-3 text-[11px] text-emerald-deep/50">
          SMS notifications coming soon.
        </div>
      </SectionCard>
    </div>
  );
}

function StatusBanner({ data }: { data: MyKycStatus }) {
  const map: Record<string, { title: string; body: string; tone: "pending" | "active" | "rejected" }> = {
    approved: {
      title: "You're verified",
      body: "All member features are unlocked.",
      tone: "active",
    },
    rejected: {
      title: "Action required",
      body: "Your last submission was rejected. Update your details and resubmit.",
      tone: "rejected",
    },
    in_review: {
      title: "Under review",
      body: "A compliance officer is reviewing your submission — we'll email you as soon as there's a decision.",
      tone: "pending",
    },
    not_started: {
      title: "Verification not started",
      body: "Complete your profile and upload your KYC documents to get verified.",
      tone: "pending",
    },
  };
  const info = map[data.review_state];
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-emerald-deep/10 bg-card p-5 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <StatusPill status={data.kyc as any} />
          <h2 className="text-lg font-semibold text-emerald-deep">{info.title}</h2>
        </div>
        <p className="mt-1 text-sm text-emerald-deep/70">{info.body}</p>
      </div>
    </div>
  );
}

function Step({
  index,
  label,
  hint,
  state,
}: {
  index: number;
  label: string;
  hint: string;
  state: KycStepState;
}) {
  const Icon = state === "done" ? CheckCircle2 : state === "in_progress" ? Clock : Circle;
  const color =
    state === "done" ? "text-emerald-mid" : state === "in_progress" ? "text-gold" : "text-emerald-deep/40";
  return (
    <div className="flex items-start gap-4 px-6 py-4">
      <div className={`mt-0.5 ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-deep">
          <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-deep/40">
            Step {index}
          </span>
          {label}
        </div>
        <p className="mt-1 text-[12px] text-emerald-deep/60">{hint}</p>
      </div>
    </div>
  );
}
