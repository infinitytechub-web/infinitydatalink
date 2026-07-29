import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole, FINANCE_ROLES, loadRoleSet, type Role } from "@/lib/role-guards";
import { assertDecisionPermission } from "@/lib/rbac-matrix";
import type { DecisionOutcome } from "@/lib/decision-audit";
import { writeAudit } from "@/lib/audit-log";

export type WithdrawalStatus = "pending" | "approved" | "rejected" | "cancelled" | "paid";

export type WithdrawalRequest = {
  id: string;
  ref: string;
  user_id: string;
  account_id: string;
  account_label: string;
  member_name: string | null;
  member_no: string | null;
  amount: number;
  channel: string;
  reason: string;
  status: WithdrawalStatus;
  balance_at_request: number;
  approval_note: string | null;
  rejection_reason: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancelled_by_role: string | null;
  cancellation_reason: string | null;
  approved_by: string | null;
  paid_by: string | null;
  txn_id: string | null;
  created_at: string;
};

export type WithdrawalSettings = {
  min_amount: number;
  max_amount: number;
  daily_limit: number;
  require_dual_control: boolean;
};

export type MemberWithdrawalView = {
  settings: WithdrawalSettings;
  requests: WithdrawalRequest[];
  holds: Array<{ account_id: string; held: number }>;
};

export type AdminWithdrawalList = {
  rows: WithdrawalRequest[];
  total: number;
  counts: { pending: number; approved: number; paid: number; rejected: number };
  pending_value: number;
};

const SELECT_COLS =
  "id, ref, user_id, account_id, amount, channel, reason, status, balance_at_request, approval_note, rejection_reason, approved_at, rejected_at, paid_at, cancelled_at, cancelled_by, cancelled_by_role, cancellation_reason, approved_by, paid_by, txn_id, created_at, savings_accounts(nickname, savings_plans(name))";

function mapRow(
  r: any,
  profile?: { full_name: string | null; member_no: string | null } | null,
): WithdrawalRequest {
  return {
    id: r.id,
    ref: r.ref,
    user_id: r.user_id,
    account_id: r.account_id,
    account_label:
      r.savings_accounts?.nickname || r.savings_accounts?.savings_plans?.name || "Savings account",
    member_name: profile?.full_name ?? null,
    member_no: profile?.member_no ?? null,
    amount: Number(r.amount),
    channel: r.channel,
    reason: r.reason,
    status: r.status,
    balance_at_request: Number(r.balance_at_request ?? 0),
    approval_note: r.approval_note ?? null,
    rejection_reason: r.rejection_reason ?? null,
    approved_at: r.approved_at ?? null,
    rejected_at: r.rejected_at ?? null,
    paid_at: r.paid_at ?? null,
    cancelled_at: r.cancelled_at ?? null,
    cancelled_by: r.cancelled_by ?? null,
    cancelled_by_role: r.cancelled_by_role ?? null,
    cancellation_reason: r.cancellation_reason ?? null,
    approved_by: r.approved_by ?? null,
    paid_by: r.paid_by ?? null,
    txn_id: r.txn_id ?? null,
    created_at: r.created_at,
  };
}

function pickActorRole(roles: ReadonlySet<Role>): string {
  if (roles.has("super_admin")) return "super_admin";
  if (roles.has("finance_officer")) return "finance_officer";
  return "finance_officer";
}

// ============================================================================
// Member
// ============================================================================

export const getMyWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MemberWithdrawalView> => {
    const [{ data: settings, error: sErr }, { data: rows, error: rErr }] = await Promise.all([
      context.supabase
        .from("savings_withdrawal_settings")
        .select("min_amount, max_amount, daily_limit, require_dual_control")
        .eq("id", 1)
        .maybeSingle(),
      context.supabase
        .from("savings_withdrawal_requests")
        .select(SELECT_COLS)
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (sErr) throw new Error(sErr.message);
    if (rErr) throw new Error(rErr.message);

    const requests = (rows ?? []).map((r: any) => mapRow(r));
    const holdMap = new Map<string, number>();
    for (const r of requests) {
      if (r.status === "pending" || r.status === "approved") {
        holdMap.set(r.account_id, (holdMap.get(r.account_id) ?? 0) + r.amount);
      }
    }

    return {
      settings: {
        min_amount: Number((settings as any)?.min_amount ?? 10),
        max_amount: Number((settings as any)?.max_amount ?? 50000),
        daily_limit: Number((settings as any)?.daily_limit ?? 100000),
        require_dual_control: Boolean((settings as any)?.require_dual_control ?? true),
      },
      requests,
      holds: Array.from(holdMap.entries()).map(([account_id, held]) => ({ account_id, held })),
    };
  });

const CreateSchema = z.object({
  account_id: z.string().uuid(),
  amount: z.number().positive().max(10_000_000),
  channel: z.string().trim().min(2).max(60).default("bank_transfer"),
  reason: z.string().trim().min(5).max(500),
});

export const createWithdrawalRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string; ref: string }> => {
    const { data: row, error } = await context.supabase.rpc("request_savings_withdrawal", {
      _account_id: data.account_id,
      _amount: data.amount,
      _channel: data.channel,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    const created = (Array.isArray(row) ? row[0] : row) as any;
    await writeAudit({
      actor_id: context.userId,
      actor_role: "member",
      action: "withdrawal.requested",
      target: created?.id ?? null,
      meta: { ref: created?.ref, amount: data.amount, account_id: data.account_id },
    });
    return { id: created.id, ref: created.ref };
  });

export const cancelWithdrawalRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ id: z.string().uuid(), reason: z.string().trim().min(5).max(500) })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("cancel_savings_withdrawal", {
      _id: data.id,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    await writeAudit({
      actor_id: context.userId,
      actor_role: "member",
      action: "withdrawal.cancelled",
      target: data.id,
      meta: { reason: data.reason, cancelled_by_role: "member" },
    });
    return { ok: true };
  });

// ============================================================================
// Admin queue
// ============================================================================

const FilterSchema = z.object({
  status: z.enum(["all", "pending", "approved", "paid", "rejected", "cancelled"]).default("pending"),
  search: z.string().trim().max(120).optional().nullable(),
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(5).max(100).default(25),
  date_from: z.string().date().optional().nullable(),
  date_to: z.string().date().optional().nullable(),
});

export const adminListWithdrawals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FilterSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<AdminWithdrawalList> => {
    const roles = await loadRoleSet(context.supabase, context.userId);
    assertAnyRole(roles, [...FINANCE_ROLES, "auditor"], "finance");

    const from = (data.page - 1) * data.page_size;
    const to = from + data.page_size - 1;

    let q = context.supabase
      .from("savings_withdrawal_requests")
      .select(SELECT_COLS, { count: "exact" });
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.date_from) q = q.gte("created_at", `${data.date_from}T00:00:00Z`);
    if (data.date_to) q = q.lte("created_at", `${data.date_to}T23:59:59.999Z`);
    q = q.order("created_at", { ascending: false }).range(from, to);

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.user_id as string)));
    const profiles = new Map<string, { full_name: string | null; member_no: string | null }>();
    if (ids.length > 0) {
      const { data: profs, error: pErr } = await context.supabase
        .from("profiles")
        .select("id, full_name, member_no")
        .in("id", ids);
      if (pErr) throw new Error(pErr.message);
      for (const p of (profs ?? []) as any[]) {
        profiles.set(p.id, { full_name: p.full_name ?? null, member_no: p.member_no ?? null });
      }
    }

    let mapped = (rows ?? []).map((r: any) => mapRow(r, profiles.get(r.user_id)));
    if (data.search) {
      const s = data.search.toLowerCase();
      mapped = mapped.filter(
        (r) =>
          r.ref.toLowerCase().includes(s) ||
          (r.member_name ?? "").toLowerCase().includes(s) ||
          (r.member_no ?? "").toLowerCase().includes(s) ||
          r.account_label.toLowerCase().includes(s),
      );
    }

    const [pending, approved, paid, rejected, pendingRows] = await Promise.all([
      context.supabase
        .from("savings_withdrawal_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      context.supabase
        .from("savings_withdrawal_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved"),
      context.supabase
        .from("savings_withdrawal_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "paid"),
      context.supabase
        .from("savings_withdrawal_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "rejected"),
      context.supabase
        .from("savings_withdrawal_requests")
        .select("amount")
        .in("status", ["pending", "approved"]),
    ]);

    return {
      rows: mapped,
      total: count ?? mapped.length,
      counts: {
        pending: pending.count ?? 0,
        approved: approved.count ?? 0,
        paid: paid.count ?? 0,
        rejected: rejected.count ?? 0,
      },
      pending_value: ((pendingRows.data ?? []) as any[]).reduce(
        (sum, r) => sum + Number(r.amount),
        0,
      ),
    };
  });

export const exportAdminWithdrawals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FilterSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<WithdrawalRequest[]> => {
    const roles = await loadRoleSet(context.supabase, context.userId);
    assertAnyRole(roles, [...FINANCE_ROLES, "auditor"], "finance");

    let q = context.supabase
      .from("savings_withdrawal_requests")
      .select(SELECT_COLS);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.date_from) q = q.gte("created_at", `${data.date_from}T00:00:00Z`);
    if (data.date_to) q = q.lte("created_at", `${data.date_to}T23:59:59.999Z`);
    q = q.order("created_at", { ascending: false });

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.user_id as string)));
    const profiles = new Map<string, { full_name: string | null; member_no: string | null }>();
    if (ids.length > 0) {
      const { data: profs, error: pErr } = await context.supabase
        .from("profiles")
        .select("id, full_name, member_no")
        .in("id", ids);
      if (pErr) throw new Error(pErr.message);
      for (const p of (profs ?? []) as any[]) {
        profiles.set(p.id, { full_name: p.full_name ?? null, member_no: p.member_no ?? null });
      }
    }

    let mapped = (rows ?? []).map((r: any) => mapRow(r, profiles.get(r.user_id)));
    if (data.search) {
      const s = data.search.toLowerCase();
      mapped = mapped.filter(
        (r) =>
          r.ref.toLowerCase().includes(s) ||
          (r.member_name ?? "").toLowerCase().includes(s) ||
          (r.member_no ?? "").toLowerCase().includes(s) ||
          r.account_label.toLowerCase().includes(s),
      );
    }
    return mapped;
  });

const DecisionSchema = z.object({
  id: z.string().uuid(),
  note: z.string().trim().min(5).max(500),
  step_up_token: z.string().min(16).max(200),
});

/** Fine-grained role check + fresh re-authentication for a withdrawal decision. */
async function requireDecisionAuthority(
  context: any,
  outcome: DecisionOutcome,
  token: string | undefined,
  label: string,
) {
  const roles = await loadRoleSet(context.supabase, context.userId);
  assertAnyRole(roles, FINANCE_ROLES, "finance");
  assertDecisionPermission(roles, "withdrawal", outcome);
  const { assertStepUp } = await import("@/lib/step-up.server");
  const proof = await assertStepUp(context.userId, token, label);
  return { actorRole: pickActorRole(roles), proof };
}

async function requireFinance(context: any) {
  const roles = await loadRoleSet(context.supabase, context.userId);
  assertAnyRole(roles, FINANCE_ROLES, "finance");
  return pickActorRole(roles);
}

export const adminApproveWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DecisionSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { actorRole, proof } = await requireDecisionAuthority(
      context,
      "approved",
      data.step_up_token,
      "approve withdrawal",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("approve_savings_withdrawal", {
      _id: data.id,
      _note: data.note,
      _actor_id: context.userId,
    });
    if (error) throw new Error(error.message);
    const r = (Array.isArray(row) ? row[0] : row) as any;
    await writeAudit({
      actor_id: context.userId,
      actor_role: actorRole,
      action: "withdrawal.approved",
      target: data.id,
      meta: { ref: r?.ref, amount: r?.amount, note: data.note, step_up: { method: proof.method, session_id: proof.id } },
    });
    return { ok: true };
  });

export const adminRejectWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DecisionSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { actorRole, proof } = await requireDecisionAuthority(
      context,
      "rejected",
      data.step_up_token,
      "reject withdrawal",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("reject_savings_withdrawal", {
      _id: data.id,
      _reason: data.note,
      _actor_id: context.userId,
    });
    if (error) throw new Error(error.message);
    const r = (Array.isArray(row) ? row[0] : row) as any;
    await writeAudit({
      actor_id: context.userId,
      actor_role: actorRole,
      action: "withdrawal.rejected",
      target: data.id,
      meta: { ref: r?.ref, amount: r?.amount, reason: data.note, step_up: { method: proof.method, session_id: proof.id } },
    });
    return { ok: true };
  });

export const adminPayWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), step_up_token: z.string().min(16).max(200) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ txn_id: string | null }> => {
    const { actorRole, proof } = await requireDecisionAuthority(
      context,
      "paid",
      data.step_up_token,
      "post withdrawal payout",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("pay_savings_withdrawal", {
      _id: data.id,
      _actor_id: context.userId,
    });
    if (error) throw new Error(error.message);
    const r = (Array.isArray(row) ? row[0] : row) as any;
    await writeAudit({
      actor_id: context.userId,
      actor_role: actorRole,
      action: "withdrawal.paid",
      target: data.id,
      meta: { ref: r?.ref, amount: r?.amount, txn_id: r?.txn_id, step_up: { method: proof.method, session_id: proof.id } },
    });
    return { txn_id: r?.txn_id ?? null };
  });

export const adminCancelWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DecisionSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { actorRole, proof } = await requireDecisionAuthority(
      context,
      "cancelled",
      data.step_up_token,
      "cancel withdrawal",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("admin_cancel_savings_withdrawal", {
      _id: data.id,
      _reason: data.note,
      _actor_id: context.userId,
      _actor_role: actorRole,
    });
    if (error) throw new Error(error.message);
    const r = (Array.isArray(row) ? row[0] : row) as any;
    await writeAudit({
      actor_id: context.userId,
      actor_role: actorRole,
      action: "withdrawal.cancelled",
      target: data.id,
      meta: {
        ref: r?.ref,
        amount: r?.amount,
        reason: data.note,
        cancelled_by_role: actorRole,
        step_up: { method: proof.method, session_id: proof.id },
      },
    });
    return { ok: true };
  });

export type BulkCancelResult = {
  ok: string[];
  failed: { id: string; error: string }[];
};

const MIN_BULK_REASON = 5;

const BulkCancelSchema = z
  .object({
    items: z
      .array(
        z.object({
          id: z.string().uuid(),
          // Every request carries its own reason — no shared/blank fallback.
          note: z
            .string({ message: "Each selected request needs its own cancellation reason." })
            .trim()
            .min(MIN_BULK_REASON, {
              message: `Each cancellation reason must be at least ${MIN_BULK_REASON} characters.`,
            })
            .max(500),
        }),
      )
      .min(1)
      .max(50),
    step_up_token: z.string().min(16).max(200),
  })
  .superRefine((val, ctx) => {
    const ids = new Set<string>();
    for (const item of val.items) {
      if (ids.has(item.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["items"],
          message: "Duplicate requests in the batch — each request may appear only once.",
        });
        return;
      }
      ids.add(item.id);
    }
  });

/** Cancel many pending/approved withdrawal requests with one step-up proof and per-request reasons. */
export const adminBulkCancelWithdrawals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BulkCancelSchema.parse(d))
  .handler(async ({ data, context }): Promise<BulkCancelResult> => {
    // Atomic gate: if any single reason is missing or too short the whole batch
    // is rejected before a single cancellation is attempted.
    const invalid = data.items.filter((i) => i.note.trim().length < MIN_BULK_REASON).map((i) => i.id);
    if (invalid.length > 0) {
      throw new Error(
        `Batch blocked: ${invalid.length} request(s) are missing a cancellation reason of at least ${MIN_BULK_REASON} characters.`,
      );
    }

    const { actorRole, proof } = await requireDecisionAuthority(
      context,
      "cancelled",
      data.step_up_token,
      "bulk cancel withdrawals",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result: BulkCancelResult = { ok: [], failed: [] };

    for (const item of data.items) {
      const { data: row, error } = await supabaseAdmin.rpc("admin_cancel_savings_withdrawal", {
        _id: item.id,
        _reason: item.note,
        _actor_id: context.userId,
        _actor_role: actorRole,
      });
      if (error) {
        result.failed.push({ id: item.id, error: error.message });
        continue;
      }
      const r = (Array.isArray(row) ? row[0] : row) as any;
      result.ok.push(item.id);
      await writeAudit({
        actor_id: context.userId,
        actor_role: actorRole,
        action: "withdrawal.cancelled",
        target: item.id,
        meta: {
          ref: r?.ref,
          amount: r?.amount,
          reason: item.note,
          cancelled_by_role: actorRole,
          bulk: true,
          bulk_size: data.items.length,
          step_up: { method: proof.method, session_id: proof.id },
        },
      });
    }

    if (result.ok.length > 0) {
      await writeAudit({
        actor_id: context.userId,
        actor_role: actorRole,
        action: "withdrawal.bulk_cancelled",
        target: `${result.ok.length} requests`,
        meta: {
          cancelled: result.ok,
          failed: result.failed,
          step_up: { method: proof.method, session_id: proof.id },
        },
      });
    }

    return result;
  });

const SettingsSchema = z.object({
  min_amount: z.number().min(0).max(10_000_000),
  max_amount: z.number().positive().max(10_000_000),
  daily_limit: z.number().positive().max(50_000_000),
  require_dual_control: z.boolean(),
});

export const adminUpdateWithdrawalSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SettingsSchema.parse(d))
  .handler(async ({ data, context }): Promise<WithdrawalSettings> => {
    const actorRole = await requireFinance(context);
    if (data.min_amount >= data.max_amount) throw new Error("min_must_be_below_max");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("savings_withdrawal_settings")
      .update({ ...data, updated_at: new Date().toISOString(), updated_by: context.userId } as never)
      .eq("id", 1);
    if (error) throw new Error(error.message);
    await writeAudit({
      actor_id: context.userId,
      actor_role: actorRole,
      action: "withdrawal.settings_updated",
      target: "savings_withdrawal_settings",
      meta: data,
    });
    return data;
  });
