import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdminOutboxRow = {
  id: string;
  user_id: string;
  channel: "email" | "sms";
  category: string;
  title: string;
  body: string | null;
  status: string;
  attempts: number;
  error: string | null;
  sent_at: string | null;
  created_at: string;
};

const FilterSchema = z.object({
  status: z.enum(["all", "pending", "sent", "failed", "skipped"]).default("all"),
  channel: z.enum(["all", "email", "sms"]).default("all"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(10).max(100).default(25),
});

async function assertStaff(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles: string[] = (data ?? []).map((r: any) => String(r.role));
  const allowed = ["super_admin", "compliance_officer", "auditor", "finance_officer", "loan_officer"];
  if (!roles.some((r: string) => allowed.includes(r))) throw new Error("Forbidden");
  return roles;
}

export const adminListNotificationOutbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FilterSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);

    let query = context.supabase
      .from("notification_outbox")
      .select("id, user_id, channel, category, title, body, status, attempts, error, sent_at, created_at", {
        count: "exact",
      })
      .order("created_at", { ascending: false });

    if (data.status !== "all") query = query.eq("status", data.status);
    if (data.channel !== "all") query = query.eq("channel", data.channel);

    const from = (data.page - 1) * data.pageSize;
    query = query.range(from, from + data.pageSize - 1);

    const { data: rows, count, error } = await query;
    if (error) throw new Error(error.message);

    return { rows: (rows ?? []) as AdminOutboxRow[], total: count ?? 0, page: data.page, pageSize: data.pageSize };
  });

/** Re-queues skipped/failed deliveries so the next dispatch run retries them. */
export const adminRetryNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await assertStaff(context.supabase, context.userId);
    if (!roles.includes("super_admin") && !roles.includes("compliance_officer")) {
      throw new Error("Forbidden");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("notification_outbox")
      .update({ status: "pending", attempts: 0, error: null })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true as const, requeued: data.ids.length };
  });

/** Runs the outbox dispatcher immediately (staff-triggered). */
export const adminRunNotificationDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await assertStaff(context.supabase, context.userId);
    if (!roles.includes("super_admin") && !roles.includes("compliance_officer")) {
      throw new Error("Forbidden");
    }
    const { dispatchNotificationOutbox } = await import("@/lib/notification-dispatch.server");
    return await dispatchNotificationOutbox(50);
  });
