import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole, FINANCE_ROLES, loadRoleSet } from "@/lib/role-guards";
import { writeAudit } from "@/lib/audit-log";

export type DepositStatus = "pending" | "approved" | "rejected" | "cancelled";
export type DepositRequest = {
  id: string;
  ref: string;
  user_id: string;
  account_id: string;
  account_label: string;
  member_name: string | null;
  amount: number;
  channel: string;
  payment_reference: string | null;
  note: string | null;
  status: DepositStatus;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
};

export const DEPOSIT_CHANNELS = ["mobile_money", "bank_transfer", "card", "cash"] as const;

const COLS =
  "id, ref, user_id, account_id, amount, channel, payment_reference, note, status, decision_note, decided_at, created_at, savings_accounts(nickname, savings_plans(name))";

function mapRow(r: any, names: Map<string, string> = new Map()): DepositRequest {
  return {
    ...r,
    amount: Number(r.amount),
    account_label: r.savings_accounts?.nickname || r.savings_accounts?.savings_plans?.name || "Savings",
    member_name: names.get(r.user_id) ?? null,
  };
}

const ERRORS: Record<string, string> = {
  invalid_amount: "Enter an amount greater than zero.",
  above_max_amount: "That amount is above the GH₵1,000,000 limit for one deposit.",
  account_not_owned: "That savings account isn't yours.",
  account_not_active: "That savings account isn't active.",
  not_cancellable: "Only pending deposits can be cancelled.",
  request_not_pending: "This deposit has already been decided.",
  cannot_approve_own_deposit: "You can't approve your own deposit.",
  reason_required: "Give a reason of at least 5 characters.",
  forbidden: "You don't have permission to decide deposits.",
};
function friendly(msg: string) {
  const key = Object.keys(ERRORS).find((k) => msg.includes(k));
  return new Error(key ? ERRORS[key] : msg);
}

export const listMyDeposits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DepositRequest[]> => {
    const { data, error } = await context.supabase
      .from("savings_deposit_requests")
      .select(COLS)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => mapRow(r));
  });

export const requestDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        account_id: z.string().uuid(),
        amount: z.number().positive().max(1_000_000),
        channel: z.enum(DEPOSIT_CHANNELS),
        payment_reference: z.string().max(80).default(""),
        note: z.string().max(300).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("request_savings_deposit", {
      _account_id: data.account_id,
      _amount: data.amount,
      _channel: data.channel,
      _payment_reference: data.payment_reference,
      _note: data.note,
    });
    if (error) throw friendly(error.message);
    const r = (Array.isArray(row) ? row[0] : row) as any;
    return { ok: true as const, ref: r?.ref as string };
  });

export const cancelMyDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("cancel_savings_deposit", { _id: data.id });
    if (error) throw friendly(error.message);
    return { ok: true as const };
  });

export const adminListDeposits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ status: z.enum(["pending", "approved", "rejected", "cancelled", "all"]).default("pending") }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const roles = await loadRoleSet(context.supabase, context.userId);
    assertAnyRole(roles, FINANCE_ROLES, "finance");
    let q = context.supabase
      .from("savings_deposit_requests")
      .select(COLS)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const ids = [...new Set((rows ?? []).map((r: any) => r.user_id))];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await context.supabase.from("profiles").select("id, full_name").in("id", ids);
      for (const p of profs ?? []) names.set((p as any).id, (p as any).full_name);
    }
    return (rows ?? []).map((r) => mapRow(r, names));
  });

export const adminDecideDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), approve: z.boolean(), note: z.string().max(500).default("") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await loadRoleSet(context.supabase, context.userId);
    assertAnyRole(roles, FINANCE_ROLES, "finance");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("decide_savings_deposit", {
      _id: data.id,
      _approve: data.approve,
      _note: data.note,
      _actor_id: context.userId,
    });
    if (error) throw friendly(error.message);
    const r = (Array.isArray(row) ? row[0] : row) as any;
    await writeAudit({
      actor_id: context.userId,
      actor_role: [...roles][0] ?? "finance_officer",
      action: data.approve ? "deposit.approved" : "deposit.rejected",
      target: data.id,
      meta: { ref: r?.ref, amount: r?.amount, note: data.note },
    });
    return { ok: true as const };
  });
