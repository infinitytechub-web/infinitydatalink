import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Statement = {
  id: string;
  account_id: string;
  account_label: string;
  plan_name: string;
  period_start: string;
  period_end: string;
  opening_balance: number;
  closing_balance: number;
  deposits_total: number;
  withdrawals_total: number;
  interest_credited: number;
  generated_at: string;
};

export type StatementLine = {
  id: string;
  ref: string;
  kind: string;
  amount: number;
  status: string;
  channel: string | null;
  note: string | null;
  created_at: string;
};

export const listMyStatements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ account_id: z.string().uuid().optional().nullable() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<Statement[]> => {
    let q = context.supabase
      .from("savings_statements")
      .select(
        "id, account_id, period_start, period_end, opening_balance, closing_balance, deposits_total, withdrawals_total, interest_credited, generated_at, savings_accounts(nickname, savings_plans(name))",
      )
      .eq("user_id", context.userId)
      .order("period_end", { ascending: false });
    if (data.account_id) q = q.eq("account_id", data.account_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      account_id: r.account_id,
      account_label: r.savings_accounts?.nickname || r.savings_accounts?.savings_plans?.name || "Savings",
      plan_name: r.savings_accounts?.savings_plans?.name || "—",
      period_start: r.period_start,
      period_end: r.period_end,
      opening_balance: Number(r.opening_balance ?? 0),
      closing_balance: Number(r.closing_balance ?? 0),
      deposits_total: Number(r.deposits_total ?? 0),
      withdrawals_total: Number(r.withdrawals_total ?? 0),
      interest_credited: Number(r.interest_credited ?? 0),
      generated_at: r.generated_at,
    }));
  });

export const getStatement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ statement: Statement; lines: StatementLine[] }> => {
    const { data: s, error } = await context.supabase
      .from("savings_statements")
      .select(
        "id, account_id, period_start, period_end, opening_balance, closing_balance, deposits_total, withdrawals_total, interest_credited, generated_at, savings_accounts(nickname, savings_plans(name))",
      )
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!s) throw new Error("statement_not_found");
    const { data: lines, error: lErr } = await context.supabase
      .from("transactions")
      .select("id, ref, kind, amount, status, channel, note, created_at")
      .eq("savings_account_id", (s as any).account_id)
      .gte("created_at", (s as any).period_start)
      .lte("created_at", (s as any).period_end + "T23:59:59Z")
      .order("created_at", { ascending: true });
    if (lErr) throw new Error(lErr.message);

    const r: any = s;
    return {
      statement: {
        id: r.id,
        account_id: r.account_id,
        account_label: r.savings_accounts?.nickname || r.savings_accounts?.savings_plans?.name || "Savings",
        plan_name: r.savings_accounts?.savings_plans?.name || "—",
        period_start: r.period_start,
        period_end: r.period_end,
        opening_balance: Number(r.opening_balance ?? 0),
        closing_balance: Number(r.closing_balance ?? 0),
        deposits_total: Number(r.deposits_total ?? 0),
        withdrawals_total: Number(r.withdrawals_total ?? 0),
        interest_credited: Number(r.interest_credited ?? 0),
        generated_at: r.generated_at,
      },
      lines: (lines ?? []).map((t: any) => ({
        id: t.id,
        ref: t.ref,
        kind: t.kind,
        amount: Number(t.amount),
        status: t.status,
        channel: t.channel,
        note: t.note,
        created_at: t.created_at,
      })),
    };
  });

// ============================================================================
// Member: build an on-demand statement for any period (not just stored months)
// ============================================================================

const CREDIT_KINDS = new Set(["deposit", "interest", "transfer_in", "loan_disbursement"]);

function signedAmount(kind: string, amount: number): number {
  const abs = Math.abs(amount);
  if (kind === "adjustment") return amount;
  return CREDIT_KINDS.has(kind) ? abs : -abs;
}

export type CustomStatementLine = StatementLine & {
  account_label: string;
  signed_amount: number;
  running_balance: number;
};

export type CustomStatement = {
  account_id: string | null;
  account_label: string;
  period_start: string;
  period_end: string;
  opening_balance: number;
  closing_balance: number;
  deposits_total: number;
  withdrawals_total: number;
  interest_credited: number;
  transfers_in_total: number;
  transfers_out_total: number;
  net_change: number;
  txn_count: number;
  generated_at: string;
  lines: CustomStatementLine[];
};

export const buildStatement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        account_id: z.string().uuid().nullable().optional(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<CustomStatement> => {
    const { data: accounts, error: aErr } = await context.supabase
      .from("savings_accounts")
      .select("id, nickname, savings_plans(name)")
      .eq("user_id", context.userId);
    if (aErr) throw new Error(aErr.message);
    const labels = new Map<string, string>(
      (accounts ?? []).map((a: any) => [
        a.id as string,
        (a.nickname || a.savings_plans?.name || "Savings") as string,
      ]),
    );
    const accountIds = [...labels.keys()];
    if (data.account_id && !labels.has(data.account_id)) throw new Error("account_not_found");
    const scope = data.account_id ? [data.account_id] : accountIds;
    if (scope.length === 0) {
      return {
        account_id: data.account_id ?? null,
        account_label: "All savings accounts",
        period_start: data.from,
        period_end: data.to,
        opening_balance: 0,
        closing_balance: 0,
        deposits_total: 0,
        withdrawals_total: 0,
        interest_credited: 0,
        transfers_in_total: 0,
        transfers_out_total: 0,
        net_change: 0,
        txn_count: 0,
        generated_at: new Date().toISOString(),
        lines: [],
      };
    }

    const startIso = `${data.from}T00:00:00Z`;
    const endIso = `${data.to}T23:59:59Z`;

    const [{ data: prior, error: pErr }, { data: rows, error: rErr }] = await Promise.all([
      context.supabase
        .from("transactions")
        .select("kind, amount")
        .eq("user_id", context.userId)
        .in("savings_account_id", scope)
        .eq("status", "cleared")
        .lt("created_at", startIso),
      context.supabase
        .from("transactions")
        .select("id, ref, kind, amount, status, channel, note, created_at, savings_account_id")
        .eq("user_id", context.userId)
        .in("savings_account_id", scope)
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .order("created_at", { ascending: true }),
    ]);
    if (pErr) throw new Error(pErr.message);
    if (rErr) throw new Error(rErr.message);

    const opening = (prior ?? []).reduce(
      (sum: number, r: any) => sum + signedAmount(r.kind, Number(r.amount ?? 0)),
      0,
    );

    let running = opening;
    let deposits = 0;
    let withdrawals = 0;
    let interest = 0;
    let transfersIn = 0;
    let transfersOut = 0;

    const lines: CustomStatementLine[] = (rows ?? []).map((t: any) => {
      const amount = Number(t.amount ?? 0);
      const signed = signedAmount(t.kind, amount);
      if (t.status === "cleared") {
        running += signed;
        if (t.kind === "deposit") deposits += Math.abs(amount);
        else if (t.kind === "withdrawal") withdrawals += Math.abs(amount);
        else if (t.kind === "interest") interest += Math.abs(amount);
        else if (t.kind === "transfer_in") transfersIn += Math.abs(amount);
        else if (t.kind === "transfer_out") transfersOut += Math.abs(amount);
      }
      return {
        id: t.id,
        ref: t.ref,
        kind: t.kind,
        amount,
        status: t.status,
        channel: t.channel,
        note: t.note,
        created_at: t.created_at,
        account_label: labels.get(t.savings_account_id) ?? "Savings",
        signed_amount: signed,
        running_balance: running,
      };
    });

    return {
      account_id: data.account_id ?? null,
      account_label: data.account_id ? (labels.get(data.account_id) ?? "Savings") : "All savings accounts",
      period_start: data.from,
      period_end: data.to,
      opening_balance: opening,
      closing_balance: running,
      deposits_total: deposits,
      withdrawals_total: withdrawals,
      interest_credited: interest,
      transfers_in_total: transfersIn,
      transfers_out_total: transfersOut,
      net_change: running - opening,
      txn_count: lines.length,
      generated_at: new Date().toISOString(),
      lines,
    };
  });
