/**
 * Webhook signature verification + replay protection.
 *
 * Covers the five enforcement layers in `payment-webhooks.server.ts`:
 * provider gating, signature verification, timestamp freshness, event/body
 * dedupe, and the state-machine + amount echo guards.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makePaymentsDb, type FakeSupabaseAdmin } from "./helpers/fake-supabase-admin";

let db: FakeSupabaseAdmin;

vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return db as unknown as never;
  },
}));

const ACTOR = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";
const HOOK_SECRET = "hubtel_hook_secret";

async function hooks() {
  return await import("@/lib/payment-webhooks.server");
}

function boot() {
  process.env["HUBTEL_API_SECRET"] = "hubtel_api";
  process.env["HUBTEL_WEBHOOK_SECRET"] = HOOK_SECRET;
  process.env["PAYSTACK_SECRET_KEY"] = "sk_test_paystack";
  db = makePaymentsDb([
    { code: "hubtel", mode: "live", enabled: true },
    { code: "paystack", mode: "live", enabled: true },
  ]);
}

async function makeIntent(over: Record<string, unknown> = {}) {
  const { createIntent } = await import("@/lib/payments.server");
  const res = await createIntent({
    rail: "momo_mtn",
    purpose: "savings_deposit",
    amountMinor: 25_000,
    memberId: MEMBER,
    actorId: ACTOR,
    payerPhone: "0241234567",
    clientKey: `k-${Math.random()}`,
    ...over,
  } as never);
  return res.intent;
}

function bodyFor(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: `evt-${Math.random().toString(36).slice(2)}`,
    event: "charge.success",
    data: { reference: "REF", status: "success", provider_reference: "PSP-1" },
    ...over,
  });
}

async function post(args: {
  rawBody: string;
  secret?: string;
  timestamp?: string | null;
  headerName?: string;
  signAs?: "body" | "payload" | "stripe" | "none";
  providerCode?: string;
}) {
  const { processPaymentWebhook, signWebhookBody, signWebhookPayload } = await hooks();
  const secret = args.secret ?? HOOK_SECRET;
  const ts = args.timestamp ?? null;
  let signature: string | null = null;
  if (args.signAs === "none") signature = null;
  else if (args.signAs === "payload") signature = signWebhookPayload(secret, args.rawBody, "sha256", String(ts));
  else if (args.signAs === "stripe")
    signature = `t=${ts},v1=${signWebhookPayload(secret, args.rawBody, "sha256", String(ts))}`;
  else signature = signWebhookBody(secret, args.rawBody, "sha256");

  const headers: Record<string, string> = {};
  if (ts && args.signAs !== "stripe") headers[args.headerName ?? "x-webhook-timestamp"] = String(ts);
  return processPaymentWebhook({
    providerCode: args.providerCode ?? "hubtel",
    rawBody: args.rawBody,
    signature,
    headers,
  });
}

beforeEach(() => {
  vi.resetModules();
  boot();
});

describe("signature verification", () => {
  it("accepts a correctly signed raw body", async () => {
    const intent = await makeIntent();
    const res = await post({ rawBody: bodyFor({ data: { reference: intent.reference, status: "success" } }) });
    expect(res.status).toBe(200);
    expect(res.body["applied"]).toBe("succeeded");
  });

  it("accepts the Stripe-style t=…,v1=… signed payload", async () => {
    const intent = await makeIntent();
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await post({
      rawBody: bodyFor({ data: { reference: intent.reference, status: "success" } }),
      timestamp: ts,
      signAs: "stripe",
    });
    expect(res.status).toBe(200);
    expect(res.body["applied"]).toBe("succeeded");
  });

  it("accepts `${timestamp}.${body}` signatures when a timestamp header is present", async () => {
    const intent = await makeIntent();
    const res = await post({
      rawBody: bodyFor({ data: { reference: intent.reference, status: "success" } }),
      timestamp: String(Date.now()),
      signAs: "payload",
    });
    expect(res.status).toBe(200);
    expect(res.body["applied"]).toBe("succeeded");
  });

  it("rejects a wrong secret, a tampered body and a missing signature", async () => {
    const intent = await makeIntent();
    const raw = bodyFor({ data: { reference: intent.reference, status: "success" } });

    expect((await post({ rawBody: raw, secret: "not-the-secret" })).status).toBe(401);
    expect((await post({ rawBody: raw, signAs: "none" })).status).toBe(401);

    // Signature computed over the original body, then the body is modified.
    const { processPaymentWebhook, signWebhookBody } = await hooks();
    const signature = signWebhookBody(HOOK_SECRET, raw, "sha256");
    const tampered = raw.replace('"amount"', '"x"').replace("success", "success ");
    const res = await processPaymentWebhook({
      providerCode: "hubtel",
      rawBody: `${tampered} `,
      signature,
      headers: {},
    });
    expect(res.status).toBe(401);
    expect(res.body["error"]).toBe("invalid_signature");

    // Nothing was journalled and the intent is untouched.
    expect(db.rows("payment_webhook_events")).toHaveLength(0);
    const { getIntentByReference } = await import("@/lib/payments.server");
    expect((await getIntentByReference(intent.reference))!.status).toBe("pending");
  });

  it("refuses unknown providers, disabled providers and a missing signing secret", async () => {
    const { processPaymentWebhook } = await hooks();
    expect(
      (await processPaymentWebhook({ providerCode: "nope", rawBody: "{}", signature: "x" })).status,
    ).toBe(404);

    db.rows("payment_providers").find((p) => p["code"] === "hubtel")!["enabled"] = false;
    expect(
      (await processPaymentWebhook({ providerCode: "hubtel", rawBody: "{}", signature: "x" })).status,
    ).toBe(409);

    db.rows("payment_providers").find((p) => p["code"] === "hubtel")!["enabled"] = true;
    delete process.env["HUBTEL_WEBHOOK_SECRET"];
    expect(
      (await processPaymentWebhook({ providerCode: "hubtel", rawBody: "{}", signature: "x" })).status,
    ).toBe(503);
    process.env["HUBTEL_WEBHOOK_SECRET"] = HOOK_SECRET;
  });

  it("rejects a verified signature over malformed JSON", async () => {
    const res = await post({ rawBody: "{not json" });
    expect(res.status).toBe(400);
    expect(res.body["error"]).toBe("invalid_json");
  });
});

describe("replay protection", () => {
  it("refuses a stale or future-dated timestamp before touching state", async () => {
    const intent = await makeIntent();
    const raw = bodyFor({ data: { reference: intent.reference, status: "success" } });

    const stale = await post({ rawBody: raw, timestamp: String(Date.now() - 10 * 60_000), signAs: "payload" });
    expect(stale.status).toBe(401);
    expect(stale.body["error"]).toBe("timestamp_too_old");

    const future = await post({ rawBody: raw, timestamp: String(Date.now() + 10 * 60_000), signAs: "payload" });
    expect(future.status).toBe(401);
    expect(future.body["error"]).toBe("timestamp_in_future");

    const { getIntentByReference } = await import("@/lib/payments.server");
    expect((await getIntentByReference(intent.reference))!.status).toBe("pending");
    expect(db.rows("payment_webhook_events")).toHaveLength(0);
  });

  it("honours a timestamp signed inside the body", async () => {
    const intent = await makeIntent();
    const raw = bodyFor({
      timestamp: new Date(Date.now() - 20 * 60_000).toISOString(),
      data: { reference: intent.reference, status: "success" },
    });
    const res = await post({ rawBody: raw });
    expect(res.status).toBe(401);
    expect(res.body["error"]).toBe("timestamp_too_old");
  });

  it("accepts timestamps in seconds, milliseconds and ISO form", async () => {
    const { checkTimestampFreshness, MAX_SKEW_MS } = await hooks();
    const now = Date.now();
    expect(checkTimestampFreshness(String(Math.floor(now / 1000)), now).ok).toBe(true);
    expect(checkTimestampFreshness(String(now), now).ok).toBe(true);
    expect(checkTimestampFreshness(new Date(now).toISOString(), now).ok).toBe(true);
    expect(checkTimestampFreshness("not-a-time", now).ok).toBe(false);
    expect(checkTimestampFreshness(String(now - MAX_SKEW_MS - 1), now).ok).toBe(false);
    // No timestamp at all is allowed — providers that don't send one still rely
    // on the event-id / body-hash dedupe below.
    expect(checkTimestampFreshness(null, now).ok).toBe(true);
  });

  it("acknowledges a replayed event id exactly once", async () => {
    const intent = await makeIntent();
    const raw = bodyFor({ id: "evt-fixed", data: { reference: intent.reference, status: "success" } });
    const first = await post({ rawBody: raw });
    expect(first.body["applied"]).toBe("succeeded");

    const replay = await post({ rawBody: raw });
    expect(replay.status).toBe(200);
    expect(replay.body["duplicate"]).toBe(true);
    expect(db.rows("payment_webhook_events")).toHaveLength(1);
  });

  it("dedupes an identical body even when the provider sends no event id", async () => {
    const intent = await makeIntent();
    const raw = JSON.stringify({
      event: "charge.success",
      data: { reference: intent.reference, status: "success" },
    });
    expect((await post({ rawBody: raw })).body["applied"]).toBe("succeeded");
    const replay = await post({ rawBody: raw });
    expect(replay.body["duplicate"]).toBe(true);
    expect(db.rows("payment_webhook_events")).toHaveLength(1);
  });

  it("stores a body hash on every journalled event", async () => {
    const intent = await makeIntent();
    await post({ rawBody: bodyFor({ data: { reference: intent.reference, status: "success" } }) });
    const event = db.rows("payment_webhook_events")[0]!;
    expect(String(event["body_hash"])).toMatch(/^[a-f0-9]{64}$/);
    expect(event["signature_verified"]).toBe(true);
    expect(event["processed_at"]).toBeTruthy();
  });
});

describe("state-machine and echo guards", () => {
  it("only allows documented transitions", async () => {
    const { transitionAllowed } = await hooks();
    expect(transitionAllowed("pending", "succeeded")).toBe(true);
    expect(transitionAllowed("pending", "failed")).toBe(true);
    expect(transitionAllowed("succeeded", "reversed")).toBe(true);
    expect(transitionAllowed("succeeded", "pending")).toBe(false);
    expect(transitionAllowed("succeeded", "failed")).toBe(false);
    expect(transitionAllowed("reversed", "succeeded")).toBe(false);
    expect(transitionAllowed("cancelled", "succeeded")).toBe(false);
  });

  it("cannot resurrect a cancelled payment", async () => {
    const { cancelIntent, getIntentByReference } = await import("@/lib/payments.server");
    const intent = await makeIntent();
    await cancelIntent({ reference: intent.reference, actorId: ACTOR, reason: "Payer aborted" });
    const res = await post({ rawBody: bodyFor({ data: { reference: intent.reference, status: "success" } }) });
    expect(res.status).toBe(202);
    expect(String(res.body["note"])).toContain("transition_not_allowed");
    expect((await getIntentByReference(intent.reference))!.status).toBe("cancelled");
  });

  it("accepts a later reversal of a settled payment", async () => {
    const { getIntentByReference } = await import("@/lib/payments.server");
    const intent = await makeIntent();
    await post({ rawBody: bodyFor({ data: { reference: intent.reference, status: "success" } }) });
    const res = await post({ rawBody: bodyFor({ data: { reference: intent.reference, status: "chargeback" } }) });
    expect(res.body["applied"]).toBe("reversed");
    expect((await getIntentByReference(intent.reference))!.status).toBe("reversed");
  });

  it("ignores a callback from a provider that does not own the intent", async () => {
    const { getIntentByReference } = await import("@/lib/payments.server");
    const intent = await makeIntent({ rail: "momo_mtn" });
    const raw = bodyFor({ data: { reference: intent.reference, status: "success" } });
    const { processPaymentWebhook, signWebhookBody } = await hooks();
    const res = await processPaymentWebhook({
      providerCode: "paystack",
      rawBody: raw,
      signature: signWebhookBody(process.env["PAYSTACK_SECRET_KEY"]!, raw, "sha512"),
      headers: {},
    });
    expect(res.status).toBe(202);
    expect(res.body["note"]).toBe("provider_mismatch");
    expect((await getIntentByReference(intent.reference))!.status).toBe("pending");
  });

  it("rejects a payload whose amount or currency disagrees with the intent", async () => {
    const { getIntentByReference } = await import("@/lib/payments.server");
    const intent = await makeIntent();
    const wrongAmount = await post({
      rawBody: bodyFor({
        data: { reference: intent.reference, status: "success", amount_minor: 100 },
      }),
    });
    expect(wrongAmount.status).toBe(202);
    expect(wrongAmount.body["note"]).toBe("amount_or_currency_mismatch");

    const wrongCurrency = await post({
      rawBody: bodyFor({
        data: { reference: intent.reference, status: "success", currency: "USD" },
      }),
    });
    expect(wrongCurrency.body["note"]).toBe("amount_or_currency_mismatch");
    expect((await getIntentByReference(intent.reference))!.status).toBe("pending");

    // Matching amount (minor units or major units) settles normally.
    const ok = await post({
      rawBody: bodyFor({
        data: { reference: intent.reference, status: "success", amount: 250, currency: "ghs" },
      }),
    });
    expect(ok.body["applied"]).toBe("succeeded");
  });

  it("journals an unknown reference without failing the delivery", async () => {
    const res = await post({ rawBody: bodyFor({ data: { reference: "IW-00000000-NOPE", status: "success" } }) });
    expect(res.status).toBe(202);
    expect(res.body["note"]).toBe("unknown_reference");
    expect(db.rows("payment_webhook_events")[0]!["error"]).toBe("unknown_reference");
  });

  it("flags a payload with no reference at all", async () => {
    const res = await post({ rawBody: JSON.stringify({ id: "evt-noref", event: "charge.success" }) });
    expect(res.status).toBe(202);
    expect(res.body["note"]).toBe("no_reference_in_payload");
  });
});
