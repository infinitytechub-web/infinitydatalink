/**
 * End-to-end payment pathway coverage.
 *
 * Drives the real server modules (`payments.server.ts`,
 * `payment-webhooks.server.ts`) against an in-memory service-role client, so
 * every rail — MTN MoMo, Telecel Cash, AT Money, bank transfer, Visa,
 * Mastercard, cash — is exercised through the full lifecycle:
 *   number validation → network detection → intent creation (idempotent)
 *   → state transition (provider webhook or officer confirmation)
 *   → receipt generation → reconciliation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkGhPhone, detectNetwork, normalizeGhPhone } from "@/lib/gh-phone";
import { RAIL_SPECS, railSpec, type Rail } from "@/lib/payment-rails";
import { makePaymentsDb, type FakeSupabaseAdmin } from "./helpers/fake-supabase-admin";

let db: FakeSupabaseAdmin;

vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return db as unknown as never;
  },
}));

const ACTOR = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";

const NUMBERS: Record<string, string> = {
  mtn: "0241234567",
  telecel: "0201234567",
  airteltigo: "0271234567",
  glo: "0231234567",
};

/** Every provider configured + credentialled, so all rails are selectable. */
function bootAllRails() {
  process.env["PAYSTACK_SECRET_KEY"] = "sk_test_paystack";
  process.env["HUBTEL_API_SECRET"] = "hubtel_api";
  process.env["HUBTEL_WEBHOOK_SECRET"] = "hubtel_hook";
  process.env["FLUTTERWAVE_SECRET_KEY"] = "flw_secret";
  process.env["FLUTTERWAVE_WEBHOOK_SECRET"] = "flw_hook";
  process.env["MTN_MOMO_API_KEY"] = "mtn_api";
  process.env["MTN_MOMO_WEBHOOK_SECRET"] = "mtn_hook";
  process.env["MANUAL_BANK_UPLOAD_TOKEN"] = "bank_token";
  db = makePaymentsDb([
    { code: "hubtel", mode: "live", enabled: true },
    { code: "paystack", mode: "live", enabled: true },
    { code: "mtn_momo", mode: "sandbox", enabled: true },
    { code: "manual_bank", mode: "live", enabled: true },
  ]);
}

function payerFor(rail: Rail): string | null {
  const spec = railSpec(rail)!;
  return spec.network ? NUMBERS[spec.network]! : null;
}

async function svc() {
  return await import("@/lib/payments.server");
}

async function createFor(rail: Rail, over: Record<string, unknown> = {}) {
  const { createIntent } = await svc();
  return createIntent({
    rail,
    purpose: "savings_deposit",
    amountMinor: 25_000,
    memberId: MEMBER,
    actorId: ACTOR,
    payerPhone: payerFor(rail),
    clientKey: `key-${rail}`,
    ...over,
  } as never);
}

/** Delivers a signed provider callback for an intent. */
async function deliverWebhook(args: {
  providerCode: string;
  secret: string;
  algo: "sha256" | "sha512";
  reference: string;
  status: string;
  eventId: string;
  tamper?: boolean;
}) {
  const { processPaymentWebhook, signWebhookBody } = await import("@/lib/payment-webhooks.server");
  const rawBody = JSON.stringify({
    id: args.eventId,
    event: `charge.${args.status}`,
    data: { reference: args.reference, status: args.status, provider_reference: `PSP-${args.eventId}` },
  });
  const signature = signWebhookBody(args.tamper ? "wrong-secret" : args.secret, rawBody, args.algo);
  return processPaymentWebhook({ providerCode: args.providerCode, rawBody, signature });
}

beforeEach(() => {
  vi.resetModules();
  bootAllRails();
});

describe("mobile-number validation and network detection", () => {
  it("accepts every canonical Ghanaian form and detects the network", () => {
    for (const [network, phone] of Object.entries(NUMBERS)) {
      const check = checkGhPhone(phone);
      expect(check.valid).toBe(true);
      expect(check.valid && check.network).toBe(network);
      expect(detectNetwork(phone)).toBe(network);
    }
  });

  it("normalises international, spaced and 00233 forms to 10 local digits", () => {
    for (const input of ["+233 24 123 4567", "233241234567", "00233241234567", "024-123-4567"]) {
      expect(normalizeGhPhone(input)).toBe("0241234567");
      expect(detectNetwork(input)).toBe("mtn");
    }
  });

  it("rejects wrong length, non-digits, missing trunk zero and unknown prefixes", () => {
    for (const bad of ["024123456", "02412345678", "024abc4567", "2412345670", "0991234567", ""]) {
      const check = checkGhPhone(bad);
      expect(check.valid).toBe(false);
      expect(detectNetwork(bad)).not.toBe("mtn");
    }
  });

  it("blocks a mobile-money intent whose number is on another network", async () => {
    await expect(createFor("momo_mtn", { payerPhone: NUMBERS["telecel"] })).rejects.toThrow(
      /cannot be used on the MTN Mobile Money rail/i,
    );
    await expect(createFor("momo_telecel", { payerPhone: NUMBERS["mtn"] })).rejects.toThrow(/pick the matching rail/i);
    await expect(createFor("momo_at", { payerPhone: NUMBERS["glo"] })).rejects.toThrow(/matching rail/i);
  });

  it("requires a valid number on mobile-money rails and ignores it elsewhere", async () => {
    await expect(createFor("momo_mtn", { payerPhone: "0241" })).rejects.toThrow(/Mobile money number invalid/i);
    const cash = await createFor("cash", { payerPhone: "not-a-number" });
    expect(cash.intent.payer_phone).toBeNull();
    expect(cash.intent.payer_network).toBeNull();
  });

  it("stores the detected network on the intent for each mobile-money rail", async () => {
    for (const rail of ["momo_mtn", "momo_telecel", "momo_at"] as Rail[]) {
      const { intent } = await createFor(rail);
      expect(intent.payer_phone).toBe(payerFor(rail));
      expect(intent.payer_network).toBe(railSpec(rail)!.network);
    }
  });
});

describe("intent creation and idempotency for every pathway", () => {
  it("creates exactly one intent per rail and rejects non-positive amounts", async () => {
    for (const spec of RAIL_SPECS) {
      const first = await createFor(spec.code);
      expect(first.duplicate).toBe(false);
      expect(first.intent.status).toBe("pending");
      expect(first.intent.reference).toMatch(/^IW-\d{8}-[A-Z0-9]{8}$/);
      expect(first.intent.currency).toBe("GHS");
      await expect(createFor(spec.code, { amountMinor: 0 })).rejects.toThrow(/greater than zero/i);
      await expect(createFor(spec.code, { amountMinor: 12.5 })).rejects.toThrow(/greater than zero/i);
    }
    expect(db.rows("payment_intents")).toHaveLength(RAIL_SPECS.length);
  });

  it("returns the existing intent on a repeated submit (same client key)", async () => {
    for (const spec of RAIL_SPECS) {
      const first = await createFor(spec.code);
      const retry = await createFor(spec.code);
      expect(retry.duplicate).toBe(true);
      expect(retry.intent.reference).toBe(first.intent.reference);
    }
    expect(db.rows("payment_intents")).toHaveLength(RAIL_SPECS.length);
  });

  it("treats a different client key or amount as a distinct payment", async () => {
    const a = await createFor("cash", { clientKey: "till-1" });
    const b = await createFor("cash", { clientKey: "till-2" });
    const c = await createFor("cash", { clientKey: "till-1", amountMinor: 999 });
    const refs = new Set([a.intent.reference, b.intent.reference, c.intent.reference]);
    expect(refs.size).toBe(3);
  });

  it("refuses a rail an administrator has switched off", async () => {
    db = makePaymentsDb(
      [{ code: "hubtel", mode: "live", enabled: true }],
      [{ rail: "momo_mtn", enabled: false }],
    );
    await expect(createFor("momo_mtn")).rejects.toThrow(/not available yet/i);
  });

  it("refuses provider rails with no credentials but still records cash/bank", async () => {
    db = makePaymentsDb([]);
    for (const spec of RAIL_SPECS.filter((s) => s.requiresProvider)) {
      await expect(createFor(spec.code)).rejects.toThrow(/not available yet/i);
    }
    for (const spec of RAIL_SPECS.filter((s) => s.manualSettlement)) {
      const { intent } = await createFor(spec.code);
      expect(intent.status).toBe("pending");
    }
  });
});

describe("state transitions", () => {
  it("settles a provider rail only through a verified webhook", async () => {
    const { getIntentByReference } = await svc();
    const { intent } = await createFor("momo_mtn");

    const forged = await deliverWebhook({
      providerCode: "hubtel",
      secret: process.env["HUBTEL_WEBHOOK_SECRET"]!,
      algo: "sha256",
      reference: intent.reference,
      status: "success",
      eventId: "evt-forged",
      tamper: true,
    });
    expect(forged.status).toBe(401);
    expect((await getIntentByReference(intent.reference))!.status).toBe("pending");

    const ok = await deliverWebhook({
      providerCode: "hubtel",
      secret: process.env["HUBTEL_WEBHOOK_SECRET"]!,
      algo: "sha256",
      reference: intent.reference,
      status: "success",
      eventId: "evt-1",
    });
    expect(ok.status).toBe(200);
    const settled = (await getIntentByReference(intent.reference))!;
    expect(settled.status).toBe("succeeded");
    expect(settled.provider_reference).toBe("PSP-evt-1");
  });

  it("records a failed provider callback with its reason", async () => {
    const { getIntentByReference } = await svc();
    const { intent } = await createFor("card_visa");
    const res = await deliverWebhook({
      providerCode: "paystack",
      secret: process.env["PAYSTACK_SECRET_KEY"]!,
      algo: "sha512",
      reference: intent.reference,
      status: "failed",
      eventId: "evt-fail",
    });
    expect(res.status).toBe(200);
    const row = (await getIntentByReference(intent.reference))!;
    expect(row.status).toBe("failed");
    expect(row.failure_reason).toBeTruthy();
  });

  it("acknowledges a replayed webhook without re-applying it", async () => {
    const { intent } = await createFor("momo_telecel");
    const args = {
      providerCode: "hubtel",
      secret: process.env["HUBTEL_WEBHOOK_SECRET"]!,
      algo: "sha256" as const,
      reference: intent.reference,
      status: "success",
      eventId: "evt-replay",
    };
    expect((await deliverWebhook(args)).status).toBe(200);
    const replay = await deliverWebhook(args);
    expect(replay.status).toBe(200);
    expect(replay.body["duplicate"]).toBe(true);
    expect(db.rows("payment_webhook_events")).toHaveLength(1);
  });

  it("rejects unsigned callbacks and unknown providers", async () => {
    const { processPaymentWebhook } = await import("@/lib/payment-webhooks.server");
    expect(
      (await processPaymentWebhook({ providerCode: "hubtel", rawBody: "{}", signature: null })).status,
    ).toBe(401);
    expect(
      (await processPaymentWebhook({ providerCode: "not_a_provider", rawBody: "{}", signature: "x" })).status,
    ).toBe(404);
  });

  it("lets an officer confirm cash and bank rails, but never a provider rail", async () => {
    const { settleManually } = await svc();
    for (const spec of RAIL_SPECS.filter((s) => s.manualSettlement)) {
      const { intent } = await createFor(spec.code);
      const res = await settleManually({
        reference: intent.reference,
        actorId: ACTOR,
        note: "Counted at the counter",
        providerReference: "TILL-77",
      });
      expect(res.intent.status).toBe("succeeded");
      expect(res.intent.settled_by).toBe(ACTOR);
      await expect(
        settleManually({ reference: intent.reference, actorId: ACTOR, note: "again" }),
      ).rejects.toThrow(/already settled/i);
    }
    for (const spec of RAIL_SPECS.filter((s) => !s.manualSettlement)) {
      const { intent } = await createFor(spec.code);
      await expect(
        settleManually({ reference: intent.reference, actorId: ACTOR, note: "by hand" }),
      ).rejects.toThrow(/verified provider callback/i);
    }
  });

  it("cancels only open payments and refunds only settled ones", async () => {
    const { cancelIntent, requestRefundRow, settleManually } = await svc();
    const open = await createFor("cash", { clientKey: "open" });
    const cancelled = await cancelIntent({
      reference: open.intent.reference,
      actorId: ACTOR,
      reason: "Payer walked away",
    });
    expect(cancelled.status).toBe("cancelled");
    await expect(
      cancelIntent({ reference: open.intent.reference, actorId: ACTOR, reason: "again" }),
    ).rejects.toThrow(/only an open payment/i);
    await expect(
      requestRefundRow({ reference: open.intent.reference, actorId: ACTOR, amountMinor: 100, reason: "n/a" }),
    ).rejects.toThrow(/only a settled payment/i);

    const paid = await createFor("cash", { clientKey: "paid" });
    await settleManually({ reference: paid.intent.reference, actorId: ACTOR, note: "Cash received" });
    const refund = await requestRefundRow({
      reference: paid.intent.reference,
      actorId: ACTOR,
      amountMinor: 25_000,
      reason: "Duplicate deposit",
    });
    expect(refund.status).toBe("requested");
    await expect(
      requestRefundRow({ reference: paid.intent.reference, actorId: ACTOR, amountMinor: 99_999, reason: "too much" }),
    ).rejects.toThrow(/exceeds the amount paid/i);
  });

  it("scopes member cancellation to the owning member", async () => {
    const { cancelIntent } = await svc();
    const { intent } = await createFor("cash");
    await expect(
      cancelIntent({ reference: intent.reference, actorId: ACTOR, reason: "x", memberScope: "someone-else" }),
    ).rejects.toThrow(/not found/i);
  });
});

describe("receipt generation", () => {
  it("issues exactly one sequential receipt per settled payment on every pathway", async () => {
    const { settleManually, issueReceipt, listReceipts, getIntentByReference } = await svc();
    const receiptNos: string[] = [];

    // Manual pathways settle through the officer confirmation flow.
    for (const spec of RAIL_SPECS.filter((s) => s.manualSettlement)) {
      const { intent } = await createFor(spec.code);
      const { receipt } = await settleManually({
        reference: intent.reference,
        actorId: ACTOR,
        note: "Confirmed by finance",
      });
      expect(receipt.amount_minor).toBe(intent.amount_minor);
      expect(receipt.currency).toBe("GHS");
      receiptNos.push(receipt.receipt_no);
      const again = await issueReceipt((await getIntentByReference(intent.reference))!, ACTOR);
      expect(again.receipt_no).toBe(receipt.receipt_no);
    }

    // Provider pathways settle through the webhook, then the receipt is issued.
    const providerCases: { rail: Rail; provider: string; secretEnv: string; algo: "sha256" | "sha512" }[] = [
      { rail: "momo_mtn", provider: "hubtel", secretEnv: "HUBTEL_WEBHOOK_SECRET", algo: "sha256" },
      { rail: "momo_telecel", provider: "hubtel", secretEnv: "HUBTEL_WEBHOOK_SECRET", algo: "sha256" },
      { rail: "momo_at", provider: "hubtel", secretEnv: "HUBTEL_WEBHOOK_SECRET", algo: "sha256" },
      { rail: "card_visa", provider: "paystack", secretEnv: "PAYSTACK_SECRET_KEY", algo: "sha512" },
      { rail: "card_mastercard", provider: "paystack", secretEnv: "PAYSTACK_SECRET_KEY", algo: "sha512" },
    ];
    for (const [i, c] of providerCases.entries()) {
      const { intent } = await createFor(c.rail);
      await deliverWebhook({
        providerCode: c.provider,
        secret: process.env[c.secretEnv]!,
        algo: c.algo,
        reference: intent.reference,
        status: "success",
        eventId: `evt-receipt-${i}`,
      });
      const settled = (await getIntentByReference(intent.reference))!;
      expect(settled.status).toBe("succeeded");
      const receipt = await issueReceipt(settled, ACTOR);
      expect(receipt.intent_id).toBe(settled.id);
      receiptNos.push(receipt.receipt_no);
    }

    expect(new Set(receiptNos).size).toBe(receiptNos.length);
    expect(receiptNos.every((n) => /^RCPT-\d{6}$/.test(n))).toBe(true);
    const stored = await listReceipts(db.rows("payment_intents").map((r) => r["id"] as string));
    expect(stored).toHaveLength(receiptNos.length);
  });

  it("reconciles settled rows and flags a receipt without a settlement", async () => {
    const { settleManually, buildReconciliation, issueReceipt, getIntentByReference } = await svc();
    const cash = await createFor("cash", { clientKey: "recon-cash" });
    await settleManually({ reference: cash.intent.reference, actorId: ACTOR, note: "Counted" });

    const momo = await createFor("momo_mtn", { clientKey: "recon-momo" });
    await deliverWebhook({
      providerCode: "hubtel",
      secret: process.env["HUBTEL_WEBHOOK_SECRET"]!,
      algo: "sha256",
      reference: momo.intent.reference,
      status: "success",
      eventId: "evt-recon",
    });
    await issueReceipt((await getIntentByReference(momo.intent.reference))!, ACTOR);

    const open = await createFor("card_visa", { clientKey: "recon-open" });
    // A receipt on a still-open payment must surface as a mismatch.
    await issueReceipt(open.intent, ACTOR);

    const summary = await buildReconciliation();
    expect(summary.manual_confirmed).toBe(1);
    expect(summary.provider_confirmed).toBe(1);
    expect(summary.awaiting_provider).toBe(1);
    expect(summary.mismatches.some((m) => /Receipt exists but status is pending/.test(m.issue))).toBe(true);
  });
});
