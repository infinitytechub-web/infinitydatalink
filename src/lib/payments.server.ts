/**
 * Server-only payment service.
 *
 * Design rules enforced here:
 *  - Nothing is ever marked `succeeded` locally. Provider rails only settle via
 *    the signature-verified webhook processor; cash/bank rails settle only when
 *    a permissioned officer confirms them, and that confirmation is audited.
 *  - No card PAN / CVV / PIN is accepted, transported or stored. Card rails hand
 *    off to the provider's hosted checkout and we keep only its reference.
 *  - Every intent carries an idempotency key so a double submit returns the
 *    existing intent instead of charging twice.
 */
import { createHash, randomBytes } from "crypto";
import type { Json } from "@/integrations/supabase/types";
import { checkGhPhone } from "@/lib/gh-phone";
import {
  RAIL_SPECS,
  railSpec,
  type IntentStatus,
  type PaymentPurpose,
  type Rail,
  type RailAvailability,
} from "@/lib/payment-rails";
import { templateFor } from "@/lib/payment-providers";

export type IntentRow = {
  id: string;
  reference: string;
  rail: string;
  provider_code: string;
  member_id: string | null;
  purpose: string;
  amount_minor: number;
  currency: string;
  status: string;
  payer_phone: string | null;
  payer_network: string | null;
  provider_reference: string | null;
  failure_reason: string | null;
  cancel_reason: string | null;
  settled_at: string | null;
  settled_by: string | null;
  metadata: Record<string, Json>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ReceiptRow = {
  id: string;
  intent_id: string;
  receipt_no: string;
  amount_minor: number;
  currency: string;
  issued_at: string;
};

export type RefundRow = {
  id: string;
  intent_id: string;
  amount_minor: number;
  currency: string;
  reason: string;
  status: string;
  requested_by: string | null;
  approved_by: string | null;
  decision_note: string | null;
  created_at: string;
};

const INTENT_COLUMNS =
  "id, reference, rail, provider_code, member_id, purpose, amount_minor, currency, status, payer_phone, payer_network, provider_reference, failure_reason, cancel_reason, settled_at, settled_by, metadata, created_by, created_at, updated_at";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/** Unique, human-quotable transaction reference: IW-20260830-K3F9QT4B */
export function generateReference(now = new Date()): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = randomBytes(6)
    .toString("base64")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 8);
  return `IW-${day}-${rand.padEnd(8, "0")}`;
}

/** Stable key so a repeated submit of the same request never double-charges. */
export function idempotencyKey(parts: {
  memberId: string | null;
  rail: string;
  purpose: string;
  amountMinor: number;
  clientKey?: string | null;
  windowMs?: number;
}): string {
  const bucket = parts.clientKey
    ? `c:${parts.clientKey}`
    : `t:${Math.floor(Date.now() / (parts.windowMs ?? 120_000))}`;
  return createHash("sha256")
    .update(
      [parts.memberId ?? "anon", parts.rail, parts.purpose, parts.amountMinor, bucket].join("|"),
    )
    .digest("hex")
    .slice(0, 48);
}

/** Rail → provider readiness, computed from configured providers + secrets. */
export async function loadRailAvailability(): Promise<RailAvailability[]> {
  const db = await admin();
  const [{ data }, { data: railRows }] = await Promise.all([
    db.from("payment_providers").select("code, label, mode, enabled, config").order("code"),
    db.from("payment_rail_settings").select("rail, enabled"),
  ]);
  const providers = (data ?? []) as { code: string; mode: string; enabled: boolean }[];
  const railEnabled = new Map(
    ((railRows ?? []) as { rail: string; enabled: boolean }[]).map((r) => [r.rail, r.enabled]),
  );

  return RAIL_SPECS.map((spec) => {
    const railOn = railEnabled.get(spec.code) ?? true;
    const candidates = providers.filter((p) => spec.providerCodes.includes(p.code) && p.enabled);
    const ready = candidates.filter((p) => {
      const tpl = templateFor(p.code);
      return tpl ? Boolean(process.env[tpl.secretEnv]) : false;
    });
    const live = ready.find((p) => p.mode === "live") ?? null;
    const sandbox = ready.find((p) => p.mode === "sandbox") ?? null;
    const chosen = live ?? sandbox ?? candidates[0] ?? null;

    const isLive = Boolean(live) && railOn;
    const isSandbox = Boolean(sandbox) && !isLive && railOn;
    const providerReady = Boolean(live || sandbox);
    const selectable = railOn && (providerReady || spec.manualSettlement);

    let statusLabel: string;
    let note: string;
    if (!railOn) {
      statusLabel = "Disabled";
      note = "An administrator has switched this rail off.";
    } else if (isLive) {
      statusLabel = "Live";
      note = `Processed by ${live!.code}.`;
    } else if (isSandbox) {
      statusLabel = "Sandbox";
      note = `Configured in sandbox mode via ${sandbox!.code}. No real funds move.`;
    } else if (spec.manualSettlement) {
      statusLabel = "Manual";
      note = "Recorded now and confirmed by a finance officer at settlement.";
    } else {
      statusLabel = "Awaiting credentials";
      note = "An administrator must configure a provider and its API credentials.";
    }

    return {
      rail: spec.code,
      label: spec.label,
      kind: spec.kind,
      blurb: spec.blurb,
      network: spec.network ?? null,
      live: isLive,
      sandbox: isSandbox,
      selectable,
      providerCode: chosen?.code ?? null,
      statusLabel,
      note,
    } satisfies RailAvailability;
  });
}

export type CreateIntentInput = {
  rail: Rail;
  purpose: PaymentPurpose;
  amountMinor: number;
  memberId: string | null;
  actorId: string;
  payerPhone?: string | null;
  clientKey?: string | null;
  note?: string | null;
  targetId?: string | null;
};

export type CreateIntentResult = {
  intent: IntentRow;
  duplicate: boolean;
  next_action: "await_provider_prompt" | "await_manual_confirmation" | "provider_not_configured";
  message: string;
};

export async function createIntent(input: CreateIntentInput): Promise<CreateIntentResult> {
  const spec = railSpec(input.rail);
  if (!spec) throw new Error(`Unsupported payment rail: ${input.rail}`);
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error("Amount must be greater than zero");
  }

  let phone: string | null = null;
  let network: string | null = null;
  if (spec.kind === "mobile_money") {
    const check = checkGhPhone(input.payerPhone ?? "");
    if (!check.valid) throw new Error(`Mobile money number invalid: ${check.error}`);
    if (spec.network && check.network !== spec.network) {
      throw new Error(
        `${check.networkLabel} number cannot be used on the ${spec.label} rail — pick the matching rail.`,
      );
    }
    phone = check.phone;
    network = check.network;
  }

  const availability = (await loadRailAvailability()).find((r) => r.rail === input.rail)!;
  if (!availability.selectable) {
    throw new Error(`${spec.label} is not available yet — no provider is configured.`);
  }

  const providerReady = availability.live || availability.sandbox;
  const status: IntentStatus = providerReady
    ? "pending"
    : spec.manualSettlement
      ? "pending"
      : "requires_configuration";

  const key = idempotencyKey({
    memberId: input.memberId,
    rail: input.rail,
    purpose: input.purpose,
    amountMinor: input.amountMinor,
    clientKey: input.clientKey ?? null,
  });

  const db = await admin();
  const { data: existing } = await db
    .from("payment_intents")
    .select(INTENT_COLUMNS)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (existing) {
    return {
      intent: existing as IntentRow,
      duplicate: true,
      next_action: providerReady ? "await_provider_prompt" : "await_manual_confirmation",
      message: "This payment was already submitted — showing the existing request.",
    };
  }

  const reference = generateReference();
  const { data, error } = await db
    .from("payment_intents")
    .insert({
      reference,
      rail: input.rail,
      provider_code:
        availability.providerCode ?? (spec.kind === "cash" ? "cash_desk" : "unassigned"),
      member_id: input.memberId,
      purpose: input.purpose,
      amount_minor: input.amountMinor,
      currency: "GHS",
      status,
      payer_phone: phone,
      payer_network: network,
      idempotency_key: key,
      metadata: {
        note: input.note ?? null,
        target_id: input.targetId ?? null,
        rail_kind: spec.kind,
        provider_mode: availability.live
          ? "live"
          : availability.sandbox
            ? "sandbox"
            : "unconfigured",
      },
      created_by: input.actorId,
    })
    .select(INTENT_COLUMNS)
    .single();
  if (error) throw new Error(error.message);

  const next_action: CreateIntentResult["next_action"] =
    status === "requires_configuration"
      ? "provider_not_configured"
      : providerReady && !spec.manualSettlement
        ? "await_provider_prompt"
        : "await_manual_confirmation";

  const message =
    next_action === "provider_not_configured"
      ? `Recorded as ${reference}. ${spec.label} has no provider credentials yet, so no charge was attempted.`
      : next_action === "await_provider_prompt"
        ? `Recorded as ${reference}. Awaiting the provider's confirmation callback — the status updates automatically.`
        : `Recorded as ${reference}. A finance officer will confirm receipt to complete it.`;

  return { intent: data as IntentRow, duplicate: false, next_action, message };
}

export type PaymentListFilters = {
  page: number;
  pageSize: number;
  status?: string | null;
  rail?: string | null;
  memberId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  search?: string | null;
};

export async function listIntents(
  filters: PaymentListFilters,
): Promise<{ rows: IntentRow[]; total: number }> {
  const db = await admin();
  let q = db.from("payment_intents").select(INTENT_COLUMNS, { count: "exact" });
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.rail) q = q.eq("rail", filters.rail);
  if (filters.memberId) q = q.eq("member_id", filters.memberId);
  if (filters.dateFrom) q = q.gte("created_at", `${filters.dateFrom}T00:00:00Z`);
  if (filters.dateTo) q = q.lte("created_at", `${filters.dateTo}T23:59:59Z`);
  if (filters.search) {
    // Escape PostgREST filter metacharacters before interpolating.
    const s = filters.search.replace(/[,()*"\\]/g, "");
    if (s)
      q = q.or(`reference.ilike.%${s}%,provider_reference.ilike.%${s}%,payer_phone.ilike.%${s}%`);
  }
  const from = (filters.page - 1) * filters.pageSize;
  const { data, count, error } = await q
    .order("created_at", { ascending: false })
    .range(from, from + filters.pageSize - 1);
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as IntentRow[], total: count ?? 0 };
}

export async function getIntentByReference(reference: string): Promise<IntentRow | null> {
  const db = await admin();
  const { data } = await db
    .from("payment_intents")
    .select(INTENT_COLUMNS)
    .eq("reference", reference)
    .maybeSingle();
  return (data ?? null) as IntentRow | null;
}

export async function listReceipts(intentIds: string[]): Promise<ReceiptRow[]> {
  if (intentIds.length === 0) return [];
  const db = await admin();
  const { data } = await db
    .from("payment_receipts")
    .select("id, intent_id, receipt_no, amount_minor, currency, issued_at")
    .in("intent_id", intentIds);
  return (data ?? []) as ReceiptRow[];
}

export async function listRefunds(intentIds: string[]): Promise<RefundRow[]> {
  if (intentIds.length === 0) return [];
  const db = await admin();
  const { data } = await db
    .from("payment_refunds")
    .select(
      "id, intent_id, amount_minor, currency, reason, status, requested_by, approved_by, decision_note, created_at",
    )
    .in("intent_id", intentIds)
    .order("created_at", { ascending: false });
  return (data ?? []) as RefundRow[];
}

/** Issues (or returns) the receipt for a settled intent. */
export async function issueReceipt(intent: IntentRow, actorId: string | null): Promise<ReceiptRow> {
  const db = await admin();
  const { data: existing } = await db
    .from("payment_receipts")
    .select("id, intent_id, receipt_no, amount_minor, currency, issued_at")
    .eq("intent_id", intent.id)
    .maybeSingle();
  if (existing) return existing as ReceiptRow;

  const { data: no, error: seqErr } = await db.rpc("next_payment_receipt_no");
  if (seqErr) throw new Error(seqErr.message);
  const { data, error } = await db
    .from("payment_receipts")
    .insert({
      intent_id: intent.id,
      receipt_no: no as string,
      amount_minor: intent.amount_minor,
      currency: intent.currency,
      issued_by: actorId,
    })
    .select("id, intent_id, receipt_no, amount_minor, currency, issued_at")
    .single();
  if (error) throw new Error(error.message);
  return data as ReceiptRow;
}

/** Manual settlement for cash / bank rails only. */
export async function settleManually(args: {
  reference: string;
  actorId: string;
  note: string;
  providerReference?: string | null;
}): Promise<{ intent: IntentRow; receipt: ReceiptRow }> {
  const intent = await getIntentByReference(args.reference);
  if (!intent) throw new Error("Payment not found");
  const spec = railSpec(intent.rail);
  if (!spec?.manualSettlement) {
    throw new Error(
      `${spec?.label ?? intent.rail} settles only through a verified provider callback — it cannot be confirmed by hand.`,
    );
  }
  if (intent.status === "succeeded") throw new Error("Payment is already settled");
  if (!["pending", "processing"].includes(intent.status)) {
    throw new Error(`Cannot settle a ${intent.status} payment`);
  }

  const db = await admin();
  const { data, error } = await db
    .from("payment_intents")
    .update({
      status: "succeeded",
      settled_at: new Date().toISOString(),
      settled_by: args.actorId,
      provider_reference: args.providerReference?.trim() || intent.provider_reference,
      metadata: { ...(intent.metadata ?? {}), settlement_note: args.note },
      updated_at: new Date().toISOString(),
    })
    .eq("id", intent.id)
    .eq("status", intent.status)
    .select(INTENT_COLUMNS)
    .single();
  if (error) throw new Error(error.message);

  const settled = data as IntentRow;
  const receipt = await issueReceipt(settled, args.actorId);
  return { intent: settled, receipt };
}

export async function cancelIntent(args: {
  reference: string;
  actorId: string;
  reason: string;
  memberScope?: string | null;
}): Promise<IntentRow> {
  const intent = await getIntentByReference(args.reference);
  if (!intent) throw new Error("Payment not found");
  if (args.memberScope && intent.member_id !== args.memberScope)
    throw new Error("Payment not found");
  if (!["pending", "processing", "requires_configuration"].includes(intent.status)) {
    throw new Error(`Only an open payment can be cancelled (this one is ${intent.status})`);
  }
  const db = await admin();
  const { data, error } = await db
    .from("payment_intents")
    .update({
      status: "cancelled",
      cancel_reason: args.reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", intent.id)
    .eq("status", intent.status)
    .select(INTENT_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as IntentRow;
}

export async function requestRefundRow(args: {
  reference: string;
  actorId: string;
  amountMinor: number;
  reason: string;
}): Promise<RefundRow> {
  const intent = await getIntentByReference(args.reference);
  if (!intent) throw new Error("Payment not found");
  if (intent.status !== "succeeded") throw new Error("Only a settled payment can be refunded");
  if (args.amountMinor > intent.amount_minor) throw new Error("Refund exceeds the amount paid");

  const db = await admin();
  const { data, error } = await db
    .from("payment_refunds")
    .insert({
      intent_id: intent.id,
      amount_minor: args.amountMinor,
      currency: intent.currency,
      reason: args.reason,
      status: "requested",
      requested_by: args.actorId,
    })
    .select(
      "id, intent_id, amount_minor, currency, reason, status, requested_by, approved_by, decision_note, created_at",
    )
    .single();
  if (error) throw new Error(error.message);
  return data as RefundRow;
}

export type ReconciliationSummary = {
  provider_confirmed: number;
  awaiting_provider: number;
  manual_confirmed: number;
  unconfigured: number;
  failed: number;
  mismatches: { reference: string; issue: string }[];
};

/** Pending vs cleared, and rows whose state does not add up. */
export async function buildReconciliation(dateFrom?: string | null, dateTo?: string | null) {
  const { rows } = await listIntents({ page: 1, pageSize: 500, dateFrom, dateTo });
  const receipts = await listReceipts(rows.map((r) => r.id));
  const receiptByIntent = new Map(receipts.map((r) => [r.intent_id, r]));

  const summary: ReconciliationSummary = {
    provider_confirmed: 0,
    awaiting_provider: 0,
    manual_confirmed: 0,
    unconfigured: 0,
    failed: 0,
    mismatches: [],
  };

  for (const row of rows) {
    const manual = railSpec(row.rail)?.manualSettlement ?? false;
    if (row.status === "succeeded") {
      if (manual) summary.manual_confirmed += 1;
      else summary.provider_confirmed += 1;
      if (!receiptByIntent.has(row.id)) {
        summary.mismatches.push({ reference: row.reference, issue: "Settled without a receipt" });
      }
      if (!manual && !row.provider_reference) {
        summary.mismatches.push({
          reference: row.reference,
          issue: "Settled without a provider reference",
        });
      }
    } else if (row.status === "requires_configuration") {
      summary.unconfigured += 1;
    } else if (row.status === "failed" || row.status === "reversed") {
      summary.failed += 1;
    } else if (row.status === "pending" || row.status === "processing") {
      summary.awaiting_provider += 1;
      const ageHours = (Date.now() - new Date(row.created_at).getTime()) / 3_600_000;
      if (ageHours > 24) {
        summary.mismatches.push({
          reference: row.reference,
          issue: `Open for ${Math.floor(ageHours)}h with no provider callback`,
        });
      }
    }
    if (receiptByIntent.has(row.id) && row.status !== "succeeded") {
      summary.mismatches.push({
        reference: row.reference,
        issue: `Receipt exists but status is ${row.status}`,
      });
    }
  }

  return { summary, rows, receipts };
}
