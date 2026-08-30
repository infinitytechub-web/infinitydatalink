import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadRoleSet, ADMIN_ROLES, assertAnyRole } from "@/lib/role-guards";
import { STEP_UP_TTL_MINUTES } from "@/lib/rbac-matrix";
import { writeAudit } from "@/lib/audit-log";

export type StepUpState = {
  active: boolean;
  method: "password" | "totp" | null;
  expires_at: string | null;
  ttl_minutes: number;
};

export const getStepUpState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StepUpState> => {
    const roles = await loadRoleSet(context.supabase, context.userId);
    assertAnyRole(roles, ADMIN_ROLES, "admin");
    const { getActiveStepUp } = await import("@/lib/step-up.server");
    const row = await getActiveStepUp(context.userId);
    return {
      active: !!row,
      method: row?.method ?? null,
      expires_at: row?.expires_at ?? null,
      ttl_minutes: STEP_UP_TTL_MINUTES,
    };
  });

/**
 * Re-authenticate the officer and mint a short-lived step-up token.
 * `password` verifies the account password; `totp` requires the caller's
 * current session to already be at AAL2 (they just passed a 2FA challenge).
 */
export const startStepUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        method: z.enum(["password", "totp"]),
        password: z.string().min(1).max(200).optional(),
        reason: z.string().trim().max(200).optional(),
      })
      .parse(d),
  )
  .handler(
    async ({ data, context }): Promise<{ token: string; expires_at: string; method: string }> => {
      const roles = await loadRoleSet(context.supabase, context.userId);
      assertAnyRole(roles, ADMIN_ROLES, "admin");

      const claims = context.claims as any;
      const email: string | null = claims?.email ?? null;
      const aal: string | null = claims?.aal ?? null;

      const { assertNotLockedOut, verifyPassword, issueStepUpSession } =
        await import("@/lib/step-up.server");
      await assertNotLockedOut(context.userId);

      if (data.method === "password") {
        if (!email) throw new Error("No email on this account — use 2FA instead.");
        if (!data.password) throw new Error("Password is required");
        const ok = await verifyPassword(email, data.password);
        if (!ok) {
          await writeAudit({
            actor_id: context.userId,
            actor_email: email,
            action: "security.step_up_failed",
            target: context.userId,
            meta: { method: "password", reason: data.reason ?? null },
          });
          throw new Error("Incorrect password");
        }
      } else if (aal !== "aal2") {
        await writeAudit({
          actor_id: context.userId,
          actor_email: email,
          action: "security.step_up_failed",
          target: context.userId,
          meta: { method: "totp", aal },
        });
        throw new Error("Complete the two-factor challenge before continuing.");
      }

      const session = await issueStepUpSession({
        userId: context.userId,
        method: data.method,
        aal,
      });

      await writeAudit({
        actor_id: context.userId,
        actor_email: email,
        action: "security.step_up_granted",
        target: context.userId,
        meta: { method: data.method, reason: data.reason ?? null, expires_at: session.expires_at },
      });

      return session;
    },
  );

export const endStepUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const { revokeStepUp } = await import("@/lib/step-up.server");
    await revokeStepUp(context.userId);
    return { ok: true };
  });
