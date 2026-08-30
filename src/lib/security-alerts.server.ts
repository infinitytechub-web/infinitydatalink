/**
 * Configurable security alerting.
 *
 * Three signals can raise an alert to staff: a new audit event, a blocked or
 * quarantined file upload, and a rate-limit trigger. What is alerted on, which
 * channels are used, which roles are notified and how often the same alert may
 * repeat all come from `public.security_alert_settings` — nothing is hardcoded.
 *
 * Every dispatch is fire-and-forget: alerting must never roll back or break the
 * security event that produced it.
 */
import { notifyStaff, type NotifyChannel } from "./notify.server";
import { severityFor, type Json } from "./security-centre.server";

import type { AlertKind, AlertSeverity, SecurityAlertSettings } from "./security-alerts.types";

export type { AlertKind, AlertSeverity, SecurityAlertSettings };

export const ALERT_DEFAULTS: SecurityAlertSettings = {
  enabled: true,
  channels: ["in_app", "email"],
  notify_roles: ["super_admin", "compliance_officer"],
  audit_alerts_enabled: true,
  audit_min_severity: "critical",
  audit_action_prefixes: [],
  upload_alerts_enabled: true,
  rate_limit_alerts_enabled: true,
  throttle_minutes: 15,
  updated_at: null,
};

const SEVERITY_RANK: Record<AlertSeverity, number> = { info: 0, warning: 1, critical: 2 };

const CATEGORY: Record<AlertKind, string> = {
  audit: "security.alert.audit_event",
  upload_blocked: "security.alert.upload_blocked",
  rate_limit: "security.alert.rate_limit",
};

function normaliseChannels(value: unknown): NotifyChannel[] {
  const allowed: NotifyChannel[] = ["in_app", "email", "sms"];
  const list = Array.isArray(value) ? value : [];
  const picked = allowed.filter((c) => list.includes(c));
  return picked.length > 0 ? picked : ["in_app"];
}

/** Reads the singleton settings row with the service-role client. */
export async function loadAlertSettings(): Promise<SecurityAlertSettings> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("security_alert_settings")
      .select("*")
      .maybeSingle();
    if (error || !data) return ALERT_DEFAULTS;
    const row = data as Record<string, unknown>;
    return {
      enabled: row["enabled"] !== false,
      channels: normaliseChannels(row["channels"]),
      notify_roles: Array.isArray(row["notify_roles"])
        ? (row["notify_roles"] as string[])
        : ALERT_DEFAULTS.notify_roles,
      audit_alerts_enabled: row["audit_alerts_enabled"] !== false,
      audit_min_severity: (row["audit_min_severity"] as AlertSeverity) ?? "critical",
      audit_action_prefixes: Array.isArray(row["audit_action_prefixes"])
        ? (row["audit_action_prefixes"] as string[]).filter(Boolean)
        : [],
      upload_alerts_enabled: row["upload_alerts_enabled"] !== false,
      rate_limit_alerts_enabled: row["rate_limit_alerts_enabled"] !== false,
      throttle_minutes: Number(row["throttle_minutes"] ?? 15),
      updated_at: (row["updated_at"] as string | null) ?? null,
    };
  } catch (err) {
    console.error("loadAlertSettings failed", (err as Error)?.message);
    return ALERT_DEFAULTS;
  }
}

/** True when an identical alert already went out inside the throttle window. */
async function throttled(
  category: string,
  title: string,
  throttleMinutes: number,
): Promise<boolean> {
  if (throttleMinutes <= 0) return false;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cutoff = new Date(Date.now() - throttleMinutes * 60_000).toISOString();
    const { data } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .eq("category", category)
      .eq("title", title)
      .gte("created_at", cutoff)
      .limit(1);
    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}

/** Core dispatch: honours the stored configuration and returns what happened. */
export async function dispatchSecurityAlert(input: {
  kind: AlertKind;
  title: string;
  body?: string | null;
  link?: string | null;
  severity?: AlertSeverity;
  meta?: Record<string, unknown>;
  /** Never notify this user (usually the acting officer). */
  excludeUserId?: string | null;
  settings?: SecurityAlertSettings;
}): Promise<{ sent: boolean; reason?: string; recipients?: number; channels?: NotifyChannel[] }> {
  try {
    const settings = input.settings ?? (await loadAlertSettings());
    if (!settings.enabled) return { sent: false, reason: "alerting_disabled" };
    if (input.kind === "audit" && !settings.audit_alerts_enabled)
      return { sent: false, reason: "audit_alerts_disabled" };
    if (input.kind === "upload_blocked" && !settings.upload_alerts_enabled)
      return { sent: false, reason: "upload_alerts_disabled" };
    if (input.kind === "rate_limit" && !settings.rate_limit_alerts_enabled)
      return { sent: false, reason: "rate_limit_alerts_disabled" };
    if (settings.notify_roles.length === 0) return { sent: false, reason: "no_recipient_roles" };

    const category = CATEGORY[input.kind];
    if (await throttled(category, input.title, settings.throttle_minutes))
      return { sent: false, reason: "throttled" };

    const result = await notifyStaff({
      roles: settings.notify_roles,
      category,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? "/admin/security",
      meta: { kind: input.kind, severity: input.severity ?? "warning", ...(input.meta ?? {}) },
      dedupeKey: `${category}:${input.title}:${Math.floor(
        Date.now() / Math.max(60_000, settings.throttle_minutes * 60_000),
      )}`,
      channels: settings.channels,
      excludeUserId: input.excludeUserId ?? null,
    });

    return { sent: result.ok, recipients: result.recipients, channels: settings.channels };
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    console.error(`dispatchSecurityAlert threw [${input.kind}]`, message);
    return { sent: false, reason: message };
  }
}

type AuditRow = {
  action: string;
  actor_email?: string | null;
  actor_role?: string | null;
  target?: string | null;
  meta?: Record<string, unknown> | null;
};

/** Skip alerting on the notification plumbing's own bookkeeping. */
function isAlertNoise(action: string): boolean {
  return action.startsWith("security.alert");
}

/**
 * Called from the trusted audit write path. Evaluates each row against the
 * configured minimum severity and action prefixes, then alerts on matches.
 */
export async function alertOnAuditEvents(rows: AuditRow[]): Promise<void> {
  try {
    const candidates = rows.filter((r) => r.action && !isAlertNoise(r.action));
    if (candidates.length === 0) return;

    const settings = await loadAlertSettings();
    if (!settings.enabled || !settings.audit_alerts_enabled) return;

    const floor = SEVERITY_RANK[settings.audit_min_severity];
    for (const row of candidates) {
      const meta = (row.meta ?? {}) as Record<string, Json>;
      if (
        settings.audit_action_prefixes.length > 0 &&
        !settings.audit_action_prefixes.some((p) => row.action.startsWith(p))
      )
        continue;
      const severity = severityFor(row.action, meta);
      if (SEVERITY_RANK[severity] < floor) continue;

      const actor = row.actor_email ?? row.actor_role ?? "system";
      await dispatchSecurityAlert({
        kind: "audit",
        severity,
        title: `${severity === "critical" ? "Critical" : "Security"} audit event: ${row.action}`,
        body: `${actor} performed ${row.action}${row.target ? ` on ${row.target}` : ""}.`,
        link: "/admin/security",
        meta: { action: row.action, target: row.target ?? null, actor },
        settings,
      });
    }
  } catch (err) {
    console.error("alertOnAuditEvents failed", (err as Error)?.message);
  }
}

/**
 * Records an upload scan verdict and alerts staff when the file was blocked or
 * quarantined. Use this as the single write path for `upload_scan_log`.
 */
export async function recordUploadScan(input: {
  uploaderId?: string | null;
  filename: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  verdict: "clean" | "blocked" | "quarantined";
  reasons?: string[];
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("upload_scan_log").insert({
      user_id: input.uploaderId ?? null,
      filename: input.filename,
      mime_type: input.mimeType ?? null,
      size_bytes: input.sizeBytes ?? null,
      verdict: input.verdict,
      reasons: input.reasons ?? [],
    } as never);
    if (error) console.error("upload_scan_log insert failed", error.message);
  } catch (err) {
    console.error("recordUploadScan failed", (err as Error)?.message);
  }

  if (input.verdict === "clean") return;
  await dispatchSecurityAlert({
    kind: "upload_blocked",
    severity: input.verdict === "blocked" ? "critical" : "warning",
    title: `Upload ${input.verdict}: ${input.filename}`,
    body: `A file upload was ${input.verdict}${
      (input.reasons ?? []).length > 0 ? ` — ${(input.reasons ?? []).join("; ")}` : ""
    }.`,
    link: "/admin/security/uploads",
    meta: {
      filename: input.filename,
      mime_type: input.mimeType ?? null,
      size_bytes: input.sizeBytes ?? null,
      reasons: input.reasons ?? [],
      verdict: input.verdict,
    },
    excludeUserId: input.uploaderId ?? null,
  });
}

/** Records a rate-limit trigger in the audit trail and alerts staff. */
export async function recordRateLimitTrigger(input: {
  scope: string;
  userId?: string | null;
  ip?: string | null;
  windowSeconds: number;
  maxRequests: number;
  observedRequests?: number;
}): Promise<void> {
  const detail = `${input.observedRequests ?? input.maxRequests + 1} requests in ${
    input.windowSeconds
  }s (limit ${input.maxRequests})`;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("audit_log").insert({
      actor_id: input.userId ?? null,
      actor_role: null,
      action: "security.rate_limit.triggered",
      target: input.scope,
      meta: {
        scope: input.scope,
        ip: input.ip ?? null,
        window_seconds: input.windowSeconds,
        max_requests: input.maxRequests,
        observed_requests: input.observedRequests ?? null,
      },
    } as never);
    if (error) console.error("rate limit audit insert failed", error.message);
  } catch (err) {
    console.error("recordRateLimitTrigger audit failed", (err as Error)?.message);
  }

  await dispatchSecurityAlert({
    kind: "rate_limit",
    severity: "warning",
    title: `Rate limit triggered: ${input.scope}`,
    body: `The ${input.scope} rate limit was exceeded — ${detail}.`,
    link: "/admin/security/firewall",
    meta: {
      scope: input.scope,
      ip: input.ip ?? null,
      window_seconds: input.windowSeconds,
      max_requests: input.maxRequests,
      observed_requests: input.observedRequests ?? null,
    },
    excludeUserId: input.userId ?? null,
  });
}
