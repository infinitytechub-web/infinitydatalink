import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Categories emitted by run_kyc_resubmission_reminders(). */
export const KYC_REMINDER_CATEGORIES = [
  "kyc.resubmission.deadline_soon",
  "kyc.resubmission.final_notice",
  "kyc.resubmission.low_attempts",
  "kyc.resubmission.expired",
] as const;

export const KYC_REMINDER_LABELS: Record<string, string> = {
  "kyc.resubmission.deadline_soon": "Deadline approaching",
  "kyc.resubmission.final_notice": "Final day notice",
  "kyc.resubmission.low_attempts": "Low attempts left",
  "kyc.resubmission.expired": "Window closed",
};

export type ReminderChannel = "in_app" | "email" | "sms";
export type ReminderStatus = "sent" | "failed" | "pending" | "suppressed";

export type KycReminderEvent = {
  id: string;
  category: string;
  channel: ReminderChannel;
  title: string;
  body: string | null;
  link: string | null;
  status: ReminderStatus;
  /** When the reminder was generated. */
  created_at: string;
  /** When delivery completed (email/SMS); null while pending or failed. */
  sent_at: string | null;
  attempts: number;
  error: string | null;
  /** In-app only: when the member opened it. */
  read_at: string | null;
};

function mapOutboxStatus(raw: string | null): ReminderStatus {
  const s = (raw ?? "pending").toLowerCase();
  if (s === "sent") return "sent";
  if (s === "skipped" || s === "suppressed") return "suppressed";
  if (s === "failed" || s === "dlq" || s === "bounced" || s === "error") return "failed";
  return "pending";
}

/**
 * Member-facing delivery log for their own KYC reminder notifications.
 *
 * In-app rows come from `notifications` under the caller's RLS. Email/SMS
 * delivery state lives in `notification_outbox`, which members cannot read
 * directly, so it is fetched with the admin client and hard-filtered to the
 * authenticated caller's own user id.
 */
export const listMyKycReminderEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        status: z.enum(["all", "sent", "failed", "pending"]).optional().default("all"),
        channel: z.enum(["all", "in_app", "email", "sms"]).optional().default("all"),
        page: z.number().int().min(1).optional().default(1),
        page_size: z.number().int().min(5).max(100).optional().default(25),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const categories = [...KYC_REMINDER_CATEGORIES];

    const { data: inApp, error: inAppError } = await context.supabase
      .from("notifications")
      .select("id, category, title, body, link, read_at, created_at")
      .eq("user_id", context.userId)
      .in("category", categories)
      .order("created_at", { ascending: false })
      .limit(500);
    if (inAppError) throw new Error(inAppError.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: outbox, error: outboxError } = await supabaseAdmin
      .from("notification_outbox")
      .select("id, channel, category, title, body, link, status, attempts, error, sent_at, created_at")
      .eq("user_id", context.userId)
      .in("category", categories)
      .order("created_at", { ascending: false })
      .limit(500);
    if (outboxError) throw new Error(outboxError.message);

    const events: KycReminderEvent[] = [
      ...(inApp ?? []).map((r: any) => ({
        id: `in_app:${r.id}`,
        category: r.category as string,
        channel: "in_app" as ReminderChannel,
        title: r.title as string,
        body: (r.body ?? null) as string | null,
        link: (r.link ?? null) as string | null,
        status: "sent" as ReminderStatus,
        created_at: r.created_at as string,
        sent_at: r.created_at as string,
        attempts: 1,
        error: null,
        read_at: (r.read_at ?? null) as string | null,
      })),
      ...(outbox ?? []).map((r: any) => ({
        id: `${r.channel}:${r.id}`,
        category: r.category as string,
        channel: (r.channel === "sms" ? "sms" : "email") as ReminderChannel,
        title: r.title as string,
        body: (r.body ?? null) as string | null,
        link: (r.link ?? null) as string | null,
        status: mapOutboxStatus(r.status as string | null),
        created_at: r.created_at as string,
        sent_at: (r.sent_at ?? null) as string | null,
        attempts: Number(r.attempts ?? 0),
        error: (r.error ?? null) as string | null,
        read_at: null,
      })),
    ]
      .filter((e) => (data.channel === "all" ? true : e.channel === data.channel))
      .filter((e) => {
        if (data.status === "all") return true;
        if (data.status === "failed") return e.status === "failed";
        if (data.status === "sent") return e.status === "sent";
        return e.status === "pending" || e.status === "suppressed";
      })
      .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));

    const summary = {
      total: events.length,
      sent: events.filter((e) => e.status === "sent").length,
      failed: events.filter((e) => e.status === "failed").length,
      pending: events.filter((e) => e.status === "pending" || e.status === "suppressed").length,
      last_sent_at: events.find((e) => e.status === "sent")?.sent_at ?? null,
    };

    const from = (data.page - 1) * data.page_size;
    return {
      rows: events.slice(from, from + data.page_size),
      total: events.length,
      page: data.page,
      page_size: data.page_size,
      summary,
    };
  });
