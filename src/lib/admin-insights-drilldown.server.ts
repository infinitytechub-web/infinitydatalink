/**
 * Server-only helpers for analytics drill-downs. Kept out of the
 * `*.functions.ts` module so the server-fn splitter only sees declarations.
 */
import { num, NO_MATCH_UUID } from "@/lib/admin-insights.server";

export const DRILLDOWN_METRICS = [
  "savings_deposits",
  "savings_withdrawals",
  "withdrawal_requests",
  "withdrawals_paid",
  "loans",
  "loan_disbursements",
  "loan_repayments",
  "loan_arrears",
  "cancellations",
] as const;

export type DrilldownMetric = (typeof DRILLDOWN_METRICS)[number];

export type DrilldownRow = {
  id: string;
  occurred_at: string;
  member_name: string;
  member_no: string;
  category: string;
  status: string;
  amount: number;
  detail: string;
};

export type DrilldownResult = {
  metric: DrilldownMetric;
  title: string;
  rows: DrilldownRow[];
  total_rows: number;
  total_amount: number;
  breakdown: { label: string; value: number }[];
  truncated: boolean;
};

export const DRILLDOWN_TITLES: Record<DrilldownMetric, string> = {
  savings_deposits: "Savings deposits & interest",
  savings_withdrawals: "Savings withdrawal postings",
  withdrawal_requests: "Withdrawal requests",
  withdrawals_paid: "Withdrawals paid out",
  loans: "Loan applications",
  loan_disbursements: "Loan disbursements",
  loan_repayments: "Loan repayments received",
  loan_arrears: "Overdue instalments",
  cancellations: "Cancelled withdrawal requests",
};

const MAX_ROWS = 500;

/** Resolves member display names for a set of user ids. */
async function nameMap(supabase: any, ids: string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const out = new Map<string, { name: string; no: string }>();
  if (unique.length === 0) return out;
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, member_no")
    .in("id", unique.slice(0, 1000));
  for (const p of data ?? []) {
    out.set(String((p as any).id), {
      name: String((p as any).full_name ?? "—"),
      no: String((p as any).member_no ?? "—"),
    });
  }
  return out;
}

function tally(rows: DrilldownRow[], key: (r: DrilldownRow) => string, byAmount: boolean) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + (byAmount ? r.amount : 1));
  return Array.from(m.entries())
    .map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

/**
 * Fetches the underlying records behind an analytics KPI or chart bucket.
 * Reads use the caller's RLS-scoped client; the caller has already been
 * checked for an admin role.
 */
export async function fetchDrilldown(
  supabase: any,
  args: {
    metric: DrilldownMetric;
    fromISO: string;
    toISO: string;
    fromDate: string;
    toDate: string;
    scopeIds: string[] | null;
  },
): Promise<DrilldownResult> {
  const { metric, fromISO, toISO, fromDate, toDate, scopeIds } = args;
  const inScope = <T,>(q: T): T =>
    scopeIds ? ((q as any).in("user_id", scopeIds.length ? scopeIds : [NO_MATCH_UUID]) as T) : q;

  let rows: DrilldownRow[] = [];
  let byAmount = true;

  if (metric === "savings_deposits" || metric === "savings_withdrawals") {
    const kinds =
      metric === "savings_deposits" ? ["deposit", "interest"] : ["withdrawal", "transfer_out"];
    const { data, error } = await inScope(
      supabase
        .from("transactions")
        .select("id, user_id, amount, kind, status, reference, created_at")
        .eq("status", "cleared")
        .in("kind", kinds)
        .gte("created_at", fromISO)
        .lte("created_at", toISO)
        .order("created_at", { ascending: false })
        .limit(MAX_ROWS + 1),
    );
    if (error) throw new Error(error.message);
    const names = await nameMap(supabase, (data ?? []).map((r: any) => r.user_id));
    rows = (data ?? []).map((r: any) => ({
      id: String(r.id),
      occurred_at: String(r.created_at),
      member_name: names.get(String(r.user_id))?.name ?? "—",
      member_no: names.get(String(r.user_id))?.no ?? "—",
      category: String(r.kind),
      status: String(r.status),
      amount: num(r.amount),
      detail: String(r.reference ?? "—"),
    }));
  } else if (
    metric === "withdrawal_requests" ||
    metric === "withdrawals_paid" ||
    metric === "cancellations"
  ) {
    let q: any = supabase
      .from("savings_withdrawal_requests")
      .select(
        "id, user_id, amount, channel, status, reason, cancellation_reason, cancelled_by_role, created_at, paid_at, cancelled_at",
      )
      .gte("created_at", fromISO)
      .lte("created_at", toISO)
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS + 1);
    if (metric === "withdrawals_paid") q = q.not("paid_at", "is", null);
    if (metric === "cancellations") q = q.not("cancelled_at", "is", null);
    const { data, error } = await inScope(q);
    if (error) throw new Error(error.message);
    const names = await nameMap(supabase, (data ?? []).map((r: any) => r.user_id));
    rows = (data ?? []).map((r: any) => ({
      id: String(r.id),
      occurred_at: String(r.paid_at ?? r.cancelled_at ?? r.created_at),
      member_name: names.get(String(r.user_id))?.name ?? "—",
      member_no: names.get(String(r.user_id))?.no ?? "—",
      category: String(r.channel ?? "unknown"),
      status: String(r.status),
      amount: num(r.amount),
      detail:
        metric === "cancellations"
          ? `${String(r.cancellation_reason ?? "Unspecified")} (${String(r.cancelled_by_role ?? "member")})`
          : String(r.reason ?? "—"),
    }));
  } else if (metric === "loans" || metric === "loan_disbursements") {
    let q: any = supabase
      .from("loans")
      .select(
        "id, user_id, amount, product, status, purpose, outstanding_principal, created_at, disbursed_at",
      )
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS + 1);
    if (metric === "loan_disbursements") {
      q = q.not("disbursed_at", "is", null).gte("disbursed_at", fromISO).lte("disbursed_at", toISO);
    } else {
      q = q.gte("created_at", fromISO).lte("created_at", toISO);
    }
    const { data, error } = await inScope(q);
    if (error) throw new Error(error.message);
    const names = await nameMap(supabase, (data ?? []).map((r: any) => r.user_id));
    rows = (data ?? []).map((r: any) => ({
      id: String(r.id),
      occurred_at: String(r.disbursed_at ?? r.created_at),
      member_name: names.get(String(r.user_id))?.name ?? "—",
      member_no: names.get(String(r.user_id))?.no ?? "—",
      category: String(r.product ?? "Unknown"),
      status: String(r.status),
      amount: num(r.amount),
      detail: `Outstanding ${num(r.outstanding_principal).toFixed(2)}`,
    }));
  } else {
    // Repayment-derived metrics: instalments joined back to their loan owner.
    let loanIds: string[] | null = null;
    if (scopeIds) {
      const { data: ls } = await supabase
        .from("loans")
        .select("id")
        .in("user_id", scopeIds.length ? scopeIds : [NO_MATCH_UUID]);
      loanIds = (ls ?? []).map((r: any) => String(r.id));
    }
    let q: any = supabase
      .from("loan_repayments")
      .select("id, loan_id, installment_no, total_due, paid_amount, due_date, paid_at, status")
      .gte("due_date", fromDate)
      .lte("due_date", toDate)
      .order("due_date", { ascending: false })
      .limit(MAX_ROWS + 1);
    if (loanIds) q = q.in("loan_id", loanIds.length ? loanIds : [NO_MATCH_UUID]);
    if (metric === "loan_repayments") q = q.not("paid_at", "is", null);
    const { data, error } = await q;
    if (error) throw new Error(error.message);

    let list = (data ?? []) as any[];
    const today = new Date().toISOString().slice(0, 10);
    if (metric === "loan_arrears") {
      list = list.filter(
        (r) => !r.paid_at && String(r.due_date) < today && num(r.paid_amount) < num(r.total_due),
      );
    }
    const ids = Array.from(new Set(list.map((r) => String(r.loan_id))));
    const owner = new Map<string, string>();
    if (ids.length) {
      const { data: ls } = await supabase.from("loans").select("id, user_id").in("id", ids);
      for (const l of ls ?? []) owner.set(String((l as any).id), String((l as any).user_id));
    }
    const names = await nameMap(supabase, Array.from(owner.values()));
    rows = list.map((r) => {
      const uid = owner.get(String(r.loan_id)) ?? "";
      return {
        id: String(r.id),
        occurred_at: String(r.paid_at ?? `${r.due_date}T00:00:00Z`),
        member_name: names.get(uid)?.name ?? "—",
        member_no: names.get(uid)?.no ?? "—",
        category: `Instalment ${r.installment_no}`,
        status: String(r.status),
        amount: metric === "loan_repayments" ? num(r.paid_amount) : num(r.total_due) - num(r.paid_amount),
        detail: `Due ${r.due_date}`,
      };
    });
  }

  const truncated = rows.length > MAX_ROWS;
  if (truncated) rows = rows.slice(0, MAX_ROWS);
  if (metric === "loan_arrears") byAmount = true;

  return {
    metric,
    title: DRILLDOWN_TITLES[metric],
    rows,
    total_rows: rows.length,
    total_amount: Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100,
    breakdown: tally(rows, (r) => r.category || "—", byAmount),
    truncated,
  };
}
