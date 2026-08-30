import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Clock, ShieldAlert, X } from "lucide-react";
import type { MyKycStatus } from "@/lib/member-kyc.functions";

/**
 * Dashboard banner that explains the member's latest KYC decision: the
 * reviewer's note plus the concrete next steps. Approval banners are
 * dismissible per decision (keyed by the review timestamp) so a fresh
 * decision always shows again.
 */
export function KycDecisionBanner({ status }: { status: MyKycStatus }) {
  const decision = status.latest_decision;
  const approved = status.review_state === "approved";
  const rejected = status.review_state === "rejected";
  const dismissKey = approved && decision ? `kyc-approved-seen:${decision.reviewed_at}` : null;
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!dismissKey) {
      setDismissed(false);
      return;
    }
    try {
      setDismissed(window.localStorage.getItem(dismissKey) === "1");
    } catch {
      setDismissed(false);
    }
  }, [dismissKey]);

  if (approved && (dismissed || !decision)) return null;

  const pendingItems = status.remediation.filter((r) => !r.resolved);
  const tone = approved
    ? "border-emerald-mid/40 bg-emerald-mid/10"
    : rejected
      ? "border-destructive/40 bg-destructive/10"
      : "border-gold/40 bg-gold/10";

  const title = approved
    ? "KYC verification approved"
    : rejected
      ? "KYC verification declined"
      : status.review_state === "in_review"
        ? "Verification under review"
        : "Verification required";

  const Icon = approved ? CheckCircle2 : rejected ? ShieldAlert : Clock;

  const steps: string[] = approved
    ? [
        "Your full member dashboard, savings and loan facilities are now unlocked.",
        "Keep your ID and contact details current so future reviews stay clear.",
      ]
    : rejected
      ? [
          pendingItems.length
            ? `Update the requested items: ${pendingItems.map((r) => r.label).join(", ")}.`
            : "Review the reviewer note and correct your details.",
          status.can_resubmit
            ? "Resubmit your verification from the verification status page."
            : status.resubmission.blocked_reason === "deadline"
              ? "Your resubmission window has closed — contact support to reopen it."
              : status.resubmission.blocked_reason === "attempts"
                ? "You have used all resubmission attempts — contact support for help."
                : `Resubmit once every item is fixed (${status.resubmission.attempts_left} attempt(s) left).`,
        ]
      : status.review_state === "in_review"
        ? [
            "A compliance officer is reviewing your submission. Full access unlocks once it is approved.",
          ]
        : [
            status.profile_missing_fields.length
              ? "Complete your personal details on the profile page."
              : "Confirm your personal details are up to date.",
            status.documents_missing_types.length
              ? "Upload the required Ghana Card (front and back) and a selfie."
              : "Submit your documents for review.",
          ];

  const cta = approved
    ? { to: "/app", label: "Go to dashboard" }
    : {
        to: status.next_action?.link ?? "/app/kyc",
        label: rejected ? "Fix and resubmit" : "Continue verification",
      };

  return (
    <div className={`relative mb-4 rounded-xl border p-4 ${tone}`}>
      {dismissKey ? (
        <button
          type="button"
          aria-label="Dismiss verification notice"
          onClick={() => {
            setDismissed(true);
            try {
              window.localStorage.setItem(dismissKey, "1");
            } catch {
              /* storage unavailable — banner simply returns next load */
            }
          }}
          className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : null}

      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>

          {decision ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Reviewed {new Date(decision.reviewed_at).toLocaleString()}
              {decision.reviewer_name ? ` by ${decision.reviewer_name}` : ""}.
            </p>
          ) : null}

          {decision?.notes ? (
            <p className="mt-2 rounded-md border border-border/60 bg-background/60 p-2 text-xs text-foreground">
              <span className="font-semibold">Reviewer note: </span>
              {decision.notes}
            </p>
          ) : null}

          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to={cta.to}
              className="inline-block rounded-md bg-emerald-deep px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-cream hover:bg-emerald-mid"
            >
              {cta.label}
            </Link>
            <Link
              to="/app/inbox"
              className="inline-block rounded-md border border-border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-foreground hover:bg-foreground/5"
            >
              View notifications
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
