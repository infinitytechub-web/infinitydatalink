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
