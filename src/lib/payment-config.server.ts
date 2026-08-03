/**
 * Server-only helpers behind the payment configuration module.
 *
 * API credentials live exclusively in environment variables. The database
 * stores the *name* of the variable (`payment_providers.secret_ref`) plus
 * non-secret identifiers, so a database read can never leak a key.
 */
import {
  PROVIDER_TEMPLATES,
  defaultWebhookPath,
  templateFor,
  type ProviderTemplate,
} from "@/lib/payment-providers";
import { processPaymentWebhook, signWebhookBody } from "@/lib/payment-webhooks.server";

const SECRETISH = /(secret|api[_-]?key|password|token|private)/i;

export type ProviderRow = {
  code: string;
  label: string;
  mode: string;
  enabled: boolean;
  config: Record<string, string>;
  secret_ref: string | null;
  webhook_path: string | null;
  updated_at: string | null;
};

export type WebhookEventRow = {
  id: string;
  provider_code: string;
  event_id: string | null;
  event_type: string | null;
  signature_verified: boolean;
  processed_at: string | null;
  error: string | null;
  created_at: string;
};

export type PaymentConfigView = {
  providers: ProviderRow[];
  events: WebhookEventRow[];
  intent_counts: { status: string; count: number }[];
  can_manage: boolean;
};

export type ReadinessCheck = {
  key: string;
  label: string;
  state: "pass" | "warn" | "fail";
  detail: string;
};

export type ReadinessReport = {
  code: string;
  label: string;
  configured: boolean;
  webhook_url: string;
  checks: ReadinessCheck[];
  ready_for_intents: boolean;
  ready_for_webhooks: boolean;
};

export type SelfTestResult = {
  code: string;
  reference: string | null;
  passed: boolean;
  steps: { label: string; ok: boolean; detail: string }[];
};

export async function assertPaymentsPermission(
  supabase: unknown,
  action: "view" | "manage",
): Promise<void> {
  const { assertCapability } = await import("@/lib/capability-guard.server");
  await assertCapability(supabase, "payments", action);
}

function redact(config: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries((config ?? {}) as Record<string, unknown>)) {
    out[k] = SECRETISH.test(k) ? "••••••••" : String(v ?? "");
  }
  return out;
}

export async function loadPaymentConfig(): Promise<PaymentConfigView> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [providers, events, intents] = await Promise.all([
    supabaseAdmin
      .from("payment_providers")
      .select("code, label, mode, enabled, config, secret_ref, webhook_path, updated_at")
      .order("code"),
    supabaseAdmin
      .from("payment_webhook_events")
      .select("id, provider_code, event_id, event_type, signature_verified, processed_at, error, created_at")
      .order("created_at", { ascending: false })
      .limit(25),
    supabaseAdmin.from("payment_intents").select("status").limit(1000),
  ]);

  const counts = new Map<string, number>();
  for (const row of (intents.data ?? []) as { status: string }[]) {
    counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  }

  return {
    providers: ((providers.data ?? []) as ProviderRow[]).map((p) => ({
      ...p,
      config: redact(p.config),
    })),
    events: (events.data ?? []) as WebhookEventRow[],
    intent_counts: [...counts.entries()].map(([status, count]) => ({ status, count })),
    can_manage: true,
  };
}

function baseUrl(): string {
  return process.env["PUBLIC_SITE_URL"] ?? "https://infinitydatalink.com";
}

export async function buildReadinessReport(code: string): Promise<ReadinessReport> {
  const template = templateFor(code);
  if (!template) throw new Error(`Unsupported provider: ${code}`);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin
    .from("payment_providers")
    .select("code, label, mode, enabled, config, secret_ref, webhook_path")
    .eq("code", code)
    .maybeSingle();

  const provider = row as ProviderRow | null;
  const checks: ReadinessCheck[] = [];

  checks.push(
    provider
      ? { key: "record", label: "Provider saved", state: "pass", detail: `Stored in ${provider.mode} mode.` }
      : { key: "record", label: "Provider saved", state: "fail", detail: "No approved configuration yet." },
  );

  const missingFields = template.fields.filter(
    (f) => f.required && !String(((provider?.config ?? {}) as Record<string, unknown>)[f.key] ?? "").trim(),
  );
  checks.push({
    key: "fields",
    label: "Required settings",
    state: missingFields.length === 0 && provider ? "pass" : "fail",
    detail:
      missingFields.length === 0
        ? "All required identifiers present."
        : `Missing: ${missingFields.map((f) => f.label).join(", ")}`,
  });

  const apiSecret = process.env[template.secretEnv];
  checks.push({
    key: "api_secret",
    label: `API secret (${template.secretEnv})`,
    state: apiSecret ? "pass" : "fail",
    detail: apiSecret ? "Stored securely as a backend secret." : "Secret not configured — intents cannot be created.",
  });

  const hookSecret = process.env[template.webhookSecretEnv];
  checks.push({
    key: "webhook_secret",
    label: `Webhook signing secret (${template.webhookSecretEnv})`,
    state: hookSecret ? "pass" : "fail",
    detail: hookSecret ? "Callback signatures will be verified." : "Missing — callbacks will be rejected with 503.",
  });

  const expectedPath = defaultWebhookPath(code);
  checks.push({
    key: "webhook_path",
    label: "Callback endpoint",
    state: !provider ? "warn" : provider.webhook_path === expectedPath ? "pass" : "warn",
    detail: provider?.webhook_path
      ? `Configured as ${provider.webhook_path}`
      : `Will default to ${expectedPath}`,
  });

  checks.push({
    key: "enabled",
    label: "Rail enabled",
    state: provider?.enabled ? "pass" : "warn",
    detail: provider?.enabled ? "Accepting traffic." : "Disabled — no live traffic will be accepted.",
  });

  if (provider?.mode === "live") {
    checks.push({
      key: "mode",
      label: "Live mode",
      state: apiSecret && hookSecret ? "pass" : "fail",
      detail: "Live mode requires both secrets to be present.",
    });
  }

  const ready_for_intents = Boolean(provider && missingFields.length === 0 && apiSecret);
  const ready_for_webhooks = Boolean(provider && hookSecret);

  return {
    code,
    label: provider?.label ?? template.label,
    configured: Boolean(provider),
    webhook_url: `${baseUrl()}${provider?.webhook_path ?? expectedPath}`,
    checks,
    ready_for_intents,
    ready_for_webhooks,
  };
}

function testPayload(template: ProviderTemplate, reference: string) {
  return JSON.stringify({
    event: "charge.success",
    id: `selftest_${reference}`,
    data: {
      reference,
      status: "success",
      provider_reference: `${template.code}_selftest`,
      amount: 100,
    },
  });
}

export async function runProviderSelfTest(code: string, actorId: string): Promise<SelfTestResult> {
  const template = templateFor(code);
  if (!template) throw new Error(`Unsupported provider: ${code}`);
  const steps: SelfTestResult["steps"] = [];
  const report = await buildReadinessReport(code);

  steps.push({
    label: "Configuration & credentials",
    ok: report.ready_for_intents,
    detail: report.ready_for_intents
      ? "Provider record and API secret present."
      : report.checks.filter((c) => c.state === "fail").map((c) => c.detail).join(" "),
  });
  if (!report.ready_for_intents) return { code, reference: null, passed: false, steps };

  const reference = `SELFTEST-${Date.now().toString(36).toUpperCase()}`;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error: intentErr } = await supabaseAdmin.from("payment_intents").insert({
    reference,
    provider_code: code,
    purpose: "readiness_test",
    amount_minor: 100,
    currency: "GHS",
    status: "pending",
    metadata: { self_test: true } as never,
    created_by: actorId,
  });
  steps.push({
    label: "Create payment intent",
    ok: !intentErr,
    detail: intentErr ? intentErr.message : `Intent ${reference} created for GHS 1.00.`,
  });
  if (intentErr) return { code, reference: null, passed: false, steps };

  const raw = testPayload(template, reference);
  const signature = process.env[template.webhookSecretEnv]
    ? signWebhookBody(process.env[template.webhookSecretEnv]!, raw, template.signatureAlgo)
    : null;
  steps.push({
    label: "Sign callback payload",
    ok: Boolean(signature),
    detail: signature
      ? `HMAC-${template.signatureAlgo.toUpperCase()} computed from ${template.webhookSecretEnv}.`
      : `${template.webhookSecretEnv} is not configured.`,
  });

  const outcome = await processPaymentWebhook({
    providerCode: code,
    rawBody: raw,
    signature,
    simulate: !signature,
  });
  const hookOk = outcome.status === 200 && (outcome.body as { applied?: string }).applied === "succeeded";
  steps.push({
    label: "Process webhook callback",
    ok: hookOk,
    detail: hookOk
      ? "Callback verified, journalled and intent marked succeeded."
      : `HTTP ${outcome.status} — ${JSON.stringify(outcome.body)}`,
  });

  return { code, reference, passed: steps.every((s) => s.ok), steps };
}

export const ALL_TEMPLATES = PROVIDER_TEMPLATES;
