// Server-only helpers for the AI Business Intelligence dashboard.
// Aggregation runs with the caller's RLS-scoped client, so the calling server
// function MUST verify the caller holds a system-admin / operations role first.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type Client = SupabaseClient<Database>;

/** Roles allowed to see institution-wide AI intelligence. */
export const BI_ROLES = ["super_admin", "admin", "manager"] as const;
export type BiRole = (typeof BI_ROLES)[number];

export type BiSeriesPoint = { bucket: string; inflow: number; outflow: number; volume: number };
export type BiBar = { label: string; value: number };

export type BiSnapshot = {
  generatedAt: string;
  windowDays: number;
  kpis: {
    members: number;
    activeMembers: number;
    totalSavings: number;
    outstandingPrincipal: number;
    arrearsAmount: number;
    parRatio: number; // portfolio at risk, 0..1
    netFlow: number;
    onTimeRepaymentRate: number; // 0..1
  };
  queues: {
    pendingLoans: number;
    pendingWithdrawals: number;
    pendingKyc: number;
    openTickets: number;
    failedPayments: number;
  };
  flowSeries: BiSeriesPoint[];
  arrearsBuckets: BiBar[];
  kycMix: BiBar[];
  channelMix: BiBar[];
};

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

function weekKey(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  const day = (d.getUTCDay() + 6) % 7; // Monday-based
  const monday = new Date(d.getTime() - day * 86_400_000);
  return monday.toISOString().slice(0, 10);
}

const INFLOW_KINDS = new Set(["deposit", "contribution", "repayment", "interest", "credit"]);

/** Aggregate an institution-wide snapshot for the BI dashboard. */
export async function buildBiSnapshot(supabase: Client, windowDays = 90): Promise<BiSnapshot> {
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();

  const [profiles, savings, loans, txns, repayments, withdrawals, tickets, intents] =
    await Promise.all([
      supabase.from("profiles").select("kyc, status"),
      supabase.from("savings_accounts").select("balance, status"),
      supabase
        .from("loans")
        .select("amount, status, outstanding_principal, arrears_amount, arrears_bucket"),
      supabase
        .from("transactions")
        .select("amount, kind, status, channel, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(5000),
      supabase.from("loan_repayments").select("status, total_due, paid_amount").limit(5000),
      supabase.from("savings_withdrawal_requests").select("status, amount"),
      supabase.from("support_tickets").select("status"),
      supabase.from("payment_intents").select("status").gte("created_at", since),
    ]);

  const profileRows = profiles.data ?? [];
  const savingsRows = savings.data ?? [];
  const loanRows = loans.data ?? [];
  const txnRows = txns.data ?? [];
  const repayRows = repayments.data ?? [];
  const withdrawalRows = withdrawals.data ?? [];

  const totalSavings = savingsRows.reduce((s, r) => s + num(r.balance), 0);
  const outstandingPrincipal = loanRows.reduce((s, r) => s + num(r.outstanding_principal), 0);
  const arrearsAmount = loanRows.reduce((s, r) => s + num(r.arrears_amount), 0);

  // Flow series bucketed by ISO week.
  const byWeek = new Map<string, BiSeriesPoint>();
  const byChannel = new Map<string, number>();
  let inflowTotal = 0;
  let outflowTotal = 0;
  for (const t of txnRows) {
    if (t.status && t.status !== "completed" && t.status !== "posted" && t.status !== "success") {
      continue;
    }
    const key = weekKey(String(t.created_at));
    const point = byWeek.get(key) ?? { bucket: key, inflow: 0, outflow: 0, volume: 0 };
    const amount = Math.abs(num(t.amount));
    const isIn = INFLOW_KINDS.has(String(t.kind ?? "").toLowerCase()) || num(t.amount) > 0;
    if (isIn) {
      point.inflow += amount;
      inflowTotal += amount;
    } else {
      point.outflow += amount;
      outflowTotal += amount;
    }
    point.volume += 1;
    byWeek.set(key, point);
    const ch = String(t.channel ?? "unspecified");
    byChannel.set(ch, (byChannel.get(ch) ?? 0) + 1);
  }

  const paidOnTime = repayRows.filter((r) => r.status === "paid").length;
  const settled = repayRows.filter((r) => r.status === "paid" || r.status === "overdue").length;

  const countBy = <T extends { status?: string | null }>(rows: T[], status: string) =>
    rows.filter((r) => r.status === status).length;

  const arrearsMap = new Map<string, number>();
  for (const l of loanRows) {
    const bucket = String(l.arrears_bucket ?? "current");
    arrearsMap.set(bucket, (arrearsMap.get(bucket) ?? 0) + num(l.arrears_amount || 0));
  }

  const kycMap = new Map<string, number>();
  for (const p of profileRows) {
    const k = String(p.kyc ?? "unknown");
    kycMap.set(k, (kycMap.get(k) ?? 0) + 1);
  }

  const sortDesc = (m: Map<string, number>): BiBar[] =>
    [...m.entries()]
      .map(([label, value]) => ({ label: label.replace(/_/g, " "), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    kpis: {
      members: profileRows.length,
      activeMembers: savingsRows.filter((s) => s.status === "active").length,
      totalSavings: Math.round(totalSavings),
      outstandingPrincipal: Math.round(outstandingPrincipal),
      arrearsAmount: Math.round(arrearsAmount),
      parRatio: outstandingPrincipal > 0 ? arrearsAmount / outstandingPrincipal : 0,
      netFlow: Math.round(inflowTotal - outflowTotal),
      onTimeRepaymentRate: settled > 0 ? paidOnTime / settled : 0,
    },
    queues: {
      pendingLoans: countBy(loanRows, "pending"),
      pendingWithdrawals: countBy(withdrawalRows, "pending"),
      pendingKyc: profileRows.filter((p) => p.kyc === "pending" || p.kyc === "submitted").length,
      openTickets: (tickets.data ?? []).filter(
        (t) => t.status !== "closed" && t.status !== "resolved",
      ).length,
      failedPayments: (intents.data ?? []).filter((p) => p.status === "failed").length,
    },
    flowSeries: [...byWeek.values()].sort((a, b) => a.bucket.localeCompare(b.bucket)),
    arrearsBuckets: sortDesc(arrearsMap),
    kycMix: sortDesc(kycMap),
    channelMix: sortDesc(byChannel),
  };
}

export type BiBriefing = {
  headline: string;
  summary: string;
  risks: { title: string; detail: string; severity: "low" | "medium" | "high" };
  items: {
    risks: { title: string; detail: string; severity: "low" | "medium" | "high" }[];
    opportunities: { title: string; detail: string }[];
    actions: { title: string; detail: string; priority: "now" | "this week" | "this month" }[];
  };
  confidence: "low" | "medium" | "high";
  generatedAt: string;
  model: string;
};

export function briefingPrompt(snapshot: BiSnapshot, currency: string) {
  return `You are the chief analytics officer of a Ghanaian savings & loans cooperative.
Currency: ${currency}. Reporting window: last ${snapshot.windowDays} days.

LIVE METRICS (JSON):
${JSON.stringify(
  {
    kpis: snapshot.kpis,
    operationalQueues: snapshot.queues,
    weeklyFlows: snapshot.flowSeries.slice(-12),
    arrearsBuckets: snapshot.arrearsBuckets,
    kycMix: snapshot.kycMix,
    channelMix: snapshot.channelMix,
  },
  null,
  2,
)}

Return STRICT JSON only (no markdown, no prose) with this exact shape:
{
  "headline": "<=70 chars executive headline",
  "summary": "2-3 sentences on portfolio health, liquidity and operations",
  "risks": [{"title":"<=48 chars","detail":"one sentence","severity":"low|medium|high"}],
  "opportunities": [{"title":"<=48 chars","detail":"one sentence"}],
  "actions": [{"title":"<=48 chars","detail":"one sentence","priority":"now|this week|this month"}],
  "confidence": "low|medium|high"
}
Give 2-4 risks, 2-3 opportunities and 3-5 actions. Quote real numbers from the metrics.
Say plainly when data volume is too thin to conclude, and set confidence accordingly.`;
}

type RawBriefing = {
  headline?: unknown;
  summary?: unknown;
  risks?: unknown;
  opportunities?: unknown;
  actions?: unknown;
  confidence?: unknown;
};

const str = (v: unknown, max = 240) => String(v ?? "").trim().slice(0, max);

/** Parse and normalise the model output; throws when the shape is unusable. */
export function parseBriefing(text: string, model: string): BiBriefing {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const raw = JSON.parse(cleaned) as RawBriefing;
  const sev = (v: unknown): "low" | "medium" | "high" =>
    v === "high" || v === "medium" ? v : "low";
  const pri = (v: unknown): "now" | "this week" | "this month" =>
    v === "now" || v === "this month" ? v : "this week";
  const list = (v: unknown) => (Array.isArray(v) ? v : []);

  const risks = list(raw.risks)
    .slice(0, 4)
    .map((r) => {
      const o = r as Record<string, unknown>;
      return { title: str(o.title, 80), detail: str(o.detail), severity: sev(o.severity) };
    })
    .filter((r) => r.title);
  const opportunities = list(raw.opportunities)
    .slice(0, 3)
    .map((r) => {
      const o = r as Record<string, unknown>;
      return { title: str(o.title, 80), detail: str(o.detail) };
    })
    .filter((r) => r.title);
  const actions = list(raw.actions)
    .slice(0, 5)
    .map((r) => {
      const o = r as Record<string, unknown>;
      return { title: str(o.title, 80), detail: str(o.detail), priority: pri(o.priority) };
    })
    .filter((r) => r.title);

  const headline = str(raw.headline, 90);
  if (!headline || !actions.length) throw new Error("AI returned an unusable briefing shape");

  return {
    headline,
    summary: str(raw.summary, 600),
    risks: risks[0] ?? { title: "No material risk detected", detail: "", severity: "low" },
    items: { risks, opportunities, actions },
    confidence:
      raw.confidence === "high" || raw.confidence === "medium"
        ? (raw.confidence as "high" | "medium")
        : "low",
    generatedAt: new Date().toISOString(),
    model,
  };
}
