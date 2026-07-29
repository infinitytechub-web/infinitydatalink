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

export type DividendRunStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "cancelled"
  | "executed";

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
  status: DividendRunStatus;
  note: string | null;
  executed_at: string | null;
  created_at: string;
  created_by: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  approval_note: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
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
// Member: cost-basis breakdown for a single holding
// ============================================================================

export type HoldingLot = {
  id: string;
  ref: string;
  kind: "purchase" | "sale" | "dividend";
  is_transfer: boolean;
  direction: "in" | "out" | "dividend";
  units: number;
  unit_price: number;
  amount: number;
  running_units: number;
  running_cost_basis: number;
  running_avg_cost: number;
  realized_gain: number | null;
  note: string | null;
  created_at: string;
};

export type HoldingBreakdown = {
  product: ShareProduct;
  units: number;
  cost_basis: number;
  average_cost: number;
  market_value: number;
  unrealized_gain: number;
  unrealized_gain_pct: number;
  realized_gain: number;
  total_dividends: number;
  total_units_purchased: number;
  total_units_sold: number;
  lots: HoldingLot[];
};

const BreakdownSchema = z.object({ product_id: z.string().uuid() });

export const getMyHoldingBreakdown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => BreakdownSchema.parse(data))
  .handler(async ({ data, context }): Promise<HoldingBreakdown> => {
    const { supabase, userId } = context;
    const [{ data: product, error: pErr }, { data: txns, error: tErr }] = await Promise.all([
      supabase
        .from("share_products")
        .select(
          "id, code, name, description, unit_price, currency, dividend_rate_annual, min_units, max_units_per_member, total_units_issued, is_active, created_at",
        )
        .eq("id", data.product_id)
        .single(),
      supabase
        .from("share_transactions")
        .select("id, ref, kind, units, unit_price, amount, note, created_at")
        .eq("user_id", userId)
        .eq("product_id", data.product_id)
        .order("created_at", { ascending: true }),
    ]);
    if (pErr) throw new Error(pErr.message);
    if (tErr) throw new Error(tErr.message);

    const prod: ShareProduct = {
      id: (product as any).id,
      code: (product as any).code,
      name: (product as any).name,
      description: (product as any).description,
      unit_price: Number((product as any).unit_price ?? 0),
      currency: (product as any).currency,
      dividend_rate_annual: Number((product as any).dividend_rate_annual ?? 0),
      min_units: (product as any).min_units,
      max_units_per_member: (product as any).max_units_per_member,
      total_units_issued: (product as any).total_units_issued,
      is_active: (product as any).is_active,
      created_at: (product as any).created_at,
    };

    let units = 0;
    let basis = 0;
    let realized = 0;
    let dividends = 0;
    let unitsBought = 0;
    let unitsSold = 0;
    const lots: HoldingLot[] = [];

    for (const t of txns ?? []) {
      const row = t as any;
      const u = Number(row.units ?? 0);
      const amt = Number(row.amount ?? 0);
      const price = Number(row.unit_price ?? 0);
      const note = (row.note ?? null) as string | null;
      const isTransfer = !!note && /^Transfer (out|in)/i.test(note);
      let realizedForLot: number | null = null;
      let direction: HoldingLot["direction"] = "in";

      if (row.kind === "purchase") {
        // buy or transfer-in — increases basis by amount (proxy: unit_price * units)
        units += u;
        basis += amt;
        unitsBought += u;
        direction = "in";
      } else if (row.kind === "sale") {
        // sell or transfer-out — removes basis proportional to average cost
        const avg = units > 0 ? basis / units : 0;
        const costOut = Number((avg * u).toFixed(2));
        // For real sales, realized = proceeds - cost removed. Transfers have no real proceeds.
        if (!isTransfer) {
          realizedForLot = Number((amt - costOut).toFixed(2));
          realized += realizedForLot;
        }
        units = Math.max(0, units - u);
        basis = Math.max(0, Number((basis - costOut).toFixed(2)));
        unitsSold += u;
        direction = "out";
      } else if (row.kind === "dividend") {
        dividends += amt;
        direction = "dividend";
      }

      const avgAfter = units > 0 ? Number((basis / units).toFixed(4)) : 0;
      lots.push({
        id: row.id,
        ref: row.ref,
        kind: row.kind,
        is_transfer: isTransfer,
        direction,
        units: u,
        unit_price: price,
        amount: amt,
        running_units: units,
        running_cost_basis: Number(basis.toFixed(2)),
        running_avg_cost: avgAfter,
        realized_gain: realizedForLot,
        note,
        created_at: row.created_at,
      });
    }

    const marketValue = Number((prod.unit_price * units).toFixed(2));
    const unrealized = Number((marketValue - basis).toFixed(2));
    const unrealizedPct = basis > 0 ? Number(((unrealized / basis) * 100).toFixed(2)) : 0;

    // Show lots newest first for the UI.
    lots.reverse();

    return {
      product: prod,
      units,
      cost_basis: Number(basis.toFixed(2)),
      average_cost: units > 0 ? Number((basis / units).toFixed(4)) : 0,
      market_value: marketValue,
      unrealized_gain: unrealized,
      unrealized_gain_pct: unrealizedPct,
      realized_gain: Number(realized.toFixed(2)),
      total_dividends: Number(dividends.toFixed(2)),
      total_units_purchased: unitsBought,
      total_units_sold: unitsSold,
      lots,
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

// ---------- Member-to-member transfer ----------

const TransferSchema = z.object({
  product_id: z.string().uuid(),
  to_member_no: z.string().trim().min(1).max(40),
  units: z.number().int().positive().max(1_000_000),
  note: z.string().trim().max(240).optional().nullable(),
});

export type ShareTransferResult = {
  out_txn_id: string;
  in_txn_id: string;
  to_user_id: string;
  to_full_name: string | null;
};

export const transferShares = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => TransferSchema.parse(data))
  .handler(async ({ data, context }): Promise<ShareTransferResult> => {
    const { data: row, error } = await (context.supabase as any).rpc("transfer_shares", {
      _product_id: data.product_id,
      _to_member_no: data.to_member_no,
      _units: data.units,
      _note: data.note ?? "",
      _actor_id: context.userId,
    });
    if (error) {
      const map: Record<string, string> = {
        recipient_not_found: "No member found with that member number.",
        recipient_required: "Recipient member number is required.",
        cannot_transfer_to_self: "You cannot transfer shares to yourself.",
        insufficient_units: "You don't hold enough units to transfer.",
        recipient_exceeds_max: "The recipient would exceed the maximum units allowed per member.",
        invalid_units: "Units must be a positive whole number.",
        product_not_available: "This share product is unavailable.",
        not_authorized: "Not authorized.",
      };
      throw new Error(map[error.message] ?? error.message);
    }
    const r = Array.isArray(row) ? row[0] : row;
    return {
      out_txn_id: r.out_txn_id,
      in_txn_id: r.in_txn_id,
      to_user_id: r.to_user_id,
      to_full_name: r.to_full_name ?? null,
    };
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

const PreviewRunSchema = z.object({
  product_id: z.string().uuid(),
  per_unit_amount: z.number().nonnegative().max(1_000_000),
});

export type DividendRunPreview = {
  eligible_members: number;
  total_units: number;
  per_unit_amount: number;
  estimated_total: number;
  currency: string;
};

export const previewDividendRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => PreviewRunSchema.parse(data))
  .handler(async ({ data, context }): Promise<DividendRunPreview> => {
    await assertFinanceStaff(context.supabase, context.userId);
    const [{ data: prod, error: pErr }, { data: holdings, error: hErr }] = await Promise.all([
      context.supabase.from("share_products").select("currency").eq("id", data.product_id).single(),
      context.supabase
        .from("share_holdings")
        .select("user_id, units")
        .eq("product_id", data.product_id)
        .gt("units", 0),
    ]);
    if (pErr) throw new Error(pErr.message);
    if (hErr) throw new Error(hErr.message);
    const holders = new Set<string>();
    let totalUnits = 0;
    for (const h of holdings ?? []) {
      holders.add((h as any).user_id);
      totalUnits += Number((h as any).units ?? 0);
    }
    return {
      eligible_members: holders.size,
      total_units: totalUnits,
      per_unit_amount: data.per_unit_amount,
      estimated_total: Number((totalUnits * data.per_unit_amount).toFixed(2)),
      currency: (prod as any)?.currency ?? "GHS",
    };
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

// ============================================================================
// Time-series for charts (last N months)
// ============================================================================

export type InvestmentSeriesPoint = {
  month: string; // YYYY-MM
  contributions: number;
  returns: number;
  dividends_cum: number;
  portfolio_value: number;
};

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function emptyMonthlyBuckets(months: number): InvestmentSeriesPoint[] {
  const out: InvestmentSeriesPoint[] = [];
  const now = new Date();
  now.setUTCDate(1);
  now.setUTCHours(0, 0, 0, 0);
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({
      month: monthKey(d),
      contributions: 0,
      returns: 0,
      dividends_cum: 0,
      portfolio_value: 0,
    });
  }
  return out;
}

async function buildSeries(
  supabase: any,
  opts: { userId?: string; months: number },
): Promise<InvestmentSeriesPoint[]> {
  const buckets = emptyMonthlyBuckets(opts.months);
  const from = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - (opts.months - 1), 1));
  let txnQ = supabase
    .from("share_transactions")
    .select("kind, units, amount, created_at, share_products(unit_price)")
    .gte("created_at", from.toISOString())
    .order("created_at", { ascending: true });
  if (opts.userId) txnQ = txnQ.eq("user_id", opts.userId);
  const { data: txns, error: tErr } = await txnQ;
  if (tErr) throw new Error(tErr.message);

  // Pre-window running totals (units and cumulative dividends before the window)
  let priorUnits = 0;
  let priorDividends = 0;
  let priorQ = supabase.from("share_transactions").select("kind, units, amount").lt("created_at", from.toISOString());
  if (opts.userId) priorQ = priorQ.eq("user_id", opts.userId);
  const { data: prior, error: pErr } = await priorQ;
  if (pErr) throw new Error(pErr.message);
  for (const t of prior ?? []) {
    const units = Number((t as any).units ?? 0);
    const amt = Number((t as any).amount ?? 0);
    if ((t as any).kind === "purchase") priorUnits += units;
    else if ((t as any).kind === "sale") priorUnits -= units;
    else if ((t as any).kind === "dividend") priorDividends += amt;
  }

  const idx = new Map(buckets.map((b, i) => [b.month, i]));
  let runningUnits = priorUnits;
  let runningDividends = priorDividends;
  // Track last known unit_price per bucket for value estimation
  const monthPrice: number[] = new Array(buckets.length).fill(0);

  for (const t of txns ?? []) {
    const key = monthKey(new Date((t as any).created_at));
    const i = idx.get(key);
    if (i == null) continue;
    const units = Number((t as any).units ?? 0);
    const amt = Number((t as any).amount ?? 0);
    const price = Number((t as any).share_products?.unit_price ?? 0);
    if (price > 0) monthPrice[i] = price;
    if ((t as any).kind === "purchase") {
      runningUnits += units;
      buckets[i].contributions += amt;
    } else if ((t as any).kind === "sale") {
      runningUnits -= units;
      buckets[i].contributions -= amt;
    } else if ((t as any).kind === "dividend") {
      runningDividends += amt;
      buckets[i].returns += amt;
    }
    buckets[i].dividends_cum = runningDividends;
    buckets[i].portfolio_value = Number((runningUnits * (monthPrice[i] || price || 0)).toFixed(2));
  }

  // Forward-fill portfolio_value / dividends_cum across empty months
  let lastValue = 0;
  let lastDivCum = priorDividends;
  let lastPrice = 0;
  for (let i = 0; i < buckets.length; i++) {
    if (monthPrice[i] > 0) lastPrice = monthPrice[i];
    if (buckets[i].portfolio_value === 0) {
      buckets[i].portfolio_value = Number((runningUnitsAt(buckets, i, priorUnits) * lastPrice).toFixed(2));
      if (buckets[i].portfolio_value === 0) buckets[i].portfolio_value = lastValue;
    }
    if (buckets[i].dividends_cum === 0 && buckets[i].returns === 0) buckets[i].dividends_cum = lastDivCum;
    lastValue = buckets[i].portfolio_value;
    lastDivCum = buckets[i].dividends_cum;
  }

  return buckets;
}

// Recompute units at end of bucket i from contributions signs (helper for gaps)
function runningUnitsAt(buckets: InvestmentSeriesPoint[], _i: number, _prior: number): number {
  // Simple heuristic: portfolio_value already reflects runningUnits at txn time.
  // For empty months, returning 0 lets caller fall back to lastValue.
  return 0;
}

export const getMyInvestmentSeries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InvestmentSeriesPoint[]> => {
    return buildSeries(context.supabase, { userId: context.userId, months: 12 });
  });

export const getAdminInvestmentSeries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InvestmentSeriesPoint[]> => {
    await assertStaff(context.supabase, context.userId);
    return buildSeries(context.supabase, { months: 12 });
  });
