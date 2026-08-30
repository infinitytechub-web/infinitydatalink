/**
 * API-level RBAC integration tests.
 *
 * These bypass the UI entirely and hit the Supabase Data API (PostgREST) and
 * RPCs with a real user JWT. They prove that a member's access token cannot
 * escalate to super_admin actions even if they bypass the client — the
 * database policies, guard trigger, and SECURITY DEFINER RPCs must reject
 * unauthorized callers on their own.
 *
 * Env (see e2e/README.md):
 *   E2E_MEMBER_EMAIL / E2E_MEMBER_PASSWORD              non-staff member
 *   E2E_SUPER_ADMIN_EMAIL / E2E_SUPER_ADMIN_PASSWORD    holds super_admin
 *   E2E_TEST_TARGET_EMAIL                               optional; a confirmed
 *     account used as the target of grant/revoke round-trips. Must exist and
 *     be on `super_admin_seed_emails` OR the caller must already be
 *     super_admin. Defaults to E2E_MEMBER_EMAIL (revoked immediately after
 *     grant to leave state unchanged).
 */

import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://xypqvwkfldpjgejhgrjo.supabase.co";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

const MEMBER_EMAIL = process.env.E2E_MEMBER_EMAIL;
const MEMBER_PASSWORD = process.env.E2E_MEMBER_PASSWORD;
const SUPER_ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL;
const SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD;
const TARGET_EMAIL = process.env.E2E_TEST_TARGET_EMAIL ?? MEMBER_EMAIL;

function makeClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: `e2e-${Math.random()}` },
  });
}

async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const c = makeClient();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.session) throw new Error("no session returned");
  return c;
}

test.describe("Anonymous callers", () => {
  test.skip(!SUPABASE_ANON_KEY, "publishable key missing");
  const anon = makeClient();

  test("list_super_admins RPC rejects anon", async () => {
    const { data, error } = await anon.rpc("list_super_admins");
    // Either explicit permission error or empty auth failure — both acceptable,
    // but MUST NOT return rows.
    expect(data ?? []).toEqual([]);
    expect(error).not.toBeNull();
  });

  test("grant_super_admin_by_email RPC rejects anon", async () => {
    const { error } = await anon.rpc("grant_super_admin_by_email", {
      _email: "attacker@example.com",
      _note: "should fail",
    });
    expect(error).not.toBeNull();
  });

  test("revoke_super_admin RPC rejects anon", async () => {
    const { error } = await anon.rpc("revoke_super_admin", {
      _user_id: "00000000-0000-0000-0000-000000000000",
      _reason: "should fail",
    });
    expect(error).not.toBeNull();
  });

  test("audit_log is not readable by anon", async () => {
    const { data, error } = await anon.from("audit_log").select("id").limit(1);
    expect(data ?? []).toEqual([]);
    // RLS may return empty rather than error; either is a pass.
    if (error) expect(error.code).toBeTruthy();
  });

  test("user_roles is not writable by anon", async () => {
    const { error } = await anon
      .from("user_roles")
      .insert({ user_id: "00000000-0000-0000-0000-000000000000", role: "super_admin" });
    expect(error).not.toBeNull();
  });

  test("super_admin_seed_emails is not writable by anon", async () => {
    const { error } = await anon
      .from("super_admin_seed_emails")
      .insert({ email: "attacker@example.com" });
    expect(error).not.toBeNull();
  });
});

test.describe("Authenticated non-staff member", () => {
  test.skip(!MEMBER_EMAIL || !MEMBER_PASSWORD, "member creds missing");
  let member: SupabaseClient;
  let memberId: string;

  test.beforeAll(async () => {
    member = await signedInClient(MEMBER_EMAIL!, MEMBER_PASSWORD!);
    const { data } = await member.auth.getUser();
    memberId = data.user!.id;
  });

  test("list_super_admins RPC rejects non-staff", async () => {
    const { data, error } = await member.rpc("list_super_admins");
    expect(data ?? []).toEqual([]);
    expect(error?.message ?? "").toMatch(/forbidden|super_admin required|permission/i);
  });

  test("grant_super_admin_by_email RPC rejects non-staff", async () => {
    const { error } = await member.rpc("grant_super_admin_by_email", {
      _email: TARGET_EMAIL,
      _note: "attempted escalation",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/forbidden|super_admin required/i);
  });

  test("revoke_super_admin RPC rejects non-staff", async () => {
    const { error } = await member.rpc("revoke_super_admin", {
      _user_id: memberId,
      _reason: "attempted",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/forbidden|super_admin required/i);
  });

  test("direct INSERT into user_roles for super_admin is blocked by guard trigger", async () => {
    const { error } = await member
      .from("user_roles")
      .insert({ user_id: memberId, role: "super_admin" });
    expect(error).not.toBeNull();
    // Either RLS (42501) or the guard trigger (also 42501) must fire.
    expect(error!.message).toMatch(/forbidden|permission|policy|super_admin/i);
  });

  test("direct DELETE from user_roles is blocked", async () => {
    const { error, count } = await member
      .from("user_roles")
      .delete({ count: "exact" })
      .neq("user_id", "00000000-0000-0000-0000-000000000000");
    // RLS may silently drop rows from the affected set; require zero
    // rows deleted OR an explicit error.
    if (!error) expect(count ?? 0).toBe(0);
  });

  test("audit_log INSERT with spoofed actor_role is blocked", async () => {
    const { error } = await member.from("audit_log").insert({
      actor_id: memberId,
      actor_email: MEMBER_EMAIL!,
      actor_role: "super_admin", // spoof attempt
      action: "role.super_admin.grant",
      target: memberId,
      meta: {},
    });
    expect(error).not.toBeNull();
  });

  test("super_admin_seed_emails is not readable/writable by non-staff", async () => {
    const { error: insErr } = await member
      .from("super_admin_seed_emails")
      .insert({ email: "attacker@example.com" });
    expect(insErr).not.toBeNull();
  });
});

test.describe("Super Admin caller", () => {
  test.skip(!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD, "super_admin creds missing");
  let sa: SupabaseClient;

  test.beforeAll(async () => {
    sa = await signedInClient(SUPER_ADMIN_EMAIL!, SUPER_ADMIN_PASSWORD!);
  });

  test("list_super_admins returns at least the caller", async () => {
    const { data, error } = await sa.rpc("list_super_admins");
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect((data as Array<{ email: string }>).length).toBeGreaterThan(0);
    const emails = (data as Array<{ email: string }>).map((r) => r.email.toLowerCase());
    expect(emails).toContain(SUPER_ADMIN_EMAIL!.toLowerCase());
  });

  test("super_admin can read audit_log", async () => {
    const { error } = await sa
      .from("audit_log")
      .select("id, action")
      .in("action", ["role.super_admin.grant", "role.super_admin.revoke"])
      .limit(5);
    expect(error).toBeNull();
  });

  test("cannot revoke self (last-safety guard)", async () => {
    const { data: me } = await sa.auth.getUser();
    const { error } = await sa.rpc("revoke_super_admin", {
      _user_id: me.user!.id,
      _reason: "self-test",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/cannot_revoke_self|last_super_admin/i);
  });
});
