import * as React from "react";
import { render } from "@react-email/render";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { TEMPLATES } from "@/lib/email-templates/registry";

const SITE_NAME = "IT-360 CashApp";
const SENDER_DOMAIN = "notify.infinitydatalink.com";
const FROM_DOMAIN = "notify.infinitydatalink.com";
const APP_ORIGIN = "https://it-360cashapp.lovable.app";
const TEMPLATE_NAME = "account-alert";

export interface OutboxRow {
  id: string;
  user_id: string;
  channel: "email" | "sms";
  category: string;
  title: string;
  body: string | null;
  link: string | null;
  attempts: number;
}

export interface DispatchResult {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}

function serviceClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function sendEmail(
  admin: SupabaseClient,
  row: OutboxRow,
  recipient: string,
  memberName: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const entry = TEMPLATES[TEMPLATE_NAME];
  if (!entry) return { ok: false, error: "account-alert template not registered" };

  const { data: suppressed } = await admin
    .from("suppressed_emails")
    .select("email")
    .eq("email", recipient.toLowerCase())
    .maybeSingle();
  if (suppressed) return { ok: false, error: "recipient suppressed" };

  const props = {
    siteName: SITE_NAME,
    memberName: memberName ?? undefined,
    heading: row.title,
    message: row.body ?? row.title,
    appUrl: `${APP_ORIGIN}${row.link ?? "/app"}`,
  };
  const subject = typeof entry.subject === "function" ? entry.subject(props) : entry.subject;

  let html: string;
  let text: string;
  try {
    const element = React.createElement(entry.component, props);
    html = await render(element);
    text = await render(element, { plainText: true });
  } catch (err: any) {
    return { ok: false, error: `render failed: ${err?.message ?? String(err)}` };
  }

  const messageId = `notify-${row.id}`;
  await admin.from("email_send_log").insert({
    message_id: messageId,
    template_name: TEMPLATE_NAME,
    recipient_email: recipient,
    status: "pending",
  });

  const { error } = await admin.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: messageId,
      idempotency_key: messageId,
      to: recipient,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text,
      purpose: "transactional",
      label: `${TEMPLATE_NAME}:${row.category}`,
      queued_at: new Date().toISOString(),
    },
  });
  if (error) {
    await admin.from("email_send_log").insert({
      message_id: messageId,
      template_name: TEMPLATE_NAME,
      recipient_email: recipient,
      status: "failed",
      error_message: error.message,
    });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

async function sendSms(row: OutboxRow, phone: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!phone) return { ok: false, error: "no phone number on record" };

  const lovableKey = process.env.LOVABLE_API_KEY;
  const twilioKey = process.env.TWILIO_API_KEY;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!lovableKey || !twilioKey || !from) {
    return { ok: false, error: "sms provider not configured" };
  }

  const message = `${SITE_NAME}: ${row.title}${row.body ? ` — ${row.body}` : ""}`.slice(0, 320);
  const res = await fetch("https://connector-gateway.lovable.dev/twilio/Messages.json", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": twilioKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: phone, From: from, Body: message }),
  });
  if (!res.ok) {
    const detail = await res.text();
    return { ok: false, error: `sms provider [${res.status}]: ${detail.slice(0, 300)}` };
  }
  return { ok: true };
}

/**
 * Drains pending rows from `notification_outbox` and delivers them through the
 * email queue or the SMS provider. Never throws — every row records its own
 * outcome so a single bad recipient cannot stall the batch.
 */
export async function dispatchNotificationOutbox(limit = 50): Promise<DispatchResult> {
  const admin = serviceClient();
  if (!admin) throw new Error("notification dispatch not configured");

  const { data, error } = await admin
    .from("notification_outbox")
    .select("id, user_id, channel, category, title, body, link, attempts")
    .eq("status", "pending")
    .lt("attempts", 5)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as OutboxRow[];
  const result: DispatchResult = { processed: rows.length, sent: 0, failed: 0, skipped: 0 };

  for (const row of rows) {
    let outcome: { ok: boolean; error?: string };
    try {
      const { data: profile } = await admin
        .from("profiles")
        .select("full_name, phone")
        .eq("id", row.user_id)
        .maybeSingle();

      if (row.channel === "email") {
        const { data: userInfo } = await admin.auth.admin.getUserById(row.user_id);
        const recipient = userInfo?.user?.email ?? null;
        outcome = recipient
          ? await sendEmail(admin, row, recipient, profile?.full_name ?? null)
          : { ok: false, error: "no email on record" };
      } else {
        outcome = await sendSms(row, profile?.phone ?? null);
      }
    } catch (err: any) {
      outcome = { ok: false, error: err?.message ?? String(err) };
    }

    const attempts = row.attempts + 1;
    const unrecoverable =
      !outcome.ok &&
      /not configured|no email on record|no phone number|suppressed|not registered/i.test(outcome.error ?? "");
    const status = outcome.ok ? "sent" : unrecoverable || attempts >= 5 ? "skipped" : "pending";

    await admin
      .from("notification_outbox")
      .update({
        status,
        attempts,
        error: outcome.ok ? null : (outcome.error ?? "unknown error"),
        sent_at: outcome.ok ? new Date().toISOString() : null,
      })
      .eq("id", row.id);

    if (outcome.ok) result.sent += 1;
    else if (status === "skipped") result.skipped += 1;
    else result.failed += 1;
  }

  return result;
}
