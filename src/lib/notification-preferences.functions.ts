import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const NOTIFICATION_CATEGORIES = [
  { key: "account.registration.approved", label: "Registration approved" },
  { key: "account.registration.rejected", label: "Registration declined" },
  { key: "account.kyc.approved", label: "KYC verification approved" },
  { key: "account.kyc.rejected", label: "KYC verification declined" },
  { key: "loan.approved", label: "Loan approved" },
  { key: "loan.rejected", label: "Loan declined" },
  { key: "loan.disbursed", label: "Loan disbursed" },
  { key: "loan.installment.due", label: "Installment due soon" },
  { key: "loan.installment.overdue", label: "Installment overdue" },
  { key: "savings.goal", label: "Savings goal milestones" },
  { key: "savings.withdrawal.approved", label: "Withdrawal approved" },
  { key: "savings.withdrawal.paid", label: "Withdrawal paid" },
  { key: "savings.withdrawal.rejected", label: "Withdrawal declined" },
  { key: "savings.withdrawal.cancelled", label: "Withdrawal cancelled" },
] as const;

export type NotificationPreferences = {
  in_app: boolean;
  email: boolean;
  sms: boolean;
  muted_categories: string[];
};

export type OutboxEntry = {
  id: string;
  channel: "email" | "sms";
  category: string;
  title: string;
  status: string;
  attempts: number;
  error: string | null;
  sent_at: string | null;
  created_at: string;
};

const DEFAULTS: NotificationPreferences = {
  in_app: true,
  email: true,
  sms: false,
  muted_categories: [],
};

export const getMyNotificationSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: prefs, error } = await context.supabase
      .from("notification_preferences")
      .select("in_app, email, sms, muted_categories")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const { data: outbox, error: oErr } = await context.supabase
      .from("notification_outbox")
      .select("id, channel, category, title, status, attempts, error, sent_at, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (oErr) throw new Error(oErr.message);

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("phone")
      .eq("id", context.userId)
      .maybeSingle();

    return {
      preferences: (prefs as NotificationPreferences | null) ?? DEFAULTS,
      deliveries: (outbox ?? []) as OutboxEntry[],
      hasPhone: Boolean(profile?.phone),
    };
  });

const UpdateSchema = z.object({
  in_app: z.boolean(),
  email: z.boolean(),
  sms: z.boolean(),
  muted_categories: z.array(z.string().min(1).max(64)).max(50),
});

export const updateMyNotificationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const allowed = new Set(NOTIFICATION_CATEGORIES.map((c) => c.key));
    const muted = Array.from(new Set(data.muted_categories.filter((c) => allowed.has(c as never))));

    const { error } = await context.supabase
      .from("notification_preferences")
      .upsert(
        {
          user_id: context.userId,
          in_app: data.in_app,
          email: data.email,
          sms: data.sms,
          muted_categories: muted,
        },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
