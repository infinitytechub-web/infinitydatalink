// Loan product catalogue + eligibility.
//
// Products define the lending rules (limits, rate, fees, late-fee policy,
// guarantor/collateral requirements). Eligibility is evaluated in the database
// by `check_loan_eligibility`, which is service-role only — the server function
// below resolves the caller first so a member can never probe someone else.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LoanProduct = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  min_amount: number;
  max_amount: number;
  min_term_months: number;
  max_term_months: number;
  interest_rate: number;
  processing_fee_pct: number;
  late_fee_pct: number;
  late_fee_grace_days: number;
  max_multiple_of_savings: number;
  min_savings_balance: number;
  max_open_loans: number;
  requires_guarantor: boolean;
  min_guarantors: number;
  requires_collateral: boolean;
  requires_verified_kyc: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type EligibilityResult = {
  eligible: boolean;
  reasons: string[];
  savings_balance: number;
  max_eligible_amount: number;
  requires_guarantor: boolean;
  min_guarantors: number;
  requires_collateral: boolean;
  interest_rate: number;
  processing_fee: number;
};

const PRODUCT_ADMIN_ROLES = new Set(["super_admin", "loan_officer"]);

async function roleSet(supabase: any, userId: string): Promise<Set<string>> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return new Set((data ?? []).map((r: any) => String(r.role)));
}

async function assertProductAdmin(supabase: any, userId: string) {
  const roles = await roleSet(supabase, userId);
  const ok = Array.from(roles).some((r) => PRODUCT_ADMIN_ROLES.has(r));
  if (!ok) throw new Error("Forbidden: super admin or loan officer role required");
  return roles.has("super_admin") ? "super_admin" : "loan_officer";
}

function numeric(row: any): LoanProduct {
  return {
    ...row,
    min_amount: Number(row.min_amount),
    max_amount: Number(row.max_amount),
    interest_rate: Number(row.interest_rate),
    processing_fee_pct: Number(row.processing_fee_pct),
    late_fee_pct: Number(row.late_fee_pct),
    max_multiple_of_savings: Number(row.max_multiple_of_savings),
    min_savings_balance: Number(row.min_savings_balance),
  } as LoanProduct;
}

export const listLoanProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ include_inactive: z.boolean().optional().default(false) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<LoanProduct[]> => {
    let q = context.supabase.from("loan_products").select("*").order("name", { ascending: true });
    if (!data.include_inactive) q = q.eq("active", true);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map(numeric);
  });

const productInput = z.object({
  id: z.string().uuid().optional(),
  code: z
    .string()
    .trim()
    .min(2)
    .max(24)
    .regex(/^[A-Z0-9_-]+$/, "Use upper-case letters, digits, - or _"),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  min_amount: z.number().positive().max(100_000_000),
  max_amount: z.number().positive().max(100_000_000),
  min_term_months: z.number().int().min(1).max(360),
  max_term_months: z.number().int().min(1).max(360),
  interest_rate: z.number().min(0).max(200),
  processing_fee_pct: z.number().min(0).max(100),
  late_fee_pct: z.number().min(0).max(100),
  late_fee_grace_days: z.number().int().min(0).max(90),
  max_multiple_of_savings: z.number().min(0).max(50),
  min_savings_balance: z.number().min(0).max(100_000_000),
  max_open_loans: z.number().int().min(0).max(20),
  requires_guarantor: z.boolean(),
  min_guarantors: z.number().int().min(0).max(10),
  requires_collateral: z.boolean(),
  requires_verified_kyc: z.boolean(),
  active: z.boolean(),
});

export const upsertLoanProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const parsed = productInput.parse(d);
    if (parsed.max_amount < parsed.min_amount)
      throw new Error("Max amount must be at least the min amount");
    if (parsed.max_term_months < parsed.min_term_months)
      throw new Error("Max term must be at least the min term");
    if (parsed.requires_guarantor && parsed.min_guarantors < 1) {
      throw new Error("Set at least one required guarantor");
    }
    return parsed;
  })
  .handler(async ({ data, context }): Promise<LoanProduct> => {
    const role = await assertProductAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...fields } = data;

    const payload = { ...fields, description: fields.description ?? null };
    const query = id
      ? (supabaseAdmin as any)
          .from("loan_products")
          .update(payload)
          .eq("id", id)
          .select("*")
          .single()
      : (supabaseAdmin as any)
          .from("loan_products")
          .insert({ ...payload, created_by: context.userId })
          .select("*")
          .single();

    const { data: row, error } = await query;
    if (error) throw new Error(error.message);

    const { writeAudit } = await import("@/lib/audit-log");
    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: role,
      action: id ? "loan_product.updated" : "loan_product.created",
      target: row.id,
      meta: { code: row.code, name: row.name, active: row.active },
    });

    return numeric(row);
  });

export const setLoanProductActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }): Promise<LoanProduct> => {
    const role = await assertProductAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any)
      .from("loan_products")
      .update({ active: data.active })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const { writeAudit } = await import("@/lib/audit-log");
    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: role,
      action: data.active ? "loan_product.activated" : "loan_product.retired",
      target: row.id,
      meta: { code: row.code },
    });
    return numeric(row);
  });

/** Eligibility for the signed-in member against a product. */
export const checkMyLoanEligibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        product_id: z.string().uuid(),
        amount: z.number().positive().max(100_000_000),
        term_months: z.number().int().min(1).max(360),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<EligibilityResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await (supabaseAdmin as any).rpc("check_loan_eligibility", {
      _user_id: context.userId,
      _product_id: data.product_id,
      _amount: data.amount,
      _term_months: data.term_months,
    });
    if (error) throw new Error(error.message);
    const r = (result ?? {}) as any;
    return {
      eligible: Boolean(r.eligible),
      reasons: (r.reasons ?? []) as string[],
      savings_balance: Number(r.savings_balance ?? 0),
      max_eligible_amount: Number(r.max_eligible_amount ?? 0),
      requires_guarantor: Boolean(r.requires_guarantor),
      min_guarantors: Number(r.min_guarantors ?? 0),
      requires_collateral: Boolean(r.requires_collateral),
      interest_rate: Number(r.interest_rate ?? 0),
      processing_fee: Number(r.processing_fee ?? 0),
    };
  });
