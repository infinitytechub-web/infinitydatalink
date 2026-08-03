import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PresenceIdentity = { token: string; name: string; role: "Staff" | "Member" };

/**
 * Issues a random, single-session token for the caller's presence entry.
 *
 * The realtime presence channel can be joined by any holder of the publishable
 * key, so it must never carry real user ids. Each tab publishes an opaque token
 * instead; the token -> user mapping lives server-side and is only readable
 * through the authenticated resolver below.
 */
export const registerPresenceSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ token: string }> => {
    const { data, error } = await (context.supabase as any)
      .from("presence_sessions")
      .insert({ user_id: context.userId })
      .select("token")
      .single();
    if (error) throw new Error(error.message);
    return { token: String((data as any).token) };
  });

/**
 * Resolves display identities for the online-presence roster from opaque
 * session tokens. Authenticated callers only — unauthenticated listeners on the
 * channel see nothing but random tokens and timestamps.
 */
export const resolvePresenceIdentities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ tokens: z.array(z.string().uuid()).max(500) }).parse(data),
  )
  .handler(async ({ data }): Promise<PresenceIdentity[]> => {
    if (data.tokens.length === 0) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sessions } = await (supabaseAdmin as any)
      .from("presence_sessions")
      .select("token, user_id")
      .in("token", data.tokens);

    const rows = (sessions ?? []) as { token: string; user_id: string }[];
    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    if (userIds.length === 0) return [];

    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name").in("id", userIds),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", userIds),
    ]);

    const staff = new Set(
      (roles ?? []).filter((r) => r.role !== "member").map((r) => r.user_id as string),
    );

    return rows.map((row) => {
      const profile = (profiles ?? []).find((p) => p.id === row.user_id);
      return {
        token: row.token,
        name: profile?.full_name?.trim() || "Member",
        role: staff.has(row.user_id) ? ("Staff" as const) : ("Member" as const),
      };
    });
  });
