/**
 * Payment server functions — the only entry points the UI may use.
 * Thin wrappers: all logic lives in payments.server.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit } from "@/lib/audit-log";
import { ghPhoneOptionalSchema } from "@/lib/gh-phone";
import { PAYMENT_PURPOSES, RAILS } from "@/lib/payment-rails";
import type {
  CreateIntentResult,
  IntentRow,
  ReceiptRow,
  RefundRow,
  ReconciliationSummary,
} from "@/lib/payments.server";
import type { RailAvailability } from "@/lib/payment-rails";

export type { IntentRow, ReceiptRow, RefundRow, CreateIntentResult, ReconciliationSummary };

const dateStr = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullish();

function email(claims: unknown): string | null {
  return (claims as { email?: string } | null)?.email ?? null;
}

/** Rail catalogue with per-rail provider readiness. Any signed-in user. */
export const getPaymentRails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<RailAvailability[]> => {
    const { loadRailAvailability } = await import("@/lib/payments.server");
    return loadRailAvailability();
  });

/** Start a payment. Members pay for themselves; staff may pay on a member's behalf. */
export const createPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        rail: z.enum(RAILS),
        purpose: z.enum(PAYMENT_PURPOSES),
        amount: z.number().positive().max(10_000_000),
        payer_phone: ghPhoneOptionalSchema,
        member_id: z.string().uuid().nullish(),
        note: z.string().trim().max(300).nullish(),
        target_id: z.string().trim().max(100).nullish(),
        client_key: z.string().trim().max(80).nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<CreateIntentResult> => {
    const { createIntent } = await import("@/lib/payments.server");
    const { hasCapability } = await import("@/lib/capability-guard.server");

    let memberId = context.userId;
    if (data.member_id && data.member_id !== context.userId) {
      if (!(await hasCapability(context.supabase, "payments", "create"))) {
        throw new Error("Forbidden: payments.create permission required to pay for another member");
      }
      memberId = data.member_id;
    }

    const result = await createIntent({
      rail: data.rail,
      purpose: data.purpose,
      amountMinor: Math.round(data.amount * 100),
      memberId,
      actorId: context.userId,
      payerPhone: data.payer_phone ?? null,
      note: data.note ?? null,
      targetId: data.target_id ?? null,
      clientKey: data.client_key ?? null,
    });

    await writeAudit({
      actor_id: context.userId,
      actor_email: email(context.claims),
      action: result.duplicate ? "payments.intent.duplicate_suppressed" : "payments.intent.created",
      target: result.intent.reference,
      meta: {
        rail: data.rail,
        purpose: data.purpose,
        amount_minor: result.intent.amount_minor,
        status: result.intent.status,
        member_id: memberId,
        network: result.intent.payer_network,
      },
    });
    return result;
  });

/** My payments (member scope). */
export const getMyPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
        status: z.string().trim().max(40).nullish(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { listIntents, listReceipts } = await import("@/lib/payments.server");
    const { rows, total } = await listIntents({
      page: data.page,
      pageSize: data.pageSize,
      status: data.status ?? null,
      memberId: context.userId,
    });
    const receipts = await listReceipts(rows.map((r) => r.id));
    return { rows, total, receipts };
  });

/** One payment + receipt + refunds. Member sees only their own. */
export const getPaymentDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ reference: z.string().trim().min(4).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    const { getIntentByReference, listReceipts, listRefunds } = await import("@/lib/payments.server");
    const { hasCapability } = await import("@/lib/capability-guard.server");
    const intent = await getIntentByReference(data.reference);
    if (!intent) throw new Error("Payment not found");
    const staff = await hasCapability(context.supabase, "payments", "view");
    if (!staff && intent.member_id !== context.userId) throw new Error("Payment not found");
    const [receipts, refunds] = await Promise.all([listReceipts([intent.id]), listRefunds([intent.id])]);
    return { intent, receipt: receipts[0] ?? null, refunds, staff };
  });

/** Cancel an open payment. Owner or payments.manage. */
export const cancelPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        reference: z.string().trim().min(4).max(60),
        reason: z.string().trim().min(5, "Give a reason (min 5 chars)").max(300),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<IntentRow> => {
    const { cancelIntent } = await import("@/lib/payments.server");
    const { hasCapability } = await import("@/lib/capability-guard.server");
    const staff = await hasCapability(context.supabase, "payments", "manage");
    const intent = await cancelIntent({
      reference: data.reference,
      actorId: context.userId,
      reason: data.reason,
      memberScope: staff ? null : context.userId,
    });
    await writeAudit({
      actor_id: context.userId,
      actor_email: email(context.claims),
      action: "payments.intent.cancelled",
      target: intent.reference,
      meta: { reason: data.reason, by_staff: staff },
    });
    return intent;
  });

/* ----------------------------- staff surfaces ----------------------------- */

export const getAdminPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(25),
        status: z.string().trim().max(40).nullish(),
        rail: z.string().trim().max(40).nullish(),
        member_id: z.string().uuid().nullish(),
        date_from: dateStr,
        date_to: dateStr,
        search: z.string().trim().max(80).nullish(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertCapability, hasCapability } = await import("@/lib/capability-guard.server");
    await assertCapability(context.supabase, "payments", "view");
    const { listIntents, listReceipts, listRefunds } = await import("@/lib/payments.server");
    const { rows, total } = await listIntents({
      page: data.page,
      pageSize: data.pageSize,
      status: data.status ?? null,
      rail: data.rail ?? null,
      memberId: data.member_id ?? null,
      dateFrom: data.date_from ?? null,
      dateTo: data.date_to ?? null,
      search: data.search ?? null,
    });
    const ids = rows.map((r) => r.id);
    const [receipts, refunds, canManage] = await Promise.all([
      listReceipts(ids),
      listRefunds(ids),
      hasCapability(context.supabase, "payments", "manage"),
    ]);
    return { rows, total, receipts, refunds, can_manage: canManage };
  });

export const getPaymentReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ date_from: dateStr, date_to: dateStr }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertCapability } = await import("@/lib/capability-guard.server");
    await assertCapability(context.supabase, "payments", "view");
    const { buildReconciliation } = await import("@/lib/payments.server");
    const { summary, rows, receipts } = await buildReconciliation(data.date_from ?? null, data.date_to ?? null);
    return { summary, rows, receipts };
  });

/** Confirm a cash or bank-transfer payment. payments.manage only, note mandatory. */
export const confirmManualPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        reference: z.string().trim().min(4).max(60),
        note: z.string().trim().min(10, "Describe how the funds were received (min 10 chars)").max(400),
        provider_reference: z.string().trim().max(120).nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertCapability } = await import("@/lib/capability-guard.server");
    await assertCapability(context.supabase, "payments", "manage");
    const { settleManually } = await import("@/lib/payments.server");
    const { intent, receipt } = await settleManually({
      reference: data.reference,
      actorId: context.userId,
      note: data.note,
      providerReference: data.provider_reference ?? null,
    });
    await writeAudit({
      actor_id: context.userId,
      actor_email: email(context.claims),
      action: "payments.intent.manually_settled",
      target: intent.reference,
      meta: {
        rail: intent.rail,
        amount_minor: intent.amount_minor,
        receipt_no: receipt.receipt_no,
        note: data.note,
      },
    });
    return { intent, receipt };
  });

/** Record a refund request for a settled payment. Executed once a provider supports it. */
export const requestPaymentRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        reference: z.string().trim().min(4).max(60),
        amount: z.number().positive().max(10_000_000),
        reason: z.string().trim().min(10, "Explain the refund (min 10 chars)").max(400),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<RefundRow> => {
    const { assertCapability } = await import("@/lib/capability-guard.server");
    await assertCapability(context.supabase, "payments", "manage");
    const { requestRefundRow } = await import("@/lib/payments.server");
    const refund = await requestRefundRow({
      reference: data.reference,
      actorId: context.userId,
      amountMinor: Math.round(data.amount * 100),
      reason: data.reason,
    });
    await writeAudit({
      actor_id: context.userId,
      actor_email: email(context.claims),
      action: "payments.refund.requested",
      target: data.reference,
      meta: { amount_minor: refund.amount_minor, reason: data.reason },
    });
    return refund;
  });
