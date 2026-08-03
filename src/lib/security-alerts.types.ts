/** Client-safe types for the configurable security alerting feature. */
export type AlertKind = "audit" | "upload_blocked" | "rate_limit";
export type AlertSeverity = "info" | "warning" | "critical";
export type AlertChannel = "in_app" | "email" | "sms";

export type SecurityAlertSettings = {
  enabled: boolean;
  channels: AlertChannel[];
  notify_roles: string[];
  audit_alerts_enabled: boolean;
  audit_min_severity: AlertSeverity;
  audit_action_prefixes: string[];
  upload_alerts_enabled: boolean;
  rate_limit_alerts_enabled: boolean;
  throttle_minutes: number;
  updated_at: string | null;
};
