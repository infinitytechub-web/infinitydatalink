/**
 * Scheduled SLA reminders for pending change approvals.
 *
 * Scans `settings_change_requests` still in `pending`, works out how long each
 * has been waiting, and reminds people according to `change_sla_settings`:
 *
 *   * past `warn_after_hours`   → reviewer roles are nudged,
 *   * past `breach_after_hours` → escalation roles are pulled in as well,
 *   * optionally the requester is copied so they know review is running late.
 *
 * Idempotent: each request/stage pair is reminded at most once per
 * `repeat_hours`, guarded by an existing-notification lookup (in-app) and by
 * outbox dedupe keys (email/SMS). Every reminder batch is written to the audit
 * trail so escalation can be proven after the fact.
 */
import { notifyStaff, notifyUser } from "@/lib/notify.server";
import { writeAudit } from "@/lib/audit-log";
import {
  CHANGE_SLA_DEFAULTS,
  hoursWaiting,
  repeatWindow,
  slaStageFor,
  type ChangeSlaSettings,
  type SlaStage,
} from "@/lib/change-sla";
import { KIND_LABELS, type ChangeKind } from "@/lib/change-approvals";

const CATEGORY = "approvals.sla_reminder";
const REQUESTER_CATEGORY = "approvals.sla_requester";

export type SlaReminderItem = {
  request_id: string;
  kind: ChangeKind;
  summary: string | null;
  waited_hours: number;
  stage: Exclude<SlaStage, "on_track">;
  reviewers_notified: number;
  requester_notified: boolean;
  skipped_recent: boolean;
};

export type SlaReminderResult = {
  enabled: boolean;
  scanned: number;
  due_soon: number;
  breached: number;
  reminders_sent: number;
  reviewers_notified: number;
  items: SlaReminderItem[];
};

export async function loadChangeSlaSettings(): Promise<ChangeSlaSettings> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("change_sla_settings")
    .select(
      "enabled, warn_after_hours, breach_after_hours, repeat_hours, channels, notify_roles, escalate_roles, notify_requester, updated_at",
    )
    .maybeSingle();
  return { ...CHANGE_SLA_DEFAULTS, ...((data ?? {}) as Partial<ChangeSlaSettings>) };
}

/** Runs one reminder pass. Safe to call repeatedly (cron, or manually by an admin). */
export async function runChangeSlaReminders(
  options: { actorId?: string | null; actorEmail?: string | null } = {},
): Promise<SlaReminderResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sb = supabaseAdmin as any;
  const settings = await loadChangeSlaSettings();
  const now = new Date();

  const result: SlaReminderResult = {
    enabled: settings.enabled,
    scanned: 0,
    due_soon: 0,
    breached: 0,
    reminders_sent: 0,
    reviewers_notified: 0,
    items: [],
  };
  if (!settings.enabled) return result;

  const { data, error } = await sb
    .from("settings_change_requests")
    .select("id, kind, summary, requested_by, requested_at")
    .eq("status", "pending")
    .order("requested_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<Record<string, any>>;
  result.scanned = rows.length;

  for (const row of rows) {
    const requestedAt = row["requested_at"] as string;
    const stage = slaStageFor(requestedAt, settings, now);
    if (stage === "on_track") continue;

    const waited = hoursWaiting(requestedAt, now);
    if (stage === "breached") result.breached += 1;
    else result.due_soon += 1;

    const id = row["id"] as string;
    const kind = row["kind"] as ChangeKind;
    const summary = (row["summary"] as string | null) ?? null;
    const link = `/admin/change-approvals/${id}`;
    const window = repeatWindow(waited, settings.repeat_hours);
    const dedupeKey = `${CATEGORY}:${id}:${stage}:${window}`;

    // Already reminded inside this repeat window? Skip without touching anybody.
    const { data: seen } = await sb
      .from("notifications")
      .select("id")
      .eq("category", CATEGORY)
      .eq("link", link)
      .gte("created_at", new Date(now.getTime() - settings.repeat_hours * 3_600_000).toISOString())
      .limit(1);
    if (((seen ?? []) as any[]).length > 0) {
      result.items.push({
        request_id: id,
        kind,
        summary,
        waited_hours: Math.round(waited * 10) / 10,
        stage,
        reviewers_notified: 0,
        requester_notified: false,
        skipped_recent: true,
      });
      continue;
    }

    const label = KIND_LABELS[kind] ?? kind;
    const waitedText = `${Math.round(waited)}h`;
    const roles =
      stage === "breached"
        ? Array.from(new Set([...settings.notify_roles, ...settings.escalate_roles]))
        : settings.notify_roles;

    const staff = await notifyStaff({
      roles,
      category: CATEGORY,
      title:
        stage === "breached"
          ? `SLA breached — change approval waiting ${waitedText}`
          : `Change approval waiting ${waitedText} — review due soon`,
      body: `${label}${summary ? ` — ${summary}` : ""} has been pending review for ${waitedText}. The SLA target is ${
        stage === "breached" ? settings.breach_after_hours : settings.warn_after_hours
      }h. Open the request to approve or reject it.`,
      link,
      meta: { request_id: id, kind, stage, waited_hours: waited, window },
      dedupeKey,
      channels: settings.channels,
    });

    let requesterNotified = false;
    if (settings.notify_requester && row["requested_by"]) {
      const fan = await notifyUser({
        userId: row["requested_by"] as string,
        category: REQUESTER_CATEGORY,
        title:
          stage === "breached"
            ? `Your change request is past its review SLA (${waitedText})`
            : `Your change request is still awaiting review (${waitedText})`,
        body: `${label}${summary ? ` — ${summary}` : ""} has not been reviewed yet. Reviewers have been reminded.`,
        link,
        meta: { request_id: id, kind, stage, waited_hours: waited },
        dedupeKey: `${REQUESTER_CATEGORY}:${id}:${stage}:${window}`,
        channels: settings.channels,
      });
      requesterNotified = fan.delivered.length > 0;
    }

    result.reminders_sent += 1;
    result.reviewers_notified += staff.recipients;
    result.items.push({
      request_id: id,
      kind,
      summary,
      waited_hours: Math.round(waited * 10) / 10,
      stage,
      reviewers_notified: staff.recipients,
      requester_notified: requesterNotified,
      skipped_recent: false,
    });
  }

  if (result.reminders_sent > 0) {
    await writeAudit({
      actor_id: options.actorId ?? null,
      actor_email: options.actorEmail ?? null,
      action: "settings.change.sla_reminded",
      target: "settings_change_requests",
      meta: {
        reminders_sent: result.reminders_sent,
        due_soon: result.due_soon,
        breached: result.breached,
        reviewers_notified: result.reviewers_notified,
        requests: result.items.filter((i) => !i.skipped_recent).map((i) => i.request_id),
      },
    });
  }

  return result;
}
