import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type NotificationRow = {
  id: string;
  user_id: string | null;
  category: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ limit: z.number().int().min(1).max(100).optional().default(20) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("notifications")
      .select("id, user_id, category, title, body, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    const unread = (rows ?? []).filter((r: any) => !r.read_at).length;
    return { rows: (rows ?? []) as NotificationRow[], unread };
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Super admin purge — deletes read notifications (default) or all */
export const purgeNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        scope: z.enum(["read", "all"]).default("read"),
        older_than_days: z.number().int().min(0).max(3650).optional(),
        confirm: z.literal("PURGE"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const before = data.older_than_days
      ? new Date(Date.now() - data.older_than_days * 86400_000).toISOString()
      : undefined;
    const { data: n, error } = await context.supabase.rpc("purge_notifications", {
      _scope: data.scope,
      _before: before,
    });
    if (error) throw new Error(error.message);
    return { deleted: Number(n ?? 0) };
  });

export const purgeAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        older_than_days: z.number().int().min(7).max(3650),
        confirm: z.literal("PURGE"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const before = new Date(Date.now() - data.older_than_days * 86400_000).toISOString();
    const { data: n, error } = await context.supabase.rpc("purge_audit_log", { _before: before });
    if (error) throw new Error(error.message);
    return { deleted: Number(n ?? 0) };
  });

export const purgeRecycleBin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ all: z.boolean().default(false), confirm: z.literal("PURGE") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: n, error } = await context.supabase.rpc("purge_recycle_bin", { _all: data.all });
    if (error) throw new Error(error.message);
    return { deleted: Number(n ?? 0) };
  });

export type RecycleRow = {
  id: string;
  entity_table: string;
  entity_id: string;
  payload: any;
  deleted_by: string | null;
  deleted_at: string;
  purge_after: string;
};

export const listRecycleBin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ limit: z.number().int().min(1).max(200).optional().default(50) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("recycle_bin")
      .select("id, entity_table, entity_id, payload, deleted_by, deleted_at, purge_after")
      .order("deleted_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as RecycleRow[] };
  });
