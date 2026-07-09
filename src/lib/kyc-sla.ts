// Shared SLA helpers for the KYC review workflow (client-safe).

export type AgingBucket = "fresh" | "due_soon" | "overdue" | "critical";

export const AGING_ORDER: AgingBucket[] = ["fresh", "due_soon", "overdue", "critical"];

// Thresholds in hours.
export const AGING_THRESHOLDS = {
  due_soon: 24,   // 1 day
  overdue: 48,    // 2 days
  critical: 120,  // 5 days
} as const;

// SLA target: decisions expected within 72 hours of submission.
export const SLA_TARGET_HOURS = 72;

export function hoursSince(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, (now - t) / 3_600_000);
}

export function bucketFor(hours: number | null): AgingBucket | null {
  if (hours == null) return null;
  if (hours >= AGING_THRESHOLDS.critical) return "critical";
  if (hours >= AGING_THRESHOLDS.overdue) return "overdue";
  if (hours >= AGING_THRESHOLDS.due_soon) return "due_soon";
  return "fresh";
}

export const BUCKET_META: Record<AgingBucket, { label: string; short: string; tone: string; dot: string }> = {
  fresh:    { label: "Fresh (<24h)",       short: "<24h",   tone: "text-emerald-deep bg-emerald-mid/10", dot: "bg-emerald-mid" },
  due_soon: { label: "Due soon (1–2d)",    short: "1–2d",   tone: "text-emerald-deep bg-gold/15",        dot: "bg-gold" },
  overdue:  { label: "Overdue (2–5d)",     short: "2–5d",   tone: "text-red-700 bg-red-500/10",          dot: "bg-red-500" },
  critical: { label: "Critical (>5d)",     short: ">5d",    tone: "text-cream bg-red-700",               dot: "bg-red-900" },
};

// SLA countdown: hours remaining vs SLA_TARGET_HOURS. Negative = breached.
export function slaRemainingHours(pendingSinceIso: string | null | undefined, now: number = Date.now()): number | null {
  const h = hoursSince(pendingSinceIso, now);
  if (h == null) return null;
  return SLA_TARGET_HOURS - h;
}

export function formatCountdown(remainingHours: number | null): { text: string; breached: boolean } {
  if (remainingHours == null) return { text: "—", breached: false };
  const breached = remainingHours < 0;
  const abs = Math.abs(remainingHours);
  const days = Math.floor(abs / 24);
  const hrs = Math.floor(abs % 24);
  const text = days > 0 ? `${days}d ${hrs}h` : `${hrs}h`;
  return { text: breached ? `${text} over` : `${text} left`, breached };
}
