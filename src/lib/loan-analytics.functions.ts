import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ANALYTICS_ROLES = new Set([
  "super_admin",
  "admin",
  "manager",
  "finance_officer",
  "loan_officer",
  "auditor",
  "compliance_officer",
]);

async function assertAnalyticsRole(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => String(r.role));
  if (!roles.some((r: string) => ANALYTICS_ROLES.has(r))) {
    throw new Error("Forbidden: analytics access requires a staff role");
  }
  return roles;
}

export type CohortRow = {
  month: string;
  applications: number;
  approved: number;
  rejected: number;
  disbursed: number;
  applied_value: number;
  disbursed_value: number;
  approval_rate: number;
};

export type FunnelStage = { stage: string; count: number; value: number; conversion: number };

export type DelinquencyBucket = { bucket: string; loans: number; amount: number };

export type ProductPerformance = {
  product: string;
  loans: number;
  disbursed_value: number;
  due_to_date: number;
  collected: number;
  collection_rate: number;
  on_time_rate: number;
  arrears: number;
};

export type LoanAnalytics = {
  cohorts: CohortRow[];
  funnel: FunnelStage[];
  delinquency: {
    buckets: DelinquencyBucket[];
    portfolio_value: number;
    at_risk_value: number;
    delinquency_rate: number;
    loans_in_arrears: number;
    active_loans: number;
  };
  products: ProductPerformance[];
  generated_at: string;
};

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

export const getLoanAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ months: z.coerce.number().int().min(3).max(24).optional() })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<LoanAnalytics> => {
    await assertAnalyticsRole(context.supabase, context.userId);
    const months = data.months ?? 12;
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - (months - 1), 1);
    const sinceIso = since.toISOString().slice(0, 10);

    const [loanRes, schedRes] = await Promise.all([
      context.supabase
        .from("loans")
        .select(
          "id, product, amount, status, created_at, decided_at, disbursed_at, outstanding_principal",
        )
        .gte("created_at", sinceIso),
      context.supabase
        .from("loan_repayments")
        .select("loan_id, due_date, total_due, paid_amount, paid_at, status"),
    ]);
    if (loanRes.error) throw new Error(loanRes.error.message);
    if (schedRes.error) throw new Error(schedRes.error.message);

    const loans = (loanRes.data ?? []).map((l: any) => ({
      id: String(l.id),
      product: String(l.product ?? "Unclassified"),
      amount: Number(l.amount ?? 0),
      status: String(l.status),
      created_at: String(l.created_at),
      decided_at: l.decided_at ? String(l.decided_at) : null,
      disbursed_at: l.disbursed_at ? String(l.disbursed_at) : null,
      outstanding: Number(l.outstanding_principal ?? 0),
    }));
    const loanById = new Map(loans.map((l) => [l.id, l]));

    // ---- Cohort trends by application month
    const cohortMap = new Map<string, CohortRow>();
    for (let i = 0; i < months; i += 1) {
      const d = new Date(since);
      d.setUTCMonth(d.getUTCMonth() + i, 1);
      const key = d.toISOString().slice(0, 7);
      cohortMap.set(key, {
        month: key,
        applications: 0,
        approved: 0,
        rejected: 0,
        disbursed: 0,
        applied_value: 0,
        disbursed_value: 0,
        approval_rate: 0,
      });
    }
    for (const loan of loans) {
      const row = cohortMap.get(monthKey(loan.created_at));
      if (!row) continue;
      row.applications += 1;
      row.applied_value += loan.amount;
      if (loan.status === "rejected") row.rejected += 1;
      if (loan.status === "approved" || loan.status === "active" || loan.status === "closed") {
        row.approved += 1;
      }
      if (loan.disbursed_at) {
        row.disbursed += 1;
        row.disbursed_value += loan.amount;
      }
    }
    const cohorts = Array.from(cohortMap.values()).map((row) => ({
      ...row,
      approval_rate: row.approved + row.rejected > 0 ? row.approved / (row.approved + row.rejected) : 0,
    }));

    // ---- Approval funnel
    const applied = loans.length;
    const appliedValue = loans.reduce((s, l) => s + l.amount, 0);
    const decided = loans.filter((l) => l.status !== "pending");
    const approved = loans.filter((l) => l.status !== "pending" && l.status !== "rejected");
    const disbursed = loans.filter((l) => l.disbursed_at);
    const closed = loans.filter((l) => l.status === "closed");
    const stage = (name: string, rows: typeof loans, base: number): FunnelStage => ({
      stage: name,
      count: rows.length,
      value: rows.reduce((s, l) => s + l.amount, 0),
      conversion: base > 0 ? rows.length / base : 0,
    });
    const funnel: FunnelStage[] = [
      { stage: "Applications", count: applied, value: appliedValue, conversion: 1 },
      stage("Decisioned", decided, applied),
      stage("Approved", approved, applied),
      stage("Disbursed", disbursed, applied),
      stage("Fully repaid", closed, applied),
    ];

    // ---- Delinquency buckets from open installments
    const todayKey = new Date().toISOString().slice(0, 10);
    const arrearsByLoan = new Map<string, { amount: number; oldestDue: string }>();
    const productAgg = new Map<string, ProductPerformance>();

    let dueToDateTotal = 0;
    let onTime = 0;
    let matured = 0;

    for (const row of schedRes.data ?? []) {
      const loan = loanById.get(String((row as any).loan_id));
      if (!loan) continue;
      const total = Number((row as any).total_due ?? 0);
      const paid = Number((row as any).paid_amount ?? 0);
      const due = String((row as any).due_date);
      const remaining = Math.max(0, total - paid);

      const agg =
        productAgg.get(loan.product) ??
        ({
          product: loan.product,
          loans: 0,
          disbursed_value: 0,
          due_to_date: 0,
          collected: 0,
          collection_rate: 0,
          on_time_rate: 0,
          arrears: 0,
        } as ProductPerformance);
      productAgg.set(loan.product, agg);

      if (due <= todayKey) {
        agg.due_to_date += total;
        dueToDateTotal += total;
        matured += 1;
        const paidOnTime =
          (row as any).paid_at != null && String((row as any).paid_at).slice(0, 10) <= due;
        if (paidOnTime || remaining <= 0.005) onTime += 1;
        if (remaining > 0.005) {
          agg.arrears += remaining;
          const existing = arrearsByLoan.get(loan.id);
          arrearsByLoan.set(loan.id, {
            amount: (existing?.amount ?? 0) + remaining,
            oldestDue: existing && existing.oldestDue < due ? existing.oldestDue : due,
          });
        }
      }
      agg.collected += Math.min(paid, total);
    }

    for (const loan of loans) {
      const agg = productAgg.get(loan.product);
      if (!agg) continue;
      agg.loans += 1;
      if (loan.disbursed_at) agg.disbursed_value += loan.amount;
    }

    const products = Array.from(productAgg.values())
      .map((p) => ({
        ...p,
        collection_rate: p.due_to_date > 0 ? Math.min(1, p.collected / p.due_to_date) : 0,
        on_time_rate: dueToDateTotal > 0 && matured > 0 ? onTime / matured : 0,
      }))
      .sort((a, b) => b.disbursed_value - a.disbursed_value);

    const bucketDefs: [string, number, number][] = [
      ["1–30 days", 1, 30],
      ["31–60 days", 31, 60],
      ["61–90 days", 61, 90],
      ["90+ days", 91, Number.MAX_SAFE_INTEGER],
    ];
    const buckets: DelinquencyBucket[] = bucketDefs.map(([bucket]) => ({
      bucket,
      loans: 0,
      amount: 0,
    }));
    const today = new Date(todayKey);
    for (const [, entry] of arrearsByLoan) {
      const daysLate = Math.floor(
        (today.getTime() - new Date(entry.oldestDue).getTime()) / 86_400_000,
      );
      const idx = bucketDefs.findIndex(([, lo, hi]) => daysLate >= lo && daysLate <= hi);
      if (idx < 0) continue;
      buckets[idx]!.loans += 1;
      buckets[idx]!.amount += entry.amount;
    }

    const activeLoans = loans.filter((l) => l.status === "active");
    const portfolioValue = activeLoans.reduce((s, l) => s + l.outstanding, 0);
    const atRisk = Array.from(arrearsByLoan.values()).reduce((s, e) => s + e.amount, 0);

    return {
      cohorts,
      funnel,
      delinquency: {
        buckets,
        portfolio_value: portfolioValue,
        at_risk_value: atRisk,
        delinquency_rate: portfolioValue > 0 ? Math.min(1, atRisk / portfolioValue) : 0,
        loans_in_arrears: arrearsByLoan.size,
        active_loans: activeLoans.length,
      },
      products,
      generated_at: new Date().toISOString(),
    };
  });
