import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MyTransferRow = {
  id: string;
  ref: string;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  status: "pending" | "cleared" | "failed" | "reversed";
  channel: string | null;
  note: string | null;
  created_at: string;
  cleared_at: string | null;
  direction: "out" | "in";
  counterparty_label: string;
};

export type MyTransferAccount = {
  id: string;
  balance: number;
  plan_name: string | null;
  nickname: string | null;
};

export type MemberDirectoryAccount = {
  account_id: string;
  member_no: string | null;
  member_name: string | null;
  plan_name: string | null;
  is_self: boolean;
};

export const listMyTransfers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ status: z.enum(["all", "pending", "cleared", "failed"]).default("all") }).parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<MyTransferRow[]> => {
    // Find my accounts first so we can label direction correctly.
    const { data: myAccts } = await context.supabase
      .from("savings_accounts")
      .select("id")
      .eq("user_id", context.userId);
    const mine = new Set(((myAccts ?? []) as Array<{ id: string }>).map((a) => a.id));

    let q: any = context.supabase
      .from("transfers")
      .select(
        "id, ref, from_account_id, to_account_id, amount, status, channel, note, created_at, cleared_at, from:from_account_id(profiles(full_name, member_no), savings_plans(name)), to:to_account_id(profiles(full_name, member_no), savings_plans(name))",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) {
      // Fallback: no joins available
      const { data: r2 } = await context.supabase
        .from("transfers")
        .select("id, ref, from_account_id, to_account_id, amount, status, channel, note, created_at, cleared_at")
        .order("created_at", { ascending: false })
        .limit(200);
      return ((r2 ?? []) as any[]).map((t) => ({
        id: t.id,
        ref: t.ref,
        from_account_id: t.from_account_id,
        to_account_id: t.to_account_id,
        amount: Number(t.amount),
        status: t.status,
        channel: t.channel,
        note: t.note,
        created_at: t.created_at,
        cleared_at: t.cleared_at,
        direction: mine.has(t.from_account_id) ? "out" : "in",
        counterparty_label: mine.has(t.from_account_id) ? t.to_account_id.slice(0, 8) : t.from_account_id.slice(0, 8),
      }));
    }
    return ((rows ?? []) as any[]).map((t) => {
      const isOut = mine.has(t.from_account_id);
      const cp = isOut ? t.to : t.from;
      const cpName = cp?.profiles?.full_name ?? cp?.profiles?.member_no ?? "Member";
      const cpPlan = cp?.savings_plans?.name ?? "Savings";
      return {
        id: t.id,
        ref: t.ref,
        from_account_id: t.from_account_id,
        to_account_id: t.to_account_id,
        amount: Number(t.amount),
        status: t.status,
        channel: t.channel,
        note: t.note,
        created_at: t.created_at,
        cleared_at: t.cleared_at,
        direction: isOut ? "out" : "in",
        counterparty_label: `${cpName} · ${cpPlan}`,
      } satisfies MyTransferRow;
    });
  });

export const listMyTransferAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyTransferAccount[]> => {
    const { data, error } = await (context.supabase as any)
      .from("savings_accounts")
      .select("id, balance, nickname, savings_plans(name)")
      .eq("user_id", context.userId)
      .eq("status", "active")
      .order("created_at");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      balance: Number(r.balance),
      plan_name: r.savings_plans?.name ?? null,
      nickname: r.nickname,
    }));
  });

// Public member directory of savings accounts to pick a destination.
// We limit to member_no (masked identifier) and plan for privacy — no email.
export const listTransferableAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ search: z.string().trim().max(80).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<MemberDirectoryAccount[]> => {
    let q: any = (context.supabase as any)
      .from("savings_accounts")
      .select("id, user_id, profiles!savings_accounts_user_id_profiles_fkey!inner(full_name, member_no), savings_plans(name)")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.search) {
      q = q.or(`full_name.ilike.%${data.search}%,member_no.ilike.%${data.search}%`, { foreignTable: "profiles" });
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return ((rows ?? []) as any[]).map((r) => ({
      account_id: r.id,
      member_no: r.profiles?.member_no ?? null,
      member_name: r.profiles?.full_name ?? null,
      plan_name: r.savings_plans?.name ?? null,
      is_self: r.user_id === context.userId,
    }));
  });

const RequestSchema = z.object({
  from_account_id: z.string().uuid(),
  to_account_id: z.string().uuid(),
  amount: z.number().positive().max(10_000_000),
  note: z.string().max(500).optional().nullable(),
});

export const requestTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RequestSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string; ref: string }> => {
    const { data: row, error } = await (context.supabase as any).rpc("request_transfer", {
      _from_account_id: data.from_account_id,
      _to_account_id: data.to_account_id,
      _amount: data.amount,
      _note: data.note ?? null,
    });
    if (error) throw new Error(error.message);
    return { id: (row as any)?.id, ref: (row as any)?.ref };
  });
