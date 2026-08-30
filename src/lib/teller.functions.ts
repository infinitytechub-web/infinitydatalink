import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit-log";

export const TELLER_KINDS = [
  "deposit",
  "savings_contribution",
  "withdrawal",
  "loan_repayment",
  "payment",
] as const;
export type TellerKind = (typeof TELLER_KINDS)[number];

export const TELLER_METHODS = ["cash", "cheque", "mobile_money", "bank_transfer", "card"] as const;

export const TELLER_KIND_LABELS: Record<TellerKind, string> = {
  deposit: "Deposit",
  savings_contribution: "Savings contribution",
  withdrawal: "Withdrawal",
  loan_repayment: "Loan repayment",
  payment: "Payment",
};

/** Cash movements that change the physical drawer, signed for the drawer total. */
export function drawerDelta(kind: TellerKind, method: string, amount: number): number {
  if (method !== "cash") return 0;
  if (kind === "withdrawal") return -amount;
  return amount;
}

export type TellerSession = {
  id: string;
  teller_id: string;
  status: string;
  opening_float: number;
  expected_close: number | null;
  counted_close: number | null;
  variance: number | null;
  opened_at: string;
  closed_at: string | null;
  open_note: string | null;
  close_note: string | null;
};

export type TellerTxn = {
  id: string;
  session_id: string;
  teller_id: string;
  member_id: string;
  member_name: string | null;
  member_no: string | null;
  kind: TellerKind;
  method: string;
  amount: number;
  reference: string;
  account_id: string | null;
  loan_id: string | null;
  transaction_id: string | null;
  note: string | null;
  device_info: { agent?: string | null };
  created_at: string;
};

const SESSION_COLS =
  "id, teller_id, status, opening_float, expected_close, counted_close, variance, opened_at, closed_at, open_note, close_note";
const TXN_COLS =
  "id, session_id, teller_id, member_id, kind, method, amount, reference, account_id, loan_id, transaction_id, note, device_info, created_at";

function mapSession(r: any): TellerSession {
  return {
    id: r.id,
    teller_id: r.teller_id,
    status: r.status,
    opening_float: Number(r.opening_float ?? 0),
    expected_close: r.expected_close === null ? null : Number(r.expected_close),
    counted_close: r.counted_close === null ? null : Number(r.counted_close),
    variance: r.variance === null ? null : Number(r.variance),
    opened_at: r.opened_at,
    closed_at: r.closed_at,
    open_note: r.open_note,
    close_note: r.close_note,
  };
}

function mapTxn(r: any, names: Map<string, { full_name: string | null; member_no: string | null }>): TellerTxn {
  const p = names.get(r.member_id);
  return {
    id: r.id,
    session_id: r.session_id,
    teller_id: r.teller_id,
    member_id: r.member_id,
    member_name: p?.full_name ?? null,
    member_no: p?.member_no ?? null,
    kind: r.kind,
    method: r.method,
    amount: Number(r.amount ?? 0),
    reference: r.reference,
    account_id: r.account_id,
    loan_id: r.loan_id,
    transaction_id: r.transaction_id,
    note: r.note,
    device_info: (r.device_info ?? {}) as { agent?: string | null },
    created_at: r.created_at,
  };
}

async function attachNames(supabase: any, rows: any[]) {
  const ids = [...new Set(rows.map((r) => r.member_id))];
  const names = new Map<string, { full_name: string | null; member_no: string | null }>();
  if (ids.length > 0) {
    const { data } = await supabase.from("profiles").select("id, full_name, member_no").in("id", ids);
    for (const p of (data ?? []) as any[]) names.set(p.id, { full_name: p.full_name, member_no: p.member_no });
  }
  return rows.map((r) => mapTxn(r, names));
}

/** Current teller workspace: open session, today's postings and drawer position. */
export const getTellerWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPermission(context.supabase, context.userId, "teller", "view");
    const sb = context.supabase;

    const { data: openRow, error: sErr } = await sb
      .from("teller_sessions")
      .select(SESSION_COLS)
      .eq("teller_id", context.userId)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    const session = openRow ? mapSession(openRow) : null;

    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const q = sb
      .from("teller_transactions")
      .select(TXN_COLS)
      .eq("teller_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    const { data: txnRows, error: tErr } = session
      ? await q.eq("session_id", session.id)
      : await q.gte("created_at", since);
    if (tErr) throw new Error(tErr.message);
    const transactions = await attachNames(sb, (txnRows ?? []) as any[]);

    const cashIn = transactions
      .filter((t) => t.method === "cash" && t.kind !== "withdrawal")
      .reduce((s, t) => s + t.amount, 0);
    const cashOut = transactions
      .filter((t) => t.method === "cash" && t.kind === "withdrawal")
      .reduce((s, t) => s + t.amount, 0);
    const drawer = (session?.opening_float ?? 0) + cashIn - cashOut;

    const { data: recent } = await sb
      .from("teller_sessions")
      .select(SESSION_COLS)
      .eq("teller_id", context.userId)
      .order("opened_at", { ascending: false })
      .limit(10);

    return {
      session,
      transactions,
      totals: {
        count: transactions.length,
        value: transactions.reduce((s, t) => s + t.amount, 0),
        cash_in: cashIn,
        cash_out: cashOut,
        drawer,
      },
      recent_sessions: ((recent ?? []) as any[]).map(mapSession),
    };
  });

export const openTellerSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ opening_float: z.number().min(0).max(10_000_000), note: z.string().max(500).optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "teller", "create");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("teller_sessions")
      .select("id")
      .eq("teller_id", context.userId)
      .eq("status", "open")
      .maybeSingle();
    if (existing) throw new Error("You already have an open teller session. Close it before opening a new one.");

    const { data: row, error } = await (supabaseAdmin as any)
      .from("teller_sessions")
      .insert({
        teller_id: context.userId,
        opening_float: data.opening_float,
        open_note: data.note ?? null,
      })
      .select(SESSION_COLS)
      .single();
    if (error) throw new Error(error.message);

    await writeAudit({
      actor_id: context.userId,
      action: "teller.session.opened",
      target: row.id,
      meta: { opening_float: data.opening_float },
    });
    return mapSession(row);
  });

export const closeTellerSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        session_id: z.string().uuid(),
        counted_close: z.number().min(0).max(10_000_000),
        note: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "teller", "create");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: session, error: sErr } = await supabaseAdmin
      .from("teller_sessions")
      .select(SESSION_COLS)
      .eq("id", data.session_id)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!session) throw new Error("Session not found");
    if ((session as any).teller_id !== context.userId) throw new Error("Forbidden: not your teller session");
    if ((session as any).status !== "open") throw new Error("Session is already closed");

    const { data: txns } = await supabaseAdmin
      .from("teller_transactions")
      .select("kind, method, amount")
      .eq("session_id", data.session_id);
    const expected = ((txns ?? []) as any[]).reduce(
      (sum, t) => sum + drawerDelta(t.kind as TellerKind, t.method, Number(t.amount)),
      Number((session as any).opening_float ?? 0),
    );
    const variance = Math.round((data.counted_close - expected) * 100) / 100;

    const { data: row, error } = await (supabaseAdmin as any)
      .from("teller_sessions")
      .update({
        status: "closed",
        counted_close: data.counted_close,
        expected_close: expected,
        variance,
        closed_at: new Date().toISOString(),
        close_note: data.note ?? null,
      })
      .eq("id", data.session_id)
      .select(SESSION_COLS)
      .single();
    if (error) throw new Error(error.message);

    await writeAudit({
      actor_id: context.userId,
      action: "teller.session.closed",
      target: data.session_id,
      meta: { expected, counted: data.counted_close, variance, postings: (txns ?? []).length },
    });
    return mapSession(row);
  });

export type TellerMemberLookup = {
  id: string;
  member_no: string | null;
  full_name: string | null;
  phone: string | null;
  status: string | null;
  kyc: string | null;
  accounts: Array<{ id: string; label: string; balance: number; status: string | null }>;
  loans: Array<{ id: string; product: string | null; outstanding: number; status: string }>;
};

/** Member lookup by member number, name fragment or user id. */
export const lookupTellerMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ query: z.string().min(2).max(120) }).parse(d))
  .handler(async ({ data, context }): Promise<TellerMemberLookup[]> => {
    await assertPermission(context.supabase, context.userId, "teller", "view");
    const sb = context.supabase;
    // Escape PostgREST pattern metacharacters so the filter can't be injected.
    const term = data.query.trim().replace(/[%,()*\\]/g, "");
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(term);

    let query = sb.from("profiles").select("id, member_no, full_name, phone, status, kyc").limit(10);
    query = isUuid
      ? query.eq("id", term)
      : query.or(`member_no.ilike.%${term}%,full_name.ilike.%${term}%,phone.ilike.%${term}%`);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const ids = ((rows ?? []) as any[]).map((r) => r.id);
    if (ids.length === 0) return [];

    const [{ data: accounts }, { data: loans }] = await Promise.all([
      sb
        .from("savings_accounts")
        .select("id, user_id, nickname, balance, status, savings_plans(name)")
        .in("user_id", ids),
      sb.from("loans").select("id, user_id, product, outstanding, status").in("user_id", ids).in("status", ["active", "approved"]),
    ]);

    return ((rows ?? []) as any[]).map((p) => ({
      id: p.id,
      member_no: p.member_no,
      full_name: p.full_name,
      phone: p.phone,
      status: p.status,
      kyc: p.kyc,
      accounts: ((accounts ?? []) as any[])
        .filter((a) => a.user_id === p.id)
        .map((a) => ({
          id: a.id,
          label: a.nickname || a.savings_plans?.name || "Savings account",
          balance: Number(a.balance ?? 0),
          status: a.status,
        })),
      loans: ((loans ?? []) as any[])
        .filter((l) => l.user_id === p.id)
        .map((l) => ({
          id: l.id,
          product: l.product ?? null,
          outstanding: Number(l.outstanding ?? 0),
          status: l.status,
        })),
    }));
  });

export type TellerReceipt = {
  reference: string;
  kind: TellerKind;
  method: string;
  amount: number;
  member_name: string | null;
  member_no: string | null;
  teller_id: string;
  session_id: string;
  created_at: string;
  transaction_id: string | null;
  note: string | null;
};

/**
 * Posts a teller transaction. Balances move through the same audited database
 * routines the member portal uses, so references, ledger rows and balance
 * atomicity are inherited rather than reimplemented here.
 */
export const postTellerTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        member_id: z.string().uuid(),
        kind: z.enum(TELLER_KINDS),
        method: z.enum(TELLER_METHODS),
        amount: z.number().positive().max(10_000_000),
        account_id: z.string().uuid().optional(),
        loan_id: z.string().uuid().optional(),
        note: z.string().max(500).optional(),
        /** Client-generated key; makes a double submit a no-op instead of a double posting. */
        idempotency_key: z.string().min(8).max(64),
        device: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<TellerReceipt> => {
    await assertPermission(context.supabase, context.userId, "teller", "create");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: session } = await supabaseAdmin
      .from("teller_sessions")
      .select("id, opening_float")
      .eq("teller_id", context.userId)
      .eq("status", "open")
      .maybeSingle();
    if (!session) throw new Error("Open a teller session before posting transactions");

    const reference = `TLR-${data.idempotency_key.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40).toUpperCase()}`;

    // Duplicate protection: the same key never posts twice.
    const { data: dupe } = await supabaseAdmin
      .from("teller_transactions")
      .select(TXN_COLS)
      .eq("reference", reference)
      .maybeSingle();
    if (dupe) {
      const { data: p } = await supabaseAdmin
        .from("profiles")
        .select("full_name, member_no")
        .eq("id", (dupe as any).member_id)
        .maybeSingle();
      return {
        reference,
        kind: (dupe as any).kind,
        method: (dupe as any).method,
        amount: Number((dupe as any).amount),
        member_name: (p as any)?.full_name ?? null,
        member_no: (p as any)?.member_no ?? null,
        teller_id: (dupe as any).teller_id,
        session_id: (dupe as any).session_id,
        created_at: (dupe as any).created_at,
        transaction_id: (dupe as any).transaction_id,
        note: (dupe as any).note,
      };
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, member_no, status")
      .eq("id", data.member_id)
      .maybeSingle();
    if (!profile) throw new Error("Member not found");
    if ((profile as any).status !== "approved") throw new Error("Member account is not approved");

    const channel = `teller:${data.method}`;
    const note = data.note ?? `Teller posting by ${context.userId}`;
    let transactionId: string | null = null;

    if (data.kind === "loan_repayment") {
      if (!data.loan_id) throw new Error("Select the loan to credit");
      const { data: loan } = await supabaseAdmin
        .from("loans")
        .select("id, user_id")
        .eq("id", data.loan_id)
        .maybeSingle();
      if (!loan || (loan as any).user_id !== data.member_id) throw new Error("Loan does not belong to this member");
      const { error } = await (supabaseAdmin as any).rpc("record_loan_repayment", {
        _loan_id: data.loan_id,
        _amount: data.amount,
        _channel: channel,
        _note: note,
        _actor_id: context.userId,
      });
      if (error) throw new Error(error.message);
    } else {
      if (!data.account_id) throw new Error("Select the savings account");
      const { data: account } = await supabaseAdmin
        .from("savings_accounts")
        .select("id, user_id, balance")
        .eq("id", data.account_id)
        .maybeSingle();
      if (!account || (account as any).user_id !== data.member_id)
        throw new Error("Account does not belong to this member");

      if (data.kind === "withdrawal") {
        if (Number((account as any).balance ?? 0) < data.amount)
          throw new Error("Insufficient available balance on the selected account");
        const { data: txn, error } = await (supabaseAdmin as any).rpc("post_savings_withdrawal", {
          _account_id: data.account_id,
          _amount: data.amount,
          _channel: channel,
          _note: note,
          _actor_id: context.userId,
        });
        if (error) throw new Error(error.message);
        transactionId = (txn as string) ?? null;
      } else {
        const { data: txn, error } = await (supabaseAdmin as any).rpc("post_savings_contribution", {
          _account_id: data.account_id,
          _amount: data.amount,
          _channel: channel,
          _note: note,
          _actor_id: context.userId,
        });
        if (error) throw new Error(error.message);
        transactionId = (txn as string) ?? null;
      }
    }

    const { data: row, error: insErr } = await (supabaseAdmin as any)
      .from("teller_transactions")
      .insert({
        session_id: (session as any).id,
        teller_id: context.userId,
        member_id: data.member_id,
        kind: data.kind,
        method: data.method,
        amount: data.amount,
        reference,
        account_id: data.account_id ?? null,
        loan_id: data.loan_id ?? null,
        transaction_id: transactionId,
        note: data.note ?? null,
        device_info: { agent: data.device ?? null },
      })
      .select(TXN_COLS)
      .single();
    if (insErr) throw new Error(insErr.message);

    await writeAudit({
      actor_id: context.userId,
      action: `teller.${data.kind}`,
      target: data.member_id,
      meta: {
        reference,
        amount: data.amount,
        method: data.method,
        session_id: (session as any).id,
        account_id: data.account_id ?? null,
        loan_id: data.loan_id ?? null,
        transaction_id: transactionId,
      },
    });

    // Keep the member informed of activity on their account.
    try {
      const { notifyUser } = await import("@/lib/notify.server");
      await notifyUser({
        userId: data.member_id,
        category: `teller.${data.kind}`,
        title: `${TELLER_KIND_LABELS[data.kind]} recorded`,
        body: `Reference ${reference} for GH₵${data.amount.toFixed(2)} was recorded at the counter.`,
      });
    } catch (err) {
      console.error("teller notification failed", (err as Error)?.message);
    }

    return {
      reference,
      kind: data.kind,
      method: data.method,
      amount: data.amount,
      member_name: (profile as any).full_name ?? null,
      member_no: (profile as any).member_no ?? null,
      teller_id: context.userId,
      session_id: (session as any).id,
      created_at: (row as any).created_at,
      transaction_id: transactionId,
      note: data.note ?? null,
    };
  });

/** Supervisor view: all teller activity for reconciliation and reporting. */
export const listTellerActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        date_from: z.string().optional(),
        date_to: z.string().optional(),
        teller_id: z.string().uuid().optional(),
        kind: z.enum(TELLER_KINDS).optional(),
        page: z.number().int().min(1).max(500).optional().default(1),
        page_size: z.number().int().min(5).max(200).optional().default(25),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "teller", "view");
    const sb = context.supabase;
    let q = sb.from("teller_transactions").select(TXN_COLS, { count: "exact" });
    if (data.date_from) q = q.gte("created_at", `${data.date_from}T00:00:00.000Z`);
    if (data.date_to) q = q.lte("created_at", `${data.date_to}T23:59:59.999Z`);
    if (data.teller_id) q = q.eq("teller_id", data.teller_id);
    if (data.kind) q = q.eq("kind", data.kind);

    const from = (data.page - 1) * data.page_size;
    const { data: rows, error, count } = await q
      .order("created_at", { ascending: false })
      .range(from, from + data.page_size - 1);
    if (error) throw new Error(error.message);

    const mapped = await attachNames(sb, (rows ?? []) as any[]);
    return {
      rows: mapped,
      total: count ?? mapped.length,
      value: mapped.reduce((s, r) => s + r.amount, 0),
    };
  });

/** Open/closed sessions for the operations and reconciliation views. */
export const listTellerSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ status: z.enum(["open", "closed", "all"]).optional().default("all") }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "teller", "view");
    let q = context.supabase.from("teller_sessions").select(SESSION_COLS).order("opened_at", { ascending: false }).limit(100);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const sessions = ((rows ?? []) as any[]).map(mapSession);
    const ids = [...new Set(sessions.map((s) => s.teller_id))];
    const names = new Map<string, string | null>();
    if (ids.length) {
      const { data: profs } = await context.supabase.from("profiles").select("id, full_name").in("id", ids);
      for (const p of (profs ?? []) as any[]) names.set(p.id, p.full_name);
    }
    return sessions.map((s) => ({ ...s, teller_name: names.get(s.teller_id) ?? null }));
  });
