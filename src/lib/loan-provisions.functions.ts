// Loan loss provisioning (expected credit loss) reporting.
// Read-only: classifies the active portfolio into aging buckets and applies
// configurable provision rates to derive provisions, net exposure and coverage.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole, loadRoleSet, type Role } from "@/lib/role-guards";
import { ARREARS_BUCKETS, type ArrearsBucket } from "@/lib/loan-arrears.functions";

const PROVISION_READ_ROLES: readonly Role[] = [
  "super_admin",
  "finance_officer",
  "loan_officer",
  "auditor",
  "compliance_officer",
];

/** Prudential default provision rates (%) per aging bucket. */
export const DEFAULT_PROVISION_RATES: Record<ArrearsBucket, number> = {
  current: 1,
  "1-30": 5,
  "31-60": 25,
  "61-90": 50,
  "90+": 100,
};

export type ProvisionBucketRow = {
  bucket: ArrearsBucket;
  loans: number;
  outstanding: number;
  arrears: number;
  rate_pct: number;
  provision: number;
  net_exposure: number;
  share_pct: number;
};

export type ProvisionProductRow = {
  product: string;
  loans: number;
  outstanding: number;
  provision: number;
  coverage_pct: number;
};

export type ProvisionExposureRow = {
  id: string;
  ref: string;
  product: string;
  member_name: string | null;
  member_no: string | null;
  outstanding: number;
  arrears: number;
  days_past_due: number;
  bucket: string;
  rate_pct: number;
  provision: number;
};

export type ProvisionReport = {
  as_of: string;
  rates: Record<ArrearsBucket, number>;
  buckets: ProvisionBucketRow[];
  products: ProvisionProductRow[];
  exposures: ProvisionExposureRow[];
  totals: {
    loans: number;
    outstanding: number;
    arrears: number;
    provision: number;
    net_exposure: number;
    coverage_pct: number;
    par_pct: number;
    written_off: number;
  };
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const RateSchema = z
  .object({
    current: z.number().min(0).max(100).optional(),
    "1-30": z.number().min(0).max(100).optional(),
    "31-60": z.number().min(0).max(100).optional(),
    "61-90": z.number().min(0).max(100).optional(),
    "90+": z.number().min(0).max(100).optional(),
  })
  .optional();

function normalizeBucket(value: unknown): ArrearsBucket {
  const b = String(value ?? "current");
  return (ARREARS_BUCKETS as readonly string[]).includes(b) ? (b as ArrearsBucket) : "current";
}

export const getProvisionReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        rates: RateSchema,
        top: z.number().int().min(5).max(200).optional().default(25),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<ProvisionReport> => {
    assertAnyRole(
      await loadRoleSet(context.supabase, context.userId),
      PROVISION_READ_ROLES,
      "finance, loan or audit",
    );

    const rates = { ...DEFAULT_PROVISION_RATES, ...(data.rates ?? {}) } as Record<
      ArrearsBucket,
      number
    >;

    const { data: loans, error } = await context.supabase
      .from("loans")
      .select(
        "id, ref, product, user_id, outstanding_principal, arrears_amount, days_past_due, arrears_bucket, penalty_accrued, penalty_paid, written_off_amount, status",
      )
      .in("status", ["active", "closed"]);
    if (error) throw new Error(error.message);

    const rows = (loans ?? []) as any[];
    const active = rows.filter((l) => String(l.status) === "active");

    const bucketAgg = new Map<
      ArrearsBucket,
      { loans: number; outstanding: number; arrears: number }
    >();
    for (const b of ARREARS_BUCKETS) bucketAgg.set(b, { loans: 0, outstanding: 0, arrears: 0 });
    const productAgg = new Map<string, { loans: number; outstanding: number; provision: number }>();

    let totalOutstanding = 0;
    let totalArrears = 0;
    let totalProvision = 0;
    let parOutstanding = 0;

    const exposures: ProvisionExposureRow[] = [];

    for (const l of active) {
      const bucket = normalizeBucket(l.arrears_bucket);
      const outstanding = Number(l.outstanding_principal ?? 0);
      const arrears = Number(l.arrears_amount ?? 0);
      const rate = Number(rates[bucket] ?? 0);
      const provision = (outstanding * rate) / 100;

      const bAgg = bucketAgg.get(bucket)!;
      bAgg.loans += 1;
      bAgg.outstanding += outstanding;
      bAgg.arrears += arrears;

      const key = String(l.product ?? "—");
      const pAgg = productAgg.get(key) ?? { loans: 0, outstanding: 0, provision: 0 };
      pAgg.loans += 1;
      pAgg.outstanding += outstanding;
      pAgg.provision += provision;
      productAgg.set(key, pAgg);

      totalOutstanding += outstanding;
      totalArrears += arrears;
      totalProvision += provision;
      if (bucket !== "current") parOutstanding += outstanding;

      exposures.push({
        id: String(l.id),
        ref: String(l.ref),
        product: key,
        member_name: null,
        member_no: null,
        outstanding: round2(outstanding),
        arrears: round2(arrears),
        days_past_due: Number(l.days_past_due ?? 0),
        bucket,
        rate_pct: rate,
        provision: round2(provision),
      });
    }

    exposures.sort((a, b) => b.provision - a.provision || b.outstanding - a.outstanding);
    const top = exposures.slice(0, data.top);

    const memberIds = Array.from(
      new Set(top.map((e) => active.find((l) => l.id === e.id)?.user_id).filter(Boolean)),
    );
    if (memberIds.length) {
      const { data: profiles } = await context.supabase
        .from("profiles")
        .select("id, full_name, member_no")
        .in("id", memberIds as string[]);
      const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      for (const e of top) {
        const userId = active.find((l) => l.id === e.id)?.user_id;
        const p = userId ? map.get(userId) : null;
        e.member_name = p?.full_name ?? null;
        e.member_no = p?.member_no ?? null;
      }
    }

    const writtenOff = rows.reduce((sum, l) => sum + Number(l.written_off_amount ?? 0), 0);

    return {
      as_of: new Date().toISOString(),
      rates,
      buckets: ARREARS_BUCKETS.map((b) => {
        const agg = bucketAgg.get(b)!;
        const rate = Number(rates[b] ?? 0);
        const provision = (agg.outstanding * rate) / 100;
        return {
          bucket: b,
          loans: agg.loans,
          outstanding: round2(agg.outstanding),
          arrears: round2(agg.arrears),
          rate_pct: rate,
          provision: round2(provision),
          net_exposure: round2(agg.outstanding - provision),
          share_pct: totalOutstanding > 0 ? round2((agg.outstanding / totalOutstanding) * 100) : 0,
        };
      }),
      products: Array.from(productAgg.entries())
        .map(([product, agg]) => ({
          product,
          loans: agg.loans,
          outstanding: round2(agg.outstanding),
          provision: round2(agg.provision),
          coverage_pct: agg.outstanding > 0 ? round2((agg.provision / agg.outstanding) * 100) : 0,
        }))
        .sort((a, b) => b.outstanding - a.outstanding),
      exposures: top,
      totals: {
        loans: active.length,
        outstanding: round2(totalOutstanding),
        arrears: round2(totalArrears),
        provision: round2(totalProvision),
        net_exposure: round2(totalOutstanding - totalProvision),
        coverage_pct: totalOutstanding > 0 ? round2((totalProvision / totalOutstanding) * 100) : 0,
        par_pct: totalOutstanding > 0 ? round2((parOutstanding / totalOutstanding) * 100) : 0,
        written_off: round2(writtenOff),
      },
    };
  });
