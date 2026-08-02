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
    z
      .object({
        limit: z.number().int().min(1).max(100).optional().default(20),
        /** Cursor: return rows strictly older than this ISO timestamp. */
        before: z.string().datetime({ offset: true }).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("notifications")
      .select("id, user_id, category, title, body, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.before) query = query.lt("created_at", data.before);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    // Exact unread count for the whole feed, not just the loaded page.
    const { count, error: countError } = await context.supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);
    if (countError) throw new Error(countError.message);

    const list = (rows ?? []) as NotificationRow[];
    return {
      rows: list,
      unread: count ?? 0,
      nextCursor: list.length === data.limit ? list[list.length - 1].created_at : null,
    };
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

/**
 * Notifications centre feed: page/filter over the member's own in-app alerts.
 * RLS scopes rows to the caller; the extra user_id filter keeps legacy
 * broadcast rows (user_id null) out of a personal inbox.
 */
export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        page: z.number().int().min(1).optional().default(1),
        page_size: z.number().int().min(5).max(100).optional().default(25),
        status: z.enum(["all", "unread", "read"]).optional().default("all"),
        category: z.string().optional().default(""),
        q: z.string().max(120).optional().default(""),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const from = (data.page - 1) * data.page_size;

    let query = context.supabase
      .from("notifications")
      .select("id, user_id, category, title, body, link, read_at, created_at", { count: "exact" })
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .range(from, from + data.page_size - 1);

    if (data.status === "unread") query = query.is("read_at", null);
    if (data.status === "read") query = query.not("read_at", "is", null);
    if (data.category) query = query.eq("category", data.category);
    if (data.q) {
      // Escape PostgREST reserved characters before interpolating the pattern.
      const term = data.q.replace(/[%,()*\\]/g, " ").trim();
      if (term) query = query.or(`title.ilike.%${term}%,body.ilike.%${term}%`);
    }

    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);

    const { count: unread, error: unreadError } = await context.supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (unreadError) throw new Error(unreadError.message);

    return {
      rows: (rows ?? []) as NotificationRow[],
      total: count ?? 0,
      unread: unread ?? 0,
    };
  });

/** Mark a specific set of the caller's notifications as read. */
export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ids = Array.from(new Set(data.ids));
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids)
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true as const, count: ids.length };
  });

/** Restore a notification to unread so members can revisit it later. */
export const markNotificationUnread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: null })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
