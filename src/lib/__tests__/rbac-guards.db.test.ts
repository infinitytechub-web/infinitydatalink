import { describe, expect, it, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";

/**
 * Direct database RBAC tests with mocked JWT claims.
 *
 * Uses psql to SET LOCAL role authenticated + request.jwt.claims so
 * `auth.uid()` and `auth.jwt()` resolve to specific users. Everything runs
 * inside a transaction that is ROLLED BACK, so the database state is
 * unchanged even when a positive-path INSERT succeeds.
 *
 * Skipped automatically when PGHOST is not set.
 */

const hasDb = !!process.env.PGHOST;
const d = hasDb ? describe : describe.skip;

function q(sql: string): string {
  return execFileSync("psql", ["-tAX", "-c", sql], { encoding: "utf8" }).trim();
}

/**
 * Run a block of SQL wrapped in BEGIN/ROLLBACK.  Any DML executed inside is
 * discarded.  Returns stdout so we can grep for error messages when
 * PL/pgSQL exceptions are expected.
 */
function tx(sql: string): { ok: boolean; stdout: string; stderr: string } {
  try {
    const out = execFileSync(
      "psql",
      ["-tAX", "-v", "ON_ERROR_STOP=1", "-c", `BEGIN;\n${sql}\nROLLBACK;`],
      { encoding: "utf8" },
    );
    return { ok: true, stdout: out, stderr: "" };
  } catch (err: any) {
    return {
      ok: false,
      stdout: String(err?.stdout ?? ""),
      stderr: String(err?.stderr ?? err?.message ?? ""),
    };
  }
}

function setJwt(userId: string, email: string, role = "authenticated"): string {
  const claims = JSON.stringify({ sub: userId, email, role });
  // Use set_config so single quotes inside the JSON don't break the SQL parse.
  return `SELECT set_config('role','${role}',true);
SELECT set_config('request.jwt.claims', ${JSON.stringify(claims).replace(/'/g, "''")}, true);`;
}

d("guard_super_admin_role trigger", () => {
  let memberId = "";
  let memberEmail = "";
  let superAdminId = "";
  let superAdminEmail = "";

  beforeAll(() => {
    // Any confirmed non-super_admin user.
    memberId = q(`
      SELECT u.id FROM auth.users u
        WHERE u.email_confirmed_at IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = u.id AND ur.role = 'super_admin'
          )
        ORDER BY u.created_at ASC LIMIT 1
    `);
    memberEmail = q(`SELECT email FROM auth.users WHERE id = '${memberId}'`);

    superAdminId = q(`
      SELECT ur.user_id FROM public.user_roles ur
        WHERE ur.role = 'super_admin' LIMIT 1
    `);
    superAdminEmail = q(`SELECT email FROM auth.users WHERE id = '${superAdminId}'`);
  });

  it("has fixture users", () => {
    expect(memberId).toMatch(/[0-9a-f-]{36}/);
    expect(superAdminId).toMatch(/[0-9a-f-]{36}/);
    expect(memberId).not.toBe(superAdminId);
  });

  it("rejects a non-super_admin trying to grant themselves super_admin", () => {
    const r = tx(`
      ${setJwt(memberId, memberEmail)}
      INSERT INTO public.user_roles (user_id, role) VALUES ('${memberId}', 'super_admin');
    `);
    expect(r.ok).toBe(false);
    expect(r.stderr).toMatch(/forbidden|super_admin/i);
  });

  it("rejects a non-super_admin trying to grant super_admin to someone else", () => {
    const r = tx(`
      ${setJwt(memberId, memberEmail)}
      INSERT INTO public.user_roles (user_id, role) VALUES ('${superAdminId}', 'super_admin')
      ON CONFLICT (user_id, role) DO NOTHING;
      -- If the row already exists, the trigger still fires for the INSERT
      -- attempt; force a distinct write to guarantee the trigger runs.
      DELETE FROM public.user_roles
        WHERE user_id = '${superAdminId}' AND role = 'super_admin';
    `);
    // Either the INSERT is rejected OR the DELETE (also guarded) is rejected.
    expect(r.ok).toBe(false);
    expect(r.stderr).toMatch(/forbidden|super_admin/i);
  });

  it("rejects a non-super_admin trying to REVOKE an existing super_admin", () => {
    const r = tx(`
      ${setJwt(memberId, memberEmail)}
      DELETE FROM public.user_roles
        WHERE user_id = '${superAdminId}' AND role = 'super_admin';
    `);
    expect(r.ok).toBe(false);
    expect(r.stderr).toMatch(/forbidden|super_admin/i);
  });

  it("allows an existing super_admin to grant super_admin (rolled back)", () => {
    // Pick a second confirmed user not currently super_admin.
    const target = q(`
      SELECT u.id FROM auth.users u
        WHERE u.email_confirmed_at IS NOT NULL
          AND u.id <> '${superAdminId}'
          AND NOT EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = u.id AND ur.role = 'super_admin'
          )
        ORDER BY u.created_at ASC LIMIT 1
    `);
    if (!target) return; // no second user in this env; skip silently
    const r = tx(`
      ${setJwt(superAdminId, superAdminEmail)}
      INSERT INTO public.user_roles (user_id, role, granted_by)
        VALUES ('${target}', 'super_admin', '${superAdminId}');
    `);
    expect(r.ok).toBe(true);
  });

  it("non-super_admin roles are unaffected by the guard (member insert still blocked by RLS but not by trigger message)", () => {
    // The guard only fires for role='super_admin'; a non-super_admin role
    // change may still be rejected by RLS, but never with the
    // 'forbidden: super_admin role changes' message.
    const r = tx(`
      ${setJwt(memberId, memberEmail)}
      INSERT INTO public.user_roles (user_id, role) VALUES ('${memberId}', 'moderator')
        ON CONFLICT DO NOTHING;
    `);
    if (!r.ok) {
      expect(r.stderr).not.toMatch(/forbidden: super_admin role changes/i);
    }
  });
});

d("audit_log spoof guard (INSERT WITH CHECK)", () => {
  let memberId = "";
  let memberEmail = "";
  let otherId = "";

  beforeAll(() => {
    memberId = q(`
      SELECT u.id FROM auth.users u
        WHERE u.email_confirmed_at IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = u.id AND ur.role = 'super_admin'
          )
        ORDER BY u.created_at ASC LIMIT 1
    `);
    memberEmail = q(`SELECT email FROM auth.users WHERE id = '${memberId}'`);
    otherId = q(`
      SELECT u.id FROM auth.users u
        WHERE u.id <> '${memberId}' AND u.email_confirmed_at IS NOT NULL
        ORDER BY u.created_at ASC LIMIT 1
    `);
  });

  it("rejects INSERT where actor_id != auth.uid()", () => {
    const r = tx(`
      ${setJwt(memberId, memberEmail)}
      INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
      VALUES ('${otherId}', '${memberEmail}', NULL, 'test.spoof', 'x', '{}'::jsonb);
    `);
    expect(r.ok).toBe(false);
    expect(r.stderr).toMatch(/row-level security|policy/i);
  });

  it("rejects INSERT with spoofed actor_email", () => {
    const r = tx(`
      ${setJwt(memberId, memberEmail)}
      INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
      VALUES ('${memberId}', 'attacker@evil.example', NULL, 'test.spoof', 'x', '{}'::jsonb);
    `);
    expect(r.ok).toBe(false);
    expect(r.stderr).toMatch(/row-level security|policy/i);
  });

  it("rejects INSERT with spoofed actor_role the caller does not hold", () => {
    const r = tx(`
      ${setJwt(memberId, memberEmail)}
      INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
      VALUES ('${memberId}', '${memberEmail}', 'super_admin', 'test.spoof', 'x', '{}'::jsonb);
    `);
    expect(r.ok).toBe(false);
    expect(r.stderr).toMatch(/row-level security|policy/i);
  });

  it("allows INSERT with matching actor_id + actor_email + a role the caller actually holds", () => {
    // 'member' is granted by handle_new_user() to every confirmed user.
    const r = tx(`
      ${setJwt(memberId, memberEmail)}
      INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
      VALUES ('${memberId}', '${memberEmail}', 'member', 'test.self', 'x', '{}'::jsonb);
    `);
    expect(r.ok).toBe(true);
  });

  it("allows INSERT with NULL actor_email and NULL actor_role", () => {
    const r = tx(`
      ${setJwt(memberId, memberEmail)}
      INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
      VALUES ('${memberId}', NULL, NULL, 'test.self.nullmeta', 'x', '{}'::jsonb);
    `);
    expect(r.ok).toBe(true);
  });

  it("SELECT on audit_log is denied to non-admin members", () => {
    // The policy is `USING (private.is_admin(auth.uid()))`. A member should
    // read zero rows even without an explicit error.
    const r = execFileSync(
      "psql",
      [
        "-tAX",
        "-c",
        `BEGIN;
         ${setJwt(memberId, memberEmail)}
         SELECT COUNT(*) FROM public.audit_log;
         ROLLBACK;`,
      ],
      { encoding: "utf8" },
    ).trim();
    // Output is a multi-line psql result; the COUNT is the numeric line.
    const nums = r.split(/\r?\n/).map((s) => s.trim()).filter((s) => /^\d+$/.test(s));
    expect(nums[nums.length - 1]).toBe("0");
  });
});
