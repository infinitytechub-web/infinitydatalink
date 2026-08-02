/**
 * Server-only fan-out helper for member notifications.
 *
 * Writes the in-app notification and queues email/SMS outbox rows according to
 * the member's notification preferences. Callers may narrow the channels — KYC
 * decisions, for example, send their own branded email through the transactional
 * template, so they ask for in-app + SMS only and would otherwise double-send.
 *
 * Notification failures are logged and never bubble up; they must not roll back
 * the business decision that triggered them.
 */
export type NotifyChannel = "in_app" | "email" | "sms";

const ALL_CHANNELS: NotifyChannel[] = ["in_app", "email", "sms"];

export async function notifyUser(input: {
  userId: string;
  category: string;
  title: string;
  body?: string | null;
  link?: string | null;
  meta?: Record<string, unknown>;
  dedupeKey?: string | null;
  /** Defaults to every channel the member has enabled. */
  channels?: NotifyChannel[];
}): Promise<{ ok: boolean; error?: string; delivered: NotifyChannel[] }> {
  const wanted = new Set(input.channels ?? ALL_CHANNELS);
  const delivered: NotifyChannel[] = [];

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Full fan-out matches the notify_user routine exactly — use it as-is.
    if (ALL_CHANNELS.every((c) => wanted.has(c))) {
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
        return { ok: false, error: error.message, delivered };
      }
      return { ok: true, delivered: ALL_CHANNELS };
    }

    // Narrowed fan-out: honour the same preference rules per channel.
    const { data: pref } = await supabaseAdmin
      .from("notification_preferences")
      .select("in_app, email, sms, muted_categories")
      .eq("user_id", input.userId)
      .maybeSingle();

    const enabled = {
      in_app: pref?.in_app ?? true,
      email: pref?.email ?? true,
      sms: pref?.sms ?? false,
    };
    const muted: string[] = (pref?.muted_categories as string[] | null) ?? [];
    if (muted.includes(input.category)) return { ok: true, delivered };

    if (wanted.has("in_app") && enabled.in_app) {
      const { error } = await supabaseAdmin.from("notifications").insert({
        user_id: input.userId,
        category: input.category,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
      });
      if (error) console.error(`notification insert failed [${input.category}]`, error.message);
      else delivered.push("in_app");
    }

    for (const channel of ["email", "sms"] as const) {
      if (!wanted.has(channel) || !enabled[channel]) continue;
      const { error } = await supabaseAdmin.from("notification_outbox").insert({
        user_id: input.userId,
        channel,
        category: input.category,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
        meta: (input.meta ?? {}) as never,
        dedupe_key: input.dedupeKey ? `${channel}:${input.dedupeKey}` : null,
      });
      // 23505 = duplicate dedupe key, i.e. already queued. Not an error.
      if (error && (error as any).code !== "23505") {
        console.error(`outbox insert failed [${channel}/${input.category}]`, error.message);
      } else if (!error) {
        delivered.push(channel);
      }
    }

    return { ok: true, delivered };
  } catch (err: any) {
    const message = err?.message ?? String(err);
    console.error(`notifyUser threw [${input.category}]`, message);
    return { ok: false, error: message, delivered };
  }
}

/**
 * Internal fan-out to staff holding any of the given roles.
 *
 * Used for compliance signals (e.g. a KYC resubmission auto-flagged for
 * re-review) that must reach officers rather than the member. Defaults to
 * in-app only so routine internal signals never spam email/SMS, and dedupes
 * per recipient so repeated diff computations don't stack duplicates.
 */
export async function notifyStaff(input: {
  roles: string[];
  category: string;
  title: string;
  body?: string | null;
  link?: string | null;
  meta?: Record<string, unknown>;
  dedupeKey?: string | null;
  channels?: NotifyChannel[];
  /** Never notify this user (usually the acting officer). */
  excludeUserId?: string | null;
}): Promise<{ ok: boolean; recipients: number; error?: string }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("role", input.roles as never);
    if (error) {
      console.error(`notifyStaff role lookup failed [${input.category}]`, error.message);
      return { ok: false, recipients: 0, error: error.message };
    }

    const recipients = Array.from(
      new Set((data ?? []).map((r: any) => r.user_id as string).filter(Boolean)),
    ).filter((id) => id !== input.excludeUserId);

    for (const userId of recipients) {
      await notifyUser({
        userId,
        category: input.category,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
        meta: input.meta,
        dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${userId}` : null,
        channels: input.channels ?? ["in_app"],
      });
    }

    return { ok: true, recipients: recipients.length };
  } catch (err: any) {
    const message = err?.message ?? String(err);
    console.error(`notifyStaff threw [${input.category}]`, message);
    return { ok: false, recipients: 0, error: message };
  }
}
