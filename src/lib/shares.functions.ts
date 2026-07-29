import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ADMIN_ROLES, FINANCE_ROLES, hasAnyRole, loadRoleSet } from "@/lib/role-guards";

// ============================================================================
// Types
// ============================================================================

export type ShareProduct = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unit_price: number;
  currency: string;
  dividend_rate_annual: number;
  min_units: number;
  max_units_per_member: number | null;
  total_units_issued: number;
  is_active: boolean;
  created_at: string;
};

export type ShareHolding = {
  id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  unit_price: number;
  units: number;
  cost_basis: number;
  market_value: number;
  total_dividends: number;
  updated_at: string;
};

export type ShareTxn = {
  id: string;
  ref: string;
  kind: "purchase" | "sale" | "dividend";
  units: number;
  unit_price: number;
  amount: number;
  product_id: string;
  product_name: string;
  note: string | null;
  created_at: string;
};

export type DividendRun = {
  id: string;
  ref: string;
  product_id: string;
  product_name: string;
  period_start: string;
  period_end: string;
  per_unit_amount: number;
  units_paid: number;
  members_paid: number;
  total_paid: number;
  status: "draft" | "executed" | "cancelled";
  note: string | null;
  executed_at: string | null;
  created_at: string;
};

export type MemberInvestmentSummary = {
  holdings: ShareHolding[];
  recent: ShareTxn[];
  products: ShareProduct[];
  savings_accounts: Array<{ id: string; nickname: string | null; balance: number; plan_name: string }>;
  totals: { units: number; cost_basis: number; market_value: number; dividends: number };
};

// ============================================================================
// Member: overview
// ============================================================================

export const getMyInvestments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MemberInvestmentSummary> => {
    const { supabase, userId } = context;
    const [
      { data: holdings, error: hErr },
      { data: recent, error: rErr },
      { data: products, error: pErr },
      { data: accounts, error: aErr },
    ] = await Promise.all([
      supabase
        .from("share_holdings")
        .select(
          "id, product_id, units, cost_basis, total_dividends, updated_at, share_products(code, name, unit_price)",
        )
        .eq("user_id", userId)
        .order("updated_at", { ascending: false }),
      supabase
        .from("share_transactions")
        .select("id, ref, kind, units, unit_price, amount, product_id, note, created_at, share_products(name)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("share_products")
        .select(
          "id, code, name, description, unit_price, currency, dividend_rate_annual, min_units, max_units_per_member, total_units_issued, is_active, created_at",
        )
        .eq("is_active", true)
        .order("code", { ascending: true }),
      supabase
        .from("savings_accounts")
        .select("id, nickname, balance, status, savings_plans(name)")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("created_at", { ascending: true }),
    ]);
    if (hErr) throw new Error(hErr.message);
    if (rErr) throw new Error(rErr.message);
    if (pErr) throw new Error(pErr.message);
    if (aErr) throw new Error(aErr.message);

    const mappedHoldings: ShareHolding[] = (holdings ?? []).map((h: any) => {
      const unit_price = Number(h.share_products?.unit_price ?? 0);
      const units = Number(h.units ?? 0);
      return {
        id: h.id,
        product_id: h.product_id,
        product_code: h.share_products?.code ?? "",
        product_name: h.share_products?.name ?? "Share",
        unit_price,
        units,
        cost_basis: Number(h.cost_basis ?? 0),
        market_value: Number((unit_price * units).toFixed(2)),
        total_dividends: Number(h.total_dividends ?? 0),
        updated_at: h.updated_at,
      };
    });

    const totals = mappedHoldings.reduce(
      (acc, h) => ({
        units: acc.units + h.units,
        cost_basis: acc.cost_basis + h.cost_basis,
        market_value: acc.market_value + h.market_value,
        dividends: acc.dividends + h.total_dividends,
      }),
      { units: 0, cost_basis: 0, market_value: 0, dividends: 0 },
    );

    return {
      holdings: mappedHoldings,
      recent: (recent ?? []).map((t: any) => ({
        id: t.id,
        ref: t.ref,
        kind: t.kind,
        units: Number(t.units ?? 0),
        unit_price: Number(t.unit_price ?? 0),
        amount: Number(t.amount ?? 0),
        product_id: t.product_id,
        product_name: t.share_products?.name ?? "Share",
        note: t.note,
        created_at: t.created_at,
      })),
      products: (products ?? []).map((p: any) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        unit_price: Number(p.unit_price ?? 0),
        currency: p.currency,
        dividend_rate_annual: Number(p.dividend_rate_annual ?? 0),
        min_units: p.min_units,
        max_units_per_member: p.max_units_per_member,
        total_units_issued: p.total_units_issued,
        is_active: p.is_active,
        created_at: p.created_at,
      })),
      savings_accounts: (accounts ?? []).map((a: any) => ({
        id: a.id,
        nickname: a.nickname,
        balance: Number(a.balance ?? 0),
        plan_name: a.savings_plans?.name ?? "Savings",
      })),
      totals,
    };
  });

// ============================================================================
// Member: purchase / sell
// ============================================================================

const TradeSchema = z.object({
  product_id: z.string().uuid(),
  savings_account_id: z.string().uuid(),
  units: z.number().int().positive().max(1_000_000),
  note: z.string().trim().max(240).optional().nullable(),
});

export const purchaseShares = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => TradeSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ id: string; ref: string }> => {
    const { data: row, error } = await context.supabase.rpc("purchase_shares", {
      _product_id: data.product_id,
      _units: data.units,
      _savings_account_id: data.savings_account_id,
      _note: data.note ?? "",
      _actor_id: context.userId,
    });
    if (error) throw new Error(error.message);
    const r = Array.isArray(row) ? row[0] : row;
    return { id: r.id, ref: r.ref };
  });

export const sellShares = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => TradeSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ id: string; ref: string }> => {
    const { data: row, error } = await context.supabase.rpc("sell_shares", {
      _product_id: data.product_id,
      _units: data.units,
      _savings_account_id: data.savings_account_id,
      _note: data.note ?? "",
      _actor_id: context.userId,
    });
    if (error) throw new Error(error.message);
    const r = Array.isArray(row) ? row[0] : row;
    return { id: r.id, ref: r.ref };
  });

// ============================================================================
// Admin: products, holdings, dividend runs
// ============================================================================

async function assertStaff(supabase: any, userId: string) {
  const roles = await loadRoleSet(supabase, userId);
  if (!hasAnyRole(roles, ADMIN_ROLES)) throw new Error("forbidden");
  return roles;
}

async function assertFinanceStaff(supabase: any, userId: string) {
  const roles = await loadRoleSet(supabase, userId);
  if (!hasAnyRole(roles, FINANCE_ROLES)) throw new Error("forbidden");
  return roles;
}

export type AdminInvestmentsOverview = {
  products: ShareProduct[];
  runs: DividendRun[];
  totals: {
    total_units: number;
    total_cost_basis: number;
    total_market_value: number;
    dividends_paid_ytd: number;
    active_products: number;
    holders: number;
  };
  top_holders: Array<{
    user_id: string;
    full_name: string | null;
    member_no: string | null;
    units: number;
    cost_basis: number;
    market_value: number;
  }>;
};

export const getAdminInvestments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminInvestmentsOverview> => {
    await assertStaff(context.supabase, context.userId);
    const { supabase } = context;

    const [{ data: products, error: pErr }, { data: runs, error: rErr }, { data: holdings, error: hErr }] =
      await Promise.all([
        supabase
          .from("share_products")
          .select(
            "id, code, name, description, unit_price, currency, dividend_rate_annual, min_units, max_units_per_member, total_units_issued, is_active, created_at",
          )
          .order("code", { ascending: true }),
        supabase
          .from("dividend_runs")
          .select(
            "id, ref, product_id, period_start, period_end, per_unit_amount, units_paid, members_paid, total_paid, status, note, executed_at, created_at, share_products(name)",
          )
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("share_holdings")
          .select(
            "user_id, units, cost_basis, total_dividends, share_products(unit_price), profiles(full_name, member_no)",
          )
          .gt("units", 0),
      ]);
    if (pErr) throw new Error(pErr.message);
    if (rErr) throw new Error(rErr.message);
    if (hErr) throw new Error(hErr.message);

    const productList: ShareProduct[] = (products ?? []).map((p: any) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      unit_price: Number(p.unit_price ?? 0),
      currency: p.currency,
      dividend_rate_annual: Number(p.dividend_rate_annual ?? 0),
      min_units: p.min_units,
      max_units_per_member: p.max_units_per_member,
      total_units_issued: p.total_units_issued,
      is_active: p.is_active,
      created_at: p.created_at,
    }));

    const runList: DividendRun[] = (runs ?? []).map((r: any) => ({
      id: r.id,
      ref: r.ref,
      product_id: r.product_id,
      product_name: r.share_products?.name ?? "Share",
      period_start: r.period_start,
      period_end: r.period_end,
      per_unit_amount: Number(r.per_unit_amount ?? 0),
      units_paid: r.units_paid,
      members_paid: r.members_paid,
      total_paid: Number(r.total_paid ?? 0),
      status: r.status,
      note: r.note,
      executed_at: r.executed_at,
      created_at: r.created_at,
    }));

    const yearStart = new Date();
    yearStart.setUTCMonth(0, 1);
    yearStart.setUTCHours(0, 0, 0, 0);

    const holdersByUser = new Map<string, { units: number; cost: number; value: number; name: string | null; mno: string | null }>();
    let totalUnits = 0;
    let totalCost = 0;
    let totalValue = 0;
    let dividendsPaid = 0;
    for (const h of holdings ?? []) {
      const price = Number((h as any).share_products?.unit_price ?? 0);
      const units = Number((h as any).units ?? 0);
      const cost = Number((h as any).cost_basis ?? 0);
      const value = Number((price * units).toFixed(2));
      totalUnits += units;
      totalCost += cost;
      totalValue += value;
      dividendsPaid += Number((h as any).total_dividends ?? 0);
      const uid = (h as any).user_id as string;
      const prev = holdersByUser.get(uid) ?? {
        units: 0,
        cost: 0,
        value: 0,
        name: (h as any).profiles?.full_name ?? null,
        mno: (h as any).profiles?.member_no ?? null,
      };
      prev.units += units;
      prev.cost += cost;
      prev.value += value;
      holdersByUser.set(uid, prev);
    }

    const topHolders = [...holdersByUser.entries()]
      .map(([user_id, v]) => ({
        user_id,
        full_name: v.name,
        member_no: v.mno,
        units: v.units,
        cost_basis: v.cost,
        market_value: v.value,
      }))
      .sort((a, b) => b.market_value - a.market_value)
      .slice(0, 10);

    return {
      products: productList,
      runs: runList,
      top_holders: topHolders,
      totals: {
        total_units: totalUnits,
        total_cost_basis: totalCost,
        total_market_value: totalValue,
        dividends_paid_ytd: dividendsPaid,
        active_products: productList.filter((p) => p.is_active).length,
        holders: holdersByUser.size,
      },
    };
  });

const ProductUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  unit_price: z.number().positive().max(10_000_000),
  currency: z.string().trim().min(3).max(3).default("GHS"),
  dividend_rate_annual: z.number().min(0).max(1).default(0),
  min_units: z.number().int().min(1).max(1_000_000).default(1),
  max_units_per_member: z.number().int().min(1).max(10_000_000).optional().nullable(),
  is_active: z.boolean().default(true),
});

export const upsertShareProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ProductUpsertSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await assertFinanceStaff(context.supabase, context.userId);
    const payload = {
      code: data.code.toUpperCase(),
      name: data.name,
      description: data.description ?? null,
      unit_price: data.unit_price,
      currency: data.currency,
      dividend_rate_annual: data.dividend_rate_annual,
      min_units: data.min_units,
      max_units_per_member: data.max_units_per_member ?? null,
      is_active: data.is_active,
    };
    if (data.id) {
      const { error } = await context.supabase.from("share_products").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("share_products")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id as string };
  });

const CreateRunSchema = z.object({
  product_id: z.string().uuid(),
  period_start: z.string().min(10),
  period_end: z.string().min(10),
  per_unit_amount: z.number().positive().max(1_000_000),
  note: z.string().trim().max(500).optional().nullable(),
});

export const createDividendRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateRunSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ id: string; ref: string }> => {
    await assertFinanceStaff(context.supabase, context.userId);
    const ref = `DVR-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { data: row, error } = await context.supabase
      .from("dividend_runs")
      .insert({
        ref,
        product_id: data.product_id,
        period_start: data.period_start,
        period_end: data.period_end,
        per_unit_amount: data.per_unit_amount,
        note: data.note ?? null,
        created_by: context.userId,
        status: "draft",
      })
      .select("id, ref")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id as string, ref: row!.ref as string };
  });

export const executeDividendRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ run_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<DividendRun> => {
    await assertFinanceStaff(context.supabase, context.userId);
    const { data: row, error } = await context.supabase.rpc("execute_dividend_run", {
      _run_id: data.run_id,
      _actor_id: context.userId,
    });
    if (error) throw new Error(error.message);
    const r = Array.isArray(row) ? row[0] : row;
    return {
      id: r.id,
      ref: r.ref,
      product_id: r.product_id,
      product_name: "",
      period_start: r.period_start,
      period_end: r.period_end,
      per_unit_amount: Number(r.per_unit_amount ?? 0),
      units_paid: r.units_paid,
      members_paid: r.members_paid,
      total_paid: Number(r.total_paid ?? 0),
      status: r.status,
      note: r.note,
      executed_at: r.executed_at,
      created_at: r.created_at,
    };
  });

export const cancelDividendRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ run_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertFinanceStaff(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("dividend_runs")
      .update({ status: "cancelled" })
      .eq("id", data.run_id)
      .eq("status", "draft");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
