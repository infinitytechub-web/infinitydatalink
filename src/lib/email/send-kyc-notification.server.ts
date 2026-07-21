import * as React from "react";
import { render } from "@react-email/render";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { TEMPLATES } from "@/lib/email-templates/registry";

const SITE_NAME = "IT-360 CashApp";
const SENDER_DOMAIN = "notify.infinitydatalink.com";
const FROM_DOMAIN = "notify.infinitydatalink.com";
const APP_ORIGIN = "https://infinity-wealth360.lovable.app";

type Decision = "approved" | "rejected";

export interface SendKycNotificationInput {
  memberId: string;
  decision: Decision;
  reviewerNote?: string | null;
  reviewedAt: string; // ISO
}

function serviceClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? (import.meta as any).env?.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Renders the KYC decision email and enqueues it for the queue processor.
 * Never throws — returns a summary so callers can log and continue.
 * `authenticatedSupabase` is used to insert the audit row so RLS attributes
 * it to the admin caller. The service-role client is used for the pgmq
 * enqueue + send-log write (both are server-only tables).
 */
export async function sendKycDecisionEmail(
  authenticatedSupabase: SupabaseClient,
  input: SendKycNotificationInput,
): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  const admin = serviceClient();
  if (!admin) {
    return { ok: false, error: "email service not configured" };
  }

  // Fetch recipient details (email lives in auth.users; name in profiles).
  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("id", input.memberId)
    .maybeSingle();
  if (pErr || !profile) {
    return { ok: false, error: pErr?.message ?? "member not found" };
  }
  const { data: userInfo } = await admin.auth.admin.getUserById(input.memberId);
  const recipient = userInfo?.user?.email ?? null;
  if (!recipient) {
    return { ok: false, skipped: "no email on record" };
  }

  // Suppression check
  const { data: suppressed } = await admin
    .from("suppressed_emails")
    .select("email")
    .eq("email", recipient.toLowerCase())
    .maybeSingle();
  if (suppressed) {
    await authenticatedSupabase.from("kyc_notifications").insert({
      member_id: input.memberId,
      channel: "email",
      decision: input.decision,
      recipient,
      subject: null,
      status: "failed",
      error: "recipient suppressed",
    });
    return { ok: false, skipped: "recipient suppressed" };
  }

  const templateName = input.decision === "approved" ? "kyc-approved" : "kyc-rejected";
  const entry = TEMPLATES[templateName];
  if (!entry) {
    return { ok: false, error: `template ${templateName} not registered` };
  }
  const subject =
    typeof entry.subject === "function" ? entry.subject({}) : entry.subject;

  const props =
    input.decision === "approved"
      ? {
          siteName: "IT-360 CashApp",
          memberName: profile.full_name ?? undefined,
          appUrl: `${APP_ORIGIN}/app/kyc`,
        }
      : {
          siteName: "IT-360 CashApp",
          memberName: profile.full_name ?? undefined,
          reviewerNote: input.reviewerNote ?? undefined,
          appUrl: `${APP_ORIGIN}/app/profile`,
        };

  let html: string;
  let text: string;
  try {
    const element = React.createElement(entry.component, props);
    html = await render(element);
    text = await render(element, { plainText: true });
  } catch (err: any) {
    return { ok: false, error: `render failed: ${err?.message ?? String(err)}` };
  }

  const messageId = `kyc-${input.decision}-${input.memberId}-${new Date(input.reviewedAt).getTime()}`;

  // Insert notification row (RLS: admin caller)
  const { data: notif, error: nErr } = await authenticatedSupabase
    .from("kyc_notifications")
    .insert({
      member_id: input.memberId,
      channel: "email",
      decision: input.decision,
      recipient,
      subject,
      status: "queued",
      message_id: messageId,
    })
    .select("id")
    .maybeSingle();
  if (nErr) {
    return { ok: false, error: `notification insert: ${nErr.message}` };
  }

  // Pending send log (service role)
  await admin.from("email_send_log").insert({
    message_id: messageId,
    template_name: templateName,
    recipient_email: recipient,
    status: "pending",
  });

  // Enqueue via pgmq wrapper
  const { error: qErr } = await admin.rpc("enqueue_email", {
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
      label: templateName,
      queued_at: new Date().toISOString(),
    },
  });

  if (qErr) {
    if (notif?.id) {
      await authenticatedSupabase
        .from("kyc_notifications")
        .update({ status: "failed", error: qErr.message })
        .eq("id", notif.id);
    }
    await admin.from("email_send_log").insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: recipient,
      status: "failed",
      error_message: qErr.message,
    });
    return { ok: false, error: qErr.message };
  }

  return { ok: true };
}
