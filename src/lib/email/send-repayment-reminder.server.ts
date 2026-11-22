import * as React from "react";
import { render } from "@react-email/render";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TEMPLATES } from "@/lib/email-templates/registry";

const SITE_NAME = "IT-360 CashApp";
const SENDER_DOMAIN = "notify.infinitydatalink.com";
const FROM_DOMAIN = "notify.infinitydatalink.com";
const APP_ORIGIN = "https://infinitydatalink.com";

export type ReminderEmailInput = {
  to: string;
  memberName: string | null;
  loanRef: string;
  installmentNo: number;
  amount: number;
  dueDate: string;
  overdue: boolean;
  messageId: string;
};

function randomToken() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Queue one repayment reminder email. Never throws; returns a status label. */
export async function queueRepaymentReminderEmail(
  admin: SupabaseClient,
  input: ReminderEmailInput,
): Promise<"queued" | "suppressed" | "failed"> {
  try {
    const email = input.to.toLowerCase();
    const { data: suppressed } = await admin
      .from("suppressed_emails")
      .select("email")
      .eq("email", email)
      .maybeSingle();
    if (suppressed) return "suppressed";

    let { data: tok } = await admin
      .from("email_unsubscribe_tokens")
      .select("token, used_at")
      .eq("email", email)
      .maybeSingle();
    if (!tok) {
      await admin
        .from("email_unsubscribe_tokens")
        .upsert({ token: randomToken(), email }, { onConflict: "email", ignoreDuplicates: true });
      ({ data: tok } = await admin
        .from("email_unsubscribe_tokens")
        .select("token, used_at")
        .eq("email", email)
        .maybeSingle());
    }
    if (!tok || tok.used_at) return "suppressed";

    const entry = TEMPLATES["repayment-reminder"]!;
    const props = {
      siteName: SITE_NAME,
      memberName: input.memberName ?? undefined,
      loanRef: input.loanRef,
      installmentNo: input.installmentNo,
      amount: input.amount.toFixed(2),
      dueDate: new Date(`${input.dueDate}T00:00:00Z`).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }),
      overdue: input.overdue,
      appUrl: `${APP_ORIGIN}/app/repayments`,
    };
    const element = React.createElement(entry.component, props);
    const html = await render(element);
    const text = await render(element, { plainText: true });
    const subject = typeof entry.subject === "function" ? entry.subject(props) : entry.subject;

    await admin.from("email_send_log").insert({
      message_id: input.messageId,
      template_name: "repayment-reminder",
      recipient_email: input.to,
      status: "pending",
    });
    const { error } = await admin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: input.messageId,
        idempotency_key: input.messageId,
        to: input.to,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: "transactional",
        label: "repayment-reminder",
        unsubscribe_token: tok.token,
        queued_at: new Date().toISOString(),
      },
    } as never);
    if (error) {
      await admin.from("email_send_log").insert({
        message_id: input.messageId,
        template_name: "repayment-reminder",
        recipient_email: input.to,
        status: "failed",
        error_message: error.message,
      });
      return "failed";
    }
    return "queued";
  } catch (e) {
    console.error("repayment reminder email failed", (e as Error).message);
    return "failed";
  }
}
