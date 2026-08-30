// Arrears / delinquency tracking and automated late-fee (penalty) handling.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const READ_ROLES = new Set(["super_admin", "loan_officer", "finance_officer", "auditor"]);
const WRITE_ROLES = new Set(["super_admin", "finance_officer"]);

async function roleSet(supabase: any, userId: string): Promise<Set<string>> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return new Set((data ?? []).map((r: any) => String(r.role)));
}

async function assertArrearsRead(supabase: any, userId: string) {
  const roles = await roleSet(supabase, userId);
  if (!Array.from(roles).some((r) => READ_ROLES.has(r))) {
    throw new Error("Forbidden: loan, finance or audit role required");
  }
  return roles;
}

async function assertArrearsWrite(supabase: any, userId: string) {
  const roles = await roleSet(supabase, userId);
  if (!Array.from(roles).some((r) => WRITE_ROLES.has(r))) {
    throw new Error("Forbidden: finance role required");
  }
  return roles.has("super_admin") ? "super_admin" : "finance_officer";
}

export const ARREARS_BUCKETS = ["current", "1-30", "31-60", "61-90", "90+"] as const;
export type ArrearsBucket = (typeof ARREARS_BUCKETS)[number];

export type ArrearsRow = {
  id: string;
  ref: string;
  product: string;
  amount: number;
  outstanding_principal: number;
  arrears_amount: number;
  days_past_due: number;
  arrears_bucket: string;
  penalty_accrued: number;
  monthly_payment: number | null;
  maturity_at: string | null;
  user_id: string;
  member_name: string | null;
  member_no: string | null;
  member_phone: string | null;
};

export type ArrearsSummary = {
  buckets: { bucket: string; loans: number; arrears: number; outstanding: number }[];
  total_arrears: number;
  total_outstanding: number;
  loans_in_arrears: number;
  portfolio_at_risk_pct: number;
  penalties_outstanding: number;
  as_of: string;
};

export const getArrearsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ArrearsSummary> => {
    await assertArrearsRead(context.supabase, context.userId);
    const { data: loans, error } = await context.supabase
      .from("loans")
      .select("id, arrears_bucket, arrears_amount, outstanding_principal, penalty_accrued")
      .eq("status", "active");
    if (error) throw new Error(error.message);

    const rows = (loans ?? []) as any[];
    const map = new Map<string, { loans: number; arrears: number; outstanding: number }>();
    for (const b of ARREARS_BUCKETS) map.set(b, { loans: 0, arrears: 0, outstanding: 0 });

    let totalArrears = 0;
    let totalOutstanding = 0;
    let inArrears = 0;
    let penalties = 0;

    for (const l of rows) {
      const bucket = String(l.arrears_bucket ?? "current");
      const entry = map.get(bucket) ?? { loans: 0, arrears: 0, outstanding: 0 };
      const arrears = Number(l.arrears_amount ?? 0);
      const outstanding = Number(l.outstanding_principal ?? 0);
      entry.loans += 1;
      entry.arrears += arrears;
      entry.outstanding += outstanding;
      map.set(bucket, entry);
      totalArrears += arrears;
      totalOutstanding += outstanding;
      penalties += Number(l.penalty_accrued ?? 0);
      if (bucket !== "current") inArrears += 1;
    }

    const atRisk = ARREARS_BUCKETS.filter((b) => b !== "current").reduce(
      (sum, b) => sum + (map.get(b)?.outstanding ?? 0),
      0,
    );

    return {
      buckets: ARREARS_BUCKETS.map((b) => ({
        bucket: b,
        ...(map.get(b) ?? { loans: 0, arrears: 0, outstanding: 0 }),
      })),
      total_arrears: Math.round(totalArrears * 100) / 100,
      total_outstanding: Math.round(totalOutstanding * 100) / 100,
      loans_in_arrears: inArrears,
      portfolio_at_risk_pct:
        totalOutstanding > 0 ? Math.round((atRisk / totalOutstanding) * 10000) / 100 : 0,
      penalties_outstanding: Math.round(penalties * 100) / 100,
      as_of: new Date().toISOString(),
    };
  });

export const listLoanArrears = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        bucket: z
          .enum(["all", ...ARREARS_BUCKETS])
          .optional()
          .default("all"),
        sort: z
          .enum(["days_past_due", "arrears_amount", "outstanding_principal"])
          .optional()
          .default("days_past_due"),
        dir: z.enum(["asc", "desc"]).optional().default("desc"),
        page: z.number().int().min(1).max(500).optional().default(1),
        page_size: z.number().int().min(5).max(200).optional().default(25),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ rows: ArrearsRow[]; total: number }> => {
    await assertArrearsRead(context.supabase, context.userId);
    const from = (data.page - 1) * data.page_size;
    const to = from + data.page_size - 1;

    let q = context.supabase
      .from("loans")
      .select(
        "id, ref, product, amount, outstanding_principal, arrears_amount, days_past_due, arrears_bucket, penalty_accrued, monthly_payment, maturity_at, user_id",
        { count: "exact" },
      )
      .eq("status", "active")
      .order(data.sort, { ascending: data.dir === "asc" })
      .range(from, to);

    if (data.bucket === "all") q = q.gt("days_past_due", 0);
    else q = q.eq("arrears_bucket", data.bucket);

    const { data: loans, count, error } = await q;
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((loans ?? []).map((l: any) => l.user_id)));
    let profiles = new Map<string, any>();
    if (ids.length) {
      const { data: p } = await context.supabase
        .from("profiles")
        .select("id, full_name, member_no, phone")
        .in("id", ids);
      profiles = new Map((p ?? []).map((row: any) => [row.id, row]));
    }

    return {
      total: count ?? 0,
      rows: (loans ?? []).map((l: any) => ({
        ...l,
        amount: Number(l.amount),
        outstanding_principal: Number(l.outstanding_principal ?? 0),
        arrears_amount: Number(l.arrears_amount ?? 0),
        penalty_accrued: Number(l.penalty_accrued ?? 0),
        monthly_payment: l.monthly_payment == null ? null : Number(l.monthly_payment),
        member_name: profiles.get(l.user_id)?.full_name ?? null,
        member_no: profiles.get(l.user_id)?.member_no ?? null,
        member_phone: profiles.get(l.user_id)?.phone ?? null,
      })),
    };
  });

export type PenaltyRow = {
  id: string;
  loan_id: string;
  loan_ref: string | null;
  repayment_id: string | null;
  period_month: string;
  amount: number;
  days_late: number;
  reason: string;
  waived_at: string | null;
  waive_note: string | null;
  created_at: string;
  member_name: string | null;
};

export const listLoanPenalties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        loan_id: z.string().uuid().optional(),
        state: z.enum(["all", "outstanding", "waived"]).optional().default("outstanding"),
        limit: z.number().int().min(1).max(200).optional().default(50),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<PenaltyRow[]> => {
    await assertArrearsRead(context.supabase, context.userId);
    let q = context.supabase
      .from("loan_penalties")
      .select(
        "id, loan_id, repayment_id, period_month, amount, days_late, reason, waived_at, waive_note, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.loan_id) q = q.eq("loan_id", data.loan_id);
    if (data.state === "outstanding") q = q.is("waived_at", null);
    if (data.state === "waived") q = q.not("waived_at", "is", null);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const loanIds = Array.from(new Set((rows ?? []).map((r: any) => r.loan_id)));
    let loans = new Map<string, any>();
    let profiles = new Map<string, any>();
    if (loanIds.length) {
      const { data: l } = await context.supabase
        .from("loans")
        .select("id, ref, user_id")
        .in("id", loanIds);
      loans = new Map((l ?? []).map((row: any) => [row.id, row]));
      const userIds = Array.from(new Set((l ?? []).map((row: any) => row.user_id)));
      if (userIds.length) {
        const { data: p } = await context.supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        profiles = new Map((p ?? []).map((row: any) => [row.id, row]));
      }
    }

    return (rows ?? []).map((r: any) => {
      const loan = loans.get(r.loan_id);
      return {
        ...r,
        amount: Number(r.amount),
        loan_ref: loan?.ref ?? null,
        member_name: loan ? (profiles.get(loan.user_id)?.full_name ?? null) : null,
      };
    });
  });

export const waiveLoanPenalty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        penalty_id: z.string().uuid(),
        note: z
          .string()
          .trim()
          .min(5, "A waiver reason of at least 5 characters is required")
          .max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertArrearsWrite(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any).rpc("waive_loan_penalty", {
      _penalty_id: data.penalty_id,
      _note: data.note,
      _actor_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return row;
  });

/** Manual run of the nightly routine: re-age arrears then accrue late fees. */
export const runArrearsRefresh = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertArrearsWrite(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: arrears, error: aErr } = await (supabaseAdmin as any).rpc("refresh_loan_arrears");
    if (aErr) throw new Error(aErr.message);
    const { data: penalties, error: pErr } = await (supabaseAdmin as any).rpc(
      "assess_loan_penalties",
    );
    if (pErr) throw new Error(pErr.message);
    return { arrears, penalties };
  });
