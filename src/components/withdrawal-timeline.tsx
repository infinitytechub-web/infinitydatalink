import { Ban, Banknote, CheckCircle2, Clock, FileText, XCircle } from "lucide-react";
import type { WithdrawalRequest } from "@/lib/withdrawals.functions";

type StepState = "done" | "current" | "rejected" | "cancelled" | "pending";

type Step = {
  key: string;
  label: string;
  state: StepState;
  at: string | null;
  message: string;
  icon: typeof Clock;
};

function fmt(ts: string | null) {
  if (!ts) return null;
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function buildWithdrawalTimeline(r: WithdrawalRequest): Step[] {
  const steps: Step[] = [];

  steps.push({
    key: "submitted",
    label: "Submitted",
    state: "done",
    at: r.created_at,
    message: `Request ${r.ref} submitted for ${r.channel.replace(/_/g, " ")} payout from ${r.account_label}.`,
    icon: FileText,
  });

  if (r.status === "cancelled") {
    steps.push({
      key: "cancelled",
      label: "Cancelled",
      state: "cancelled",
      at: r.cancelled_at ?? null,
      message: "You cancelled this request. The hold on your balance was released.",
      icon: Ban,
    });
    return steps;
  }

  if (r.status === "rejected") {
    steps.push({
      key: "rejected",
      label: "Rejected",
      state: "rejected",
      at: r.rejected_at,
      message:
        r.rejection_reason?.trim()
          ? `A finance officer declined this request: ${r.rejection_reason}`
          : "A finance officer declined this request. Contact support if you need more detail.",
      icon: XCircle,
    });
    return steps;
  }

  const approved = r.status === "approved" || r.status === "paid";
  steps.push({
    key: "approved",
    label: "Approved",
    state: approved ? "done" : "current",
    at: r.approved_at,
    message: approved
      ? r.approval_note?.trim()
        ? `Approved by a finance officer. Note: ${r.approval_note}`
        : "Approved by a finance officer and queued for payout."
      : "Waiting for a finance officer to review. Your balance is on hold until a decision is made.",
    icon: CheckCircle2,
  });

  const paid = r.status === "paid";
  steps.push({
    key: "paid",
    label: "Paid",
    state: paid ? "done" : approved ? "current" : "pending",
    at: r.paid_at,
    message: paid
      ? "Payout released and posted to your ledger."
      : approved
        ? "Approved — funds are scheduled for release on the next payout run."
        : "Payout happens once the request is approved.",
    icon: Banknote,
  });

  return steps;
}

const TONE: Record<StepState, { dot: string; text: string }> = {
  done: { dot: "bg-emerald-mid text-white border-emerald-mid", text: "text-foreground" },
  current: { dot: "bg-amber-500 text-white border-amber-500", text: "text-foreground" },
  rejected: { dot: "bg-destructive text-white border-destructive", text: "text-destructive" },
  cancelled: { dot: "bg-muted text-muted-foreground border-border", text: "text-muted-foreground" },
  pending: { dot: "bg-background text-muted-foreground border-border", text: "text-muted-foreground" },
};

export function WithdrawalTimeline({ request }: { request: WithdrawalRequest }) {
  const steps = buildWithdrawalTimeline(request);
  return (
    <ol className="space-y-0" aria-label={`Status timeline for withdrawal ${request.ref}`}>
      {steps.map((s, i) => {
        const tone = TONE[s.state];
        const Icon = s.icon;
        const last = i === steps.length - 1;
        return (
          <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
            {!last ? (
              <span
                aria-hidden="true"
                className="absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px bg-border"
              />
            ) : null}
            <span
              aria-hidden="true"
              className={`z-10 flex size-7 shrink-0 items-center justify-center rounded-full border ${tone.dot}`}
            >
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2">
                <span className={`text-sm font-semibold ${tone.text}`}>{s.label}</span>
                {s.state === "current" ? (
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-600">
                    In progress
                  </span>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {fmt(s.at) ?? (s.state === "pending" || s.state === "current" ? "Pending" : "—")}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.message}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default WithdrawalTimeline;
