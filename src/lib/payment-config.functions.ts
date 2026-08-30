import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit } from "@/lib/audit-log";
import { PROVIDER_MODES, defaultWebhookPath, templateFor } from "@/lib/payment-providers";
import {
  assertPaymentsPermission,
  buildReadinessReport,
  loadPaymentConfig,
  runProviderSelfTest,
  setRailEnabled,
  type PaymentConfigView,
  type RailConfigRow,
  type ReadinessReport,
  type SelfTestResult,
} from "@/lib/payment-config.server";

export type { PaymentConfigView, RailConfigRow, ReadinessReport, SelfTestResult };

/** Enable or disable a single payment rail. Requires payments.manage. */
export const setPaymentRailEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        rail: z.string().trim().min(2).max(40),
        enabled: z.boolean(),
        note: z.string().trim().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertPaymentsPermission(context.supabase, "manage");
    await setRailEnabled({
      rail: data.rail,
      enabled: data.enabled,
      note: data.note?.trim() || null,
      actorId: context.userId,
    });
    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as { email?: string } | null)?.email ?? null,
      action: data.enabled ? "payments.rail.enabled" : "payments.rail.disabled",
      target: data.rail,
      meta: { note: data.note ?? null },
    });
    return { ok: true };
  });

/** Providers + redacted config + recent webhook activity. Requires payments.view. */
export const getPaymentConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PaymentConfigView> => {
    await assertPaymentsPermission(context.supabase, "view");
    return loadPaymentConfig();
  });

/** Stage a provider configuration change for two-person approval. */
export const requestPaymentProviderChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        code: z.string().trim().min(2).max(40),
        label: z.string().trim().min(2).max(80),
        mode: z.enum(PROVIDER_MODES),
        enabled: z.boolean(),
        config: z.record(z.string(), z.string().trim().max(300)).default({}),
        webhook_path: z.string().trim().max(200).optional(),
        summary: z.string().trim().min(5, "Explain the change (min 5 chars)").max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await assertPaymentsPermission(context.supabase, "manage");
    const template = templateFor(data.code);
    if (!template) throw new Error(`Unsupported provider: ${data.code}`);

    for (const field of template.fields) {
      if (field.required && !data.config[field.key]) {
        throw new Error(`${field.label} is required for ${template.label}`);
      }
    }
    // Credentials never travel through the database: only the env-var name.
    const payload = {
      code: data.code,
      label: data.label,
      mode: data.mode,
      enabled: data.enabled,
      config: data.config,
      secret_ref: template.secretEnv,
      webhook_path: data.webhook_path?.trim() || defaultWebhookPath(data.code),
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: id, error } = await supabaseAdmin.rpc("request_settings_change", {
      _kind: "payment_config" as never,
      _payload: payload as never,
      _summary: data.summary,
    });
    if (error) throw new Error(error.message);

    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as { email?: string } | null)?.email ?? null,
      action: "payments.config.change_requested",
      target: data.code,
      meta: { mode: data.mode, enabled: data.enabled, fields: Object.keys(data.config) },
    });
    return { id: id as string };
  });

/** Credential / webhook readiness checks for one provider. Requires payments.view. */
export const getPaymentReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().trim().min(2).max(40) }).parse(d))
  .handler(async ({ data, context }): Promise<ReadinessReport> => {
    await assertPaymentsPermission(context.supabase, "view");
    return buildReadinessReport(data.code);
  });

/** End-to-end dry run: create a test intent, then process a signed callback. */
export const runPaymentSelfTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().trim().min(2).max(40) }).parse(d))
  .handler(async ({ data, context }): Promise<SelfTestResult> => {
    await assertPaymentsPermission(context.supabase, "manage");
    const result = await runProviderSelfTest(data.code, context.userId);
    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as { email?: string } | null)?.email ?? null,
      action: "payments.config.self_test",
      target: data.code,
      meta: { passed: result.passed, reference: result.reference, steps: result.steps.length },
    });
    return result;
  });
