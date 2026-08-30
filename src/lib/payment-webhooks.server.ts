/**
 * Server-only payment webhook processing.
 *
 * Security model (in order of enforcement):
 *  1. Provider must exist, be enabled, and have a webhook signing secret in the
 *     environment (never a database column).
 *  2. The signature is verified with a constant-time compare over the exact raw
 *     body — before the body is parsed and before any state changes.
 *  3. Replay protection, three layers:
 *       a. timestamp freshness — a signed/declared timestamp older than
 *          MAX_SKEW_MS (or in the future) is refused;
 *       b. event-id dedupe — unique (provider_code, event_id);
 *       c. body-hash dedupe — unique (provider_code, body_hash) for providers
 *          that send no event id, so an identical replay cannot be reprocessed.
 *  4. State-machine guard — a callback may only move an intent along an allowed
 *     transition, so a replayed/late "succeeded" cannot resurrect a reversed or
 *     cancelled payment, and only the owning provider can touch the intent.
 *  5. Amount/currency echo check — a payload that disagrees with the recorded
 *     intent is journalled and rejected instead of applied.
 *
 * Every callback, accepted or not, is journalled in `payment_webhook_events`.
 */
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { normalizeIntentStatus, templateFor } from "@/lib/payment-providers";

export type WebhookOutcome = {
  status: number;
  body: Record<string, unknown>;
};

/** Maximum accepted age of a signed timestamp (5 minutes, either direction). */
export const MAX_SKEW_MS = 5 * 60_000;

/** Headers providers use to carry the signed timestamp. */
const TIMESTAMP_HEADERS = [
  "x-webhook-timestamp",
  "x-hubtel-timestamp",
  "x-momo-timestamp",
  "verif-timestamp",
  "timestamp",
];

/** Statuses a provider callback may move an intent into, keyed by current status. */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["pending", "processing", "succeeded", "failed"],
  processing: ["processing", "succeeded", "failed"],
  requires_configuration: ["pending", "processing", "succeeded", "failed"],
  succeeded: ["reversed"],
  failed: ["succeeded", "reversed"],
  reversed: [],
  cancelled: [],
};

function digestEqual(a: string, b: string): boolean {
  // Hash both sides first: timingSafeEqual throws on length mismatch, and the
  // raw length itself would leak through timing.
  const x = createHash("sha256").update(a, "utf8").digest();
  const y = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(x, y);
}

export function signWebhookBody(
  secret: string,
  rawBody: string,
  algo: "sha256" | "sha512",
): string {
  return createHmac(algo, secret).update(rawBody, "utf8").digest("hex");
}

/** Signature over `${timestamp}.${rawBody}` — the Stripe-style signed payload. */
export function signWebhookPayload(
  secret: string,
  rawBody: string,
  algo: "sha256" | "sha512",
  timestamp: string,
): string {
  return createHmac(algo, secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
}

export function hashBody(providerCode: string, rawBody: string): string {
  return createHash("sha256").update(`${providerCode}:${rawBody}`, "utf8").digest("hex");
}

/**
 * Splits a `t=...,v1=...` style header into its parts. Plain hex/base64
 * signatures come back as `{ signature }` with no timestamp.
 */
export function parseSignatureHeader(raw: string): { signature: string; timestamp: string | null } {
  const value = raw.trim();
  if (!value.includes("=")) return { signature: value, timestamp: null };
  let timestamp: string | null = null;
  let signature = "";
  for (const part of value.split(",")) {
    const [k, v] = part.split("=", 2).map((s) => s?.trim() ?? "");
    if (!v) continue;
    if (k === "t") timestamp = v;
    else if (k === "v1" || k === "s" || k === "sha256" || k === "sha512") signature = v;
  }
  return { signature: signature || value, timestamp };
}

/** Freshness verdict for a declared timestamp (seconds or ms epoch, or ISO). */
export function checkTimestampFreshness(
  raw: string | null | undefined,
  now = Date.now(),
): { ok: true; ms: number | null } | { ok: false; reason: string } {
  if (raw == null || raw === "") return { ok: true, ms: null };
  let ms: number;
  if (/^\d+$/.test(String(raw))) {
    const n = Number(raw);
    ms = String(raw).length <= 10 ? n * 1000 : n;
  } else {
    ms = Date.parse(String(raw));
  }
  if (!Number.isFinite(ms)) return { ok: false, reason: "unparsable_timestamp" };
  const skew = now - ms;
  if (skew > MAX_SKEW_MS) return { ok: false, reason: "timestamp_too_old" };
  if (skew < -MAX_SKEW_MS) return { ok: false, reason: "timestamp_in_future" };
  return { ok: true, ms };
}

export function transitionAllowed(current: string, next: string): boolean {
  return (ALLOWED_TRANSITIONS[current] ?? []).includes(next);
}

type ProcessArgs = {
  providerCode: string;
  rawBody: string;
  signature: string | null;
  /** Extra request headers (timestamp lookups). Lower-cased keys. */
  headers?: Record<string, string | null | undefined>;
  /** Readiness self-test: skips signature comparison but journals the event. */
  simulate?: boolean;
};

export async function processPaymentWebhook(args: ProcessArgs): Promise<WebhookOutcome> {
  const template = templateFor(args.providerCode);
  if (!template) return { status: 404, body: { error: "unknown_provider" } };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: provider } = await supabaseAdmin
    .from("payment_providers")
    .select("code, enabled, mode, secret_ref, webhook_path")
    .eq("code", args.providerCode)
    .maybeSingle();

  if (!provider) return { status: 404, body: { error: "provider_not_configured" } };
  if (!provider.enabled) return { status: 409, body: { error: "provider_disabled" } };

  const secret = process.env[template.webhookSecretEnv];
  if (!secret) return { status: 503, body: { error: "webhook_secret_missing" } };

  const headers = args.headers ?? {};
  const parsed = args.signature ? parseSignatureHeader(args.signature) : null;
  const headerTs =
    parsed?.timestamp ??
    TIMESTAMP_HEADERS.map((h) => headers[h]).find((v) => v != null && v !== "") ??
    null;

  // 3a. Freshness first — refuse a stale capture before doing any work.
  const fresh = checkTimestampFreshness(headerTs);
  if (!fresh.ok && !args.simulate) {
    return { status: 401, body: { error: fresh.reason } };
  }

  let verified = false;
  if (args.simulate) {
    verified = true;
  } else {
    if (!parsed?.signature) return { status: 401, body: { error: "missing_signature" } };
    const candidates = [signWebhookBody(secret, args.rawBody, template.signatureAlgo)];
    if (headerTs) {
      candidates.push(
        signWebhookPayload(secret, args.rawBody, template.signatureAlgo, String(headerTs)),
      );
    }
    verified = candidates.some((expected) => digestEqual(parsed.signature, expected));
    if (!verified) return { status: 401, body: { error: "invalid_signature" } };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(args.rawBody) as Record<string, unknown>;
  } catch {
    return { status: 400, body: { error: "invalid_json" } };
  }

  const inner = (payload["data"] ?? payload) as Record<string, unknown>;
  const eventId =
    (payload["id"] as string | undefined) ??
    (payload["event_id"] as string | undefined) ??
    (inner["id"] as string | undefined) ??
    null;
  const eventType =
    (payload["event"] as string | undefined) ?? (payload["type"] as string | undefined) ?? null;
  const reference =
    (inner["reference"] as string | undefined) ?? (inner["tx_ref"] as string | undefined) ?? null;
  const nextStatus = normalizeIntentStatus((inner["status"] as string | undefined) ?? eventType);
  const bodyHash = hashBody(args.providerCode, args.rawBody);

  // A timestamp inside the signed body is also honoured (providers that sign
  // the timestamp into the payload rather than a header).
  if (!headerTs && !args.simulate) {
    const bodyTs =
      (payload["timestamp"] as string | undefined) ?? (inner["timestamp"] as string | undefined);
    const bodyFresh = checkTimestampFreshness(bodyTs ?? null);
    if (!bodyFresh.ok) return { status: 401, body: { error: bodyFresh.reason } };
  }

  // 3b + 3c. Journal insert doubles as the replay lock.
  const { data: event, error: eventErr } = await supabaseAdmin
    .from("payment_webhook_events")
    .insert({
      provider_code: args.providerCode,
      event_id: eventId ? String(eventId) : null,
      event_type: eventType,
      signature_verified: verified,
      body_hash: bodyHash,
      payload: payload as never,
    } as never)
    .select("id")
    .maybeSingle();

  // Duplicate event_id / body hash → already processed; acknowledge so the
  // provider stops retrying but do NOT re-apply the state change.
  if (eventErr) {
    if (eventErr.code === "23505") return { status: 200, body: { ok: true, duplicate: true } };
    return { status: 500, body: { error: eventErr.message } };
  }

  let applied: string | null = null;
  let failure: string | null = null;

  if (!reference) {
    failure = "no_reference_in_payload";
  } else {
    const { data: intent } = await supabaseAdmin
      .from("payment_intents")
      .select("id, status, amount_minor, currency, provider_code")
      .eq("reference", reference)
      .maybeSingle();

    if (!intent) {
      failure = "unknown_reference";
    } else if (intent.provider_code !== args.providerCode) {
      // 4. Another provider's callback must never touch this intent.
      failure = "provider_mismatch";
    } else if (!transitionAllowed(intent.status, nextStatus)) {
      failure = `transition_not_allowed:${intent.status}->${nextStatus}`;
    } else {
      // 5. Echo check: the provider must agree on what was charged.
      const amount = inner["amount_minor"] ?? inner["amount"];
      const currency = (inner["currency"] as string | undefined) ?? null;
      const amountMismatch =
        amount != null &&
        Number(amount) !== intent.amount_minor &&
        Number(amount) * 100 !== intent.amount_minor;
      const currencyMismatch =
        currency != null && currency.toUpperCase() !== intent.currency.toUpperCase();
      if (amountMismatch || currencyMismatch) {
        failure = "amount_or_currency_mismatch";
      } else {
        const { data: updated, error: updErr } = await supabaseAdmin
          .from("payment_intents")
          .update({
            status: nextStatus,
            provider_reference:
              (inner["provider_reference"] as string | undefined) ?? String(eventId ?? ""),
            failure_reason:
              nextStatus === "failed"
                ? ((inner["gateway_response"] as string | undefined) ?? "declined")
                : null,
            settled_at: nextStatus === "succeeded" ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", intent.id)
          // Optimistic lock: concurrent duplicate deliveries cannot both apply.
          .eq("status", intent.status)
          .select("id")
          .maybeSingle();
        if (updErr) failure = updErr.message;
        else if (!updated) failure = "state_changed_concurrently";
        else applied = nextStatus;
      }
    }
  }

  if (event?.id) {
    await supabaseAdmin
      .from("payment_webhook_events")
      .update({ processed_at: new Date().toISOString(), error: failure })
      .eq("id", event.id);
  }

  return {
    status: failure && !applied ? 202 : 200,
    body: { ok: true, reference, applied, note: failure },
  };
}
