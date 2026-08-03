/**
 * Security alert configuration reads and writes.
 *
 * Gated on the database permission matrix: `security.view` to read the current
 * configuration, `security.manage` to change it or fire a test alert. Every
 * change is written to the audit trail through the trusted `writeAudit` path.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit } from "@/lib/audit-log";
import { assertSecurityPermission, canManageSecurity } from "@/lib/security-centre.server";
import { ALERT_DEFAULTS, type SecurityAlertSettings } from "@/lib/security-alerts.server";

export type { SecurityAlertSettings };

export const ALERT_CHANNELS = [
  { key: "in_app", label: "In-app", hint: "Notification centre entry for each recipient" },
  { key: "email", label: "Email", hint: "Queued to the notification outbox" },
  { key: "sms", label: "SMS", hint: "Only reaches officers with a phone number on file" },
] as const;

export const ALERT_ROLES = [
  { key: "super_admin", label: "Super admin" },
  { key: "admin", label: "Admin" },
  { key: "manager", label: "Manager" },
  { key: "compliance_officer", label: "Compliance officer" },
  { key: "finance_officer", label: "Finance officer" },
  { key: "loan_officer", label: "Loan officer" },
  { key: "auditor", label: "Auditor" },
] as const;

export const ALERT_SEVERITIES = [
  { key: "info", label: "All events (info and above)" },
  { key: "warning", label: "Warning and critical only" },
  { key: "critical", label: "Critical only" },
] as const;

const Schema = z.object({
  enabled: z.boolean(),
  channels: z.array(z.enum(["in_app", "email", "sms"])).min(1, "Pick at least one channel"),
  notify_roles: z
    .array(z.enum(ALERT_ROLES.map((r) => r.key) as [string, ...string[]]))
    .min(1, "Pick at least one recipient role"),
  audit_alerts_enabled: z.boolean(),
  audit_min_severity: z.enum(["info", "warning", "critical"]),
  audit_action_prefixes: z.array(z.string().trim().min(2).max(80)).max(20),
  upload_alerts_enabled: z.boolean(),
  rate_limit_alerts_enabled: z.boolean(),
  throttle_minutes: z.number().int().min(0).max(1440),
});

export const getSecurityAlertSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSecurityPermission(context.supabase, "view");
    const { data, error } = await context.supabase
      .from("security_alert_settings")
      .select(
        "enabled, channels, notify_roles, audit_alerts_enabled, audit_min_severity, audit_action_prefixes, upload_alerts_enabled, rate_limit_alerts_enabled, throttle_minutes, updated_at",
      )
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      settings: ((data as SecurityAlertSettings | null) ?? ALERT_DEFAULTS) as SecurityAlertSettings,
      canManage: await canManageSecurity(context.supabase),
    };
  });

export const updateSecurityAlertSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Schema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSecurityPermission(context.supabase, "manage");
    const { error } = await context.supabase
      .from("security_alert_settings")
      .update({ ...data, updated_by: context.userId } as never)
      .eq("id", true);
    if (error) throw new Error(error.message);
    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as { email?: string } | null)?.email ?? null,
      action: "security.alert_settings.updated",
      target: "security_alert_settings",
      meta: data,
    });
    return { ok: true as const };
  });

/** Fires one alert through the live configuration so officers can verify delivery. */
export const sendTestSecurityAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ kind: z.enum(["audit", "upload_blocked", "rate_limit"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSecurityPermission(context.supabase, "manage");
    const { dispatchSecurityAlert } = await import("@/lib/security-alerts.server");
    const result = await dispatchSecurityAlert({
      kind: data.kind,
      severity: "warning",
      title: `Test security alert (${data.kind}) — ${new Date().toISOString()}`,
      body: "Configuration test fired from the Security Centre. No action required.",
      link: "/admin/security/alerts",
      meta: { test: true, requested_by: context.userId },
    });
    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as { email?: string } | null)?.email ?? null,
      action: "security.alert.test_sent",
      target: data.kind,
      meta: result as unknown as Record<string, unknown>,
    });
    return result;
  });
