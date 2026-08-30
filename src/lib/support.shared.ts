/** Shared support-centre vocabulary used by both portals. */
export const SUPPORT_CATEGORIES = [
  "savings",
  "loans",
  "payments",
  "kyc",
  "account",
  "other",
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export const SUPPORT_STATUSES = [
  "open",
  "in_progress",
  "awaiting_member",
  "resolved",
  "closed",
] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const CATEGORY_LABELS: Record<SupportCategory, string> = {
  savings: "Savings",
  loans: "Loans",
  payments: "Payments",
  kyc: "KYC & verification",
  account: "Account access",
  other: "Something else",
};

export const STATUS_LABELS: Record<SupportStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  awaiting_member: "Awaiting member",
  resolved: "Resolved",
  closed: "Closed",
};

export const PRIORITY_LABELS: Record<SupportPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

/** First-response and resolution SLA targets, in hours, by priority. */
export const SLA_TARGETS: Record<SupportPriority, { first_response_h: number; resolve_h: number }> = {
  urgent: { first_response_h: 2, resolve_h: 8 },
  high: { first_response_h: 4, resolve_h: 24 },
  normal: { first_response_h: 12, resolve_h: 72 },
  low: { first_response_h: 24, resolve_h: 120 },
};

export const REOPEN_WINDOW_DAYS = 7;

export function hoursSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

export type SlaState = "ok" | "warning" | "breached" | "met";

/** Colour signal for the queue: are we still inside the SLA window? */
export function slaState(ticket: {
  priority: SupportPriority;
  status: SupportStatus;
  created_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
}): SlaState {
  const target = SLA_TARGETS[ticket.priority];
  if (ticket.status === "resolved" || ticket.status === "closed") {
    if (!ticket.resolved_at) return "met";
    return hoursSince(ticket.created_at) - hoursSince(ticket.resolved_at) <= target.resolve_h
      ? "met"
      : "breached";
  }
  const age = hoursSince(ticket.created_at);
  const limit = ticket.first_response_at ? target.resolve_h : target.first_response_h;
  if (age > limit) return "breached";
  if (age > limit * 0.75) return "warning";
  return "ok";
}
