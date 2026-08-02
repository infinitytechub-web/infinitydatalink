/**
 * Server-only fan-out helper for member notifications.
 *
 * `public.notify_user` writes the in-app notification and queues email/SMS
 * outbox rows according to the member's notification preferences, so callers
 * get all three channels from a single call. Notification failures are logged
 * and never bubble up — they must not roll back the business decision that
 * triggered them.
 */
export async function notifyUser(input: {
  userId: string;
  category: string;
  title: string;
  body?: string | null;
  link?: string | null;
  meta?: Record<string, unknown>;
  dedupeKey?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("notify_user", {
      _user_id: input.userId,
      _category: input.category,
      _title: input.title,
      _body: input.body ?? null,
      _link: input.link ?? null,
      _meta: input.meta ?? {},
      _dedupe_key: input.dedupeKey ?? null,
    } as never);
    if (error) {
      console.error(`notify_user failed [${input.category}]`, error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err: any) {
    const message = err?.message ?? String(err);
    console.error(`notify_user threw [${input.category}]`, message);
    return { ok: false, error: message };
  }
}
