/**
 * Server-only payment webhook processing.
 *
 * Every callback is signature-verified against the provider's webhook signing
 * secret (an environment variable — never a database column) before any state
 * changes, then journalled in `payment_webhook_events` for replay protection
 * and reconciliation.
 */
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { normalizeIntentStatus, templateFor } from "@/lib/payment-providers";

export type WebhookOutcome = {
  status: number;
  body: Record<string, unknown>;
};

function digestEqual(a: string, b: string): boolean {
  // Hash both sides first: timingSafeEqual throws on length mismatch, and the
  // raw length itself would leak through timing.
  const x = createHash("sha256").update(a, "utf8").digest();
  const y = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(x, y);
}

export function signWebhookBody(secret: string, rawBody: string, algo: "sha256" | "sha512"): string {
  return createHmac(algo, secret).update(rawBody, "utf8").digest("hex");
}

type ProcessArgs = {
  providerCode: string;
  rawBody: string;
  signature: string | null;
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

  let verified = false;
  if (args.simulate) {
    verified = true;
  } else {
    if (!args.signature) return { status: 401, body: { error: "missing_signature" } };
    const expected = signWebhookBody(secret, args.rawBody, template.signatureAlgo);
    verified = digestEqual(args.signature.trim(), expected);
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
  const eventType = (payload["event"] as string | undefined) ?? (payload["type"] as string | undefined) ?? null;
  const reference =
    (inner["reference"] as string | undefined) ?? (inner["tx_ref"] as string | undefined) ?? null;
  const nextStatus = normalizeIntentStatus((inner["status"] as string | undefined) ?? eventType);

  const { data: event, error: eventErr } = await supabaseAdmin
    .from("payment_webhook_events")
    .insert({
      provider_code: args.providerCode,
      event_id: eventId ? String(eventId) : null,
      event_type: eventType,
      signature_verified: verified,
      payload: payload as never,
    })
    .select("id")
    .maybeSingle();

  // Duplicate event_id → already processed; acknowledge so the provider stops retrying.
  if (eventErr) {
    if (eventErr.code === "23505") return { status: 200, body: { ok: true, duplicate: true } };
    return { status: 500, body: { error: eventErr.message } };
  }

  let applied: string | null = null;
  let failure: string | null = null;
  if (reference) {
    const { error: updErr } = await supabaseAdmin
      .from("payment_intents")
      .update({
        status: nextStatus,
        provider_reference: (inner["provider_reference"] as string | undefined) ?? String(eventId ?? ""),
        failure_reason: nextStatus === "failed" ? ((inner["gateway_response"] as string | undefined) ?? "declined") : null,
        updated_at: new Date().toISOString(),
      })
      .eq("reference", reference)
      .eq("provider_code", args.providerCode);
    if (updErr) failure = updErr.message;
    else applied = nextStatus;
  } else {
    failure = "no_reference_in_payload";
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
