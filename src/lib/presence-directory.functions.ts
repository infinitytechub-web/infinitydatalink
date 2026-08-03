import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PresenceIdentity = { user_id: string; name: string; role: "Staff" | "Member" };

/**
 * Resolves display identities for the online-presence roster.
 *
 * The realtime presence channel is public (any holder of the publishable key
 * can join it), so it now carries only opaque user ids and timestamps. Names
 * and staff classification are resolved here, behind an authenticated server
 * function, so they never leave the app for unauthenticated listeners.
 */
export const resolvePresenceIdentities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ userIds: z.array(z.string().uuid()).max(500) }).parse(data),
  )
  .handler(async ({ data }): Promise<PresenceIdentity[]> => {
    if (data.userIds.length === 0) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name").in("id", data.userIds),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", data.userIds),
    ]);

    const staff = new Set(
      (roles ?? []).filter((r) => r.role !== "member").map((r) => r.user_id as string),
    );

    return data.userIds.map((id) => {
      const profile = (profiles ?? []).find((p) => p.id === id);
      return {
        user_id: id,
        name: profile?.full_name?.trim() || "Member",
        role: staff.has(id) ? ("Staff" as const) : ("Member" as const),
      };
    });
  });
