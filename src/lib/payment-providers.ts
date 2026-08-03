/**
 * Payment gateway catalogue — client-safe metadata shared by the admin
 * configuration UI and the server-side webhook processor.
 *
 * API credentials are NEVER stored in the database. Each provider declares the
 * environment-variable names (`secretEnv`, `webhookSecretEnv`) that hold its
 * secret key and webhook signing secret; only non-secret identifiers (public
 * keys, merchant/account numbers, base URLs) live in `payment_providers.config`.
 */

export type ProviderFieldKind = "text" | "url";

export type ProviderField = {
  key: string;
  label: string;
  kind: ProviderFieldKind;
  placeholder?: string;
  hint?: string;
  required?: boolean;
};

export type ProviderTemplate = {
  code: string;
  label: string;
  blurb: string;
  /** Env var holding the private API key used to create intents. */
  secretEnv: string;
  /** Env var holding the webhook signing secret used to verify callbacks. */
  webhookSecretEnv: string;
  /** HMAC digest the provider signs webhook bodies with. */
  signatureAlgo: "sha256" | "sha512";
  /** Header the signature arrives in. */
  signatureHeader: string;
  fields: ProviderField[];
};

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    code: "paystack",
    label: "Paystack",
    blurb: "Cards, mobile money and bank transfer across Ghana and Nigeria.",
    secretEnv: "PAYSTACK_SECRET_KEY",
    webhookSecretEnv: "PAYSTACK_SECRET_KEY",
    signatureAlgo: "sha512",
    signatureHeader: "x-paystack-signature",
    fields: [
      { key: "public_key", label: "Public key", kind: "text", placeholder: "pk_test_…", required: true },
      { key: "base_url", label: "API base URL", kind: "url", placeholder: "https://api.paystack.co", required: true },
      { key: "callback_url", label: "Customer callback URL", kind: "url", placeholder: "https://…/app/payments" },
    ],
  },
  {
    code: "hubtel",
    label: "Hubtel",
    blurb: "Ghana-first mobile money collections and direct debit.",
    secretEnv: "HUBTEL_API_SECRET",
    webhookSecretEnv: "HUBTEL_WEBHOOK_SECRET",
    signatureAlgo: "sha256",
    signatureHeader: "x-hubtel-signature",
    fields: [
      { key: "client_id", label: "Client ID", kind: "text", required: true },
      { key: "merchant_account", label: "Merchant account number", kind: "text", required: true },
      { key: "base_url", label: "API base URL", kind: "url", placeholder: "https://api.hubtel.com", required: true },
    ],
  },
  {
    code: "flutterwave",
    label: "Flutterwave",
    blurb: "Pan-African cards, mobile money and payouts.",
    secretEnv: "FLUTTERWAVE_SECRET_KEY",
    webhookSecretEnv: "FLUTTERWAVE_WEBHOOK_SECRET",
    signatureAlgo: "sha256",
    signatureHeader: "verif-hash",
    fields: [
      { key: "public_key", label: "Public key", kind: "text", required: true },
      { key: "base_url", label: "API base URL", kind: "url", placeholder: "https://api.flutterwave.com/v3", required: true },
    ],
  },
  {
    code: "mtn_momo",
    label: "MTN MoMo (direct)",
    blurb: "Direct MTN Mobile Money collections via the MoMo Open API.",
    secretEnv: "MTN_MOMO_API_KEY",
    webhookSecretEnv: "MTN_MOMO_WEBHOOK_SECRET",
    signatureAlgo: "sha256",
    signatureHeader: "x-momo-signature",
    fields: [
      { key: "subscription_key", label: "Subscription key", kind: "text", required: true },
      { key: "environment", label: "Target environment", kind: "text", placeholder: "mtnghana", required: true },
      { key: "base_url", label: "API base URL", kind: "url", placeholder: "https://proxy.momoapi.mtn.com", required: true },
    ],
  },
  {
    code: "manual_bank",
    label: "Manual bank transfer",
    blurb: "Offline rail — references are reconciled by finance officers.",
    secretEnv: "MANUAL_BANK_UPLOAD_TOKEN",
    webhookSecretEnv: "MANUAL_BANK_UPLOAD_TOKEN",
    signatureAlgo: "sha256",
    signatureHeader: "x-bank-signature",
    fields: [
      { key: "bank_name", label: "Bank name", kind: "text", required: true },
      { key: "account_number", label: "Settlement account", kind: "text", required: true },
    ],
  },
];

export function templateFor(code: string): ProviderTemplate | undefined {
  return PROVIDER_TEMPLATES.find((t) => t.code === code);
}

export const PROVIDER_MODES = ["sandbox", "live"] as const;
export type ProviderMode = (typeof PROVIDER_MODES)[number];

export function defaultWebhookPath(code: string): string {
  return `/api/public/hooks/payments/${code}`;
}

/** Provider status → internal payment-intent status. */
export function normalizeIntentStatus(raw: string | null | undefined): string {
  const v = (raw ?? "").toLowerCase();
  if (["success", "successful", "succeeded", "paid", "completed"].includes(v)) return "succeeded";
  if (["failed", "failure", "declined", "cancelled", "canceled", "abandoned"].includes(v)) return "failed";
  if (["reversed", "refunded", "chargeback"].includes(v)) return "reversed";
  return "pending";
}
