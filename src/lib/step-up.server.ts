/**
 * Step-up (re-authentication) sessions for sensitive staff decisions.
 *
 * Server-only: uses the service-role client. Never import from a component.
 *
 * Flow:
 *  1. Officer re-enters their password (or verifies a TOTP factor, giving the
 *     session an `aal2` claim).
 *  2. We mint an opaque token, store only its SHA-256 hash, and hand the token
 *     back to the browser (kept in memory only).
 *  3. Each approve/reject server function passes the token to `assertStepUp`,
 *     which validates it, records the usage and returns the method used so it
 *     can be embedded in the audit entry.
 */
import { STEP_UP_TTL_MINUTES } from "@/lib/rbac-matrix";

export type StepUpMethod = "password" | "totp";

export type StepUpProof = {
  id: string;
  method: StepUpMethod;
  expires_at: string;
};

const MAX_FAILURES = 5;
const FAILURE_WINDOW_MINUTES = 15;

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Simple lockout: too many failed re-auth attempts in the recent window. */
export async function assertNotLockedOut(userId: string): Promise<void> {
  const db = await admin();
  const since = new Date(Date.now() - FAILURE_WINDOW_MINUTES * 60_000).toISOString();
  const { count } = await db
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", userId)
    .eq("action", "security.step_up_failed")
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_FAILURES) {
    throw new Error(
      `Too many failed re-authentication attempts. Try again in ${FAILURE_WINDOW_MINUTES} minutes.`,
    );
  }
}

/** Verify the officer's password without disturbing their current session. */
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input: any, init: any) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) return false;
  await client.auth.signOut().catch(() => undefined);
  return true;
}

export async function issueStepUpSession(input: {
  userId: string;
  method: StepUpMethod;
  aal?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ token: string; expires_at: string; method: StepUpMethod }> {
  const db = await admin();
  const token = randomToken();
  const expiresAt = new Date(Date.now() + STEP_UP_TTL_MINUTES * 60_000).toISOString();

  // Revoke any earlier active sessions — one live re-auth per officer.
  await db
    .from("admin_step_up_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", input.userId)
    .is("revoked_at", null);

  const { error } = await db.from("admin_step_up_sessions").insert({
    user_id: input.userId,
    token_hash: await sha256Hex(token),
    method: input.method,
    aal: input.aal ?? null,
    ip: input.ip ?? null,
    user_agent: input.userAgent ?? null,
    expires_at: expiresAt,
  } as never);
  if (error) throw new Error(error.message);

  return { token, expires_at: expiresAt, method: input.method };
}

/**
 * Validates a step-up token for `userId`. Throws a descriptive error when the
 * officer must re-authenticate. Returns proof metadata for the audit entry.
 */
export async function assertStepUp(
  userId: string,
  token: string | null | undefined,
  action: string,
): Promise<StepUpProof> {
  if (!token) {
    throw new Error(`Re-authentication required before “${action}”.`);
  }
  const db = await admin();
  const { data, error } = await db
    .from("admin_step_up_sessions")
    .select("id, user_id, method, expires_at, revoked_at, use_count")
    .eq("token_hash", await sha256Hex(token))
    .maybeSingle();
  if (error) throw new Error(error.message);

  const row = data as any;
  if (!row || row.user_id !== userId || row.revoked_at || new Date(row.expires_at) <= new Date()) {
    throw new Error(`Re-authentication expired — confirm your identity again to “${action}”.`);
  }

  await db
    .from("admin_step_up_sessions")
    .update({ last_used_at: new Date().toISOString(), use_count: (row.use_count ?? 0) + 1 })
    .eq("id", row.id);

  return { id: row.id, method: row.method as StepUpMethod, expires_at: row.expires_at };
}

export async function getActiveStepUp(userId: string) {
  const db = await admin();
  const { data } = await db
    .from("admin_step_up_sessions")
    .select("id, method, expires_at, created_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as any) ?? null;
}

export async function revokeStepUp(userId: string) {
  const db = await admin();
  await db
    .from("admin_step_up_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);
}
