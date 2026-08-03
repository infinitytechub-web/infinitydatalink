/**
 * Client-safe helpers for change-approval SLA reminders.
 *
 * A pending change request is "waiting" from the moment it is raised until a
 * second reviewer approves or rejects it. Two configurable thresholds describe
 * how long that is acceptable:
 *
 *   * `warn_after_hours`   — reviewers get a nudge ("due soon").
 *   * `breach_after_hours` — the SLA is broken; escalation roles are pulled in.
 *
 * Reminders repeat at most once per `repeat_hours` per request per stage, so a
 * long-standing request does not spam the notification centre.
 */

export type ChangeSlaChannel = "in_app" | "email" | "sms";

export type ChangeSlaSettings = {
  enabled: boolean;
  warn_after_hours: number;
  breach_after_hours: number;
  repeat_hours: number;
  channels: ChangeSlaChannel[];
  notify_roles: string[];
  escalate_roles: string[];
  notify_requester: boolean;
  updated_at: string | null;
};

export const CHANGE_SLA_DEFAULTS: ChangeSlaSettings = {
  enabled: true,
  warn_after_hours: 12,
  breach_after_hours: 24,
  repeat_hours: 24,
  channels: ["in_app", "email"],
  notify_roles: ["super_admin", "compliance_officer"],
  escalate_roles: ["super_admin"],
  notify_requester: true,
  updated_at: null,
};

/** SLA stage of a single pending request. */
export type SlaStage = "on_track" | "due_soon" | "breached";

export const SLA_STAGE_LABELS: Record<SlaStage, string> = {
  on_track: "Within SLA",
  due_soon: "Due soon",
  breached: "SLA breached",
};

export const SLA_STAGE_TONE: Record<SlaStage, string> = {
  on_track: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  due_soon: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  breached: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

export function hoursWaiting(requestedAt: string, now: Date = new Date()): number {
  const started = new Date(requestedAt).getTime();
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, (now.getTime() - started) / 3_600_000);
}

export function slaStageFor(
  requestedAt: string,
  settings: Pick<ChangeSlaSettings, "warn_after_hours" | "breach_after_hours">,
  now: Date = new Date(),
): SlaStage {
  const waited = hoursWaiting(requestedAt, now);
  if (waited >= settings.breach_after_hours) return "breached";
  if (waited >= settings.warn_after_hours) return "due_soon";
  return "on_track";
}

/** Human phrasing for how long a request has been waiting. */
export function formatWaited(requestedAt: string, now: Date = new Date()): string {
  const waited = hoursWaiting(requestedAt, now);
  if (waited < 1) return `${Math.max(1, Math.round(waited * 60))}m`;
  if (waited < 48) return `${Math.round(waited)}h`;
  return `${Math.floor(waited / 24)}d ${Math.round(waited % 24)}h`;
}

/**
 * Repeat window index — reminders only fire when this number changes, giving
 * one reminder per `repeat_hours` of continued waiting.
 */
export function repeatWindow(waited: number, repeatHours: number): number {
  const size = Math.max(1, repeatHours);
  return Math.floor(waited / size);
}
