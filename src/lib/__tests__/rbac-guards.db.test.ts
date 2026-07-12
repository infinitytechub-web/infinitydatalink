import { describe, expect, it, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";

/**
 * Direct DB tests for two Super-Admin-critical guards, using mocked JWT
 * claims so `auth.uid()` and `auth.jwt()` resolve without a live session:
 *
 *   1. `guard_super_admin_role` trigger — blocks unauthorized INSERT/DELETE
 *      of the `super_admin` role on `public.user_roles`.
 *   2. `audit_log` INSERT policy — blocks callers from spoofing `actor_id`,
 *      `actor_email`, or `actor_role`.
 *
 * All DML runs inside BEGIN / ROLLBACK so state is untouched even when the
 * positive-path INSERTs succeed. Skipped when PGHOST is unset.
 *
 * The sandbox role cannot read `auth.users`, so user IDs are pulled from
 * `public.user_roles`, and the "email" is a synthetic value put into the
 * JWT claim and asserted against `actor_email` — the guard compares
 * `actor_email` to the JWT-provided email, not to `auth.users.email`.
 */

const hasDb = !!process.env.PGHOST;
const d = hasDb ? describe : describe.skip;

function q(sql: string): string {
  return execFileSync("psql", ["-tAX", "-c", sql], { encoding: "utf8" }).trim();
}

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

/**
 * Emit SQL that installs a mocked JWT for the current transaction. The
 * `role` GUC switches the row to run under RLS as `authenticated`; the
 * `request.jwt.claims` GUC populates `auth.uid()` and `auth.jwt()`.
 */
function setJwt(userId: string, email: string, role = "authenticated"): string {
  const claims = JSON.stringify({ sub: userId, email, role });
  // Use $$-quoting so embedded double-quotes in JSON don't need escaping.
  return `SELECT set_config('request.jwt.claims', $CLAIM$${claims}$CLAIM$, true);
SELECT set_config('role', '${role}', true);
SET LOCAL ROLE ${role};`;
}

d("guard_super_admin_role trigger", () => {
  let memberId = "";
  let superAdminId = "";
  const memberEmail = "member.mock@example.test";
  const superAdminEmail = "sa.mock@example.test";

  beforeAll(() => {
    superAdminId = q(
      `SELECT user_id::text FROM public.user_roles WHERE role='super_admin' ORDER BY granted_at LIMIT 1`,
    );
    memberId = q(`
      SELECT user_id::text FROM public.user_roles
       WHERE role='member'
         AND user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role='super_admin')
       LIMIT 1
    `);
  });

  it("has fixture users", () => {
    expect(superAdminId).toMatch(/[0-9a-f-]{36}/);
    expect(memberId).toMatch(/[0-9a-f-]{36}/);
    expect(memberId).not.toBe(superAdminId);
  });

  it("non-super_admin cannot INSERT super_admin for themselves", () => {
    const r = tx(`
      ${setJwt(memberId, memberEmail)}
      INSERT INTO public.user_roles (user_id, role) VALUES ('${memberId}', 'super_admin');
    `);
    expect(r.ok).toBe(false);
    expect(r.stderr).toMatch(/forbidden.*super_admin|super_admin role changes require/i);
  });

  it("non-super_admin cannot INSERT super_admin for another user", () => {
    // Use a fresh uuid so we don't collide with an existing row.
    const r = tx(`
      ${setJwt(memberId, memberEmail)}
      INSERT INTO public.user_roles (user_id, role)
        VALUES (gen_random_uuid(), 'super_admin');
    `);
    expect(r.ok).toBe(false);
    expect(r.stderr).toMatch(/forbidden.*super_admin|super_admin role changes require/i);
  });

  it("non-super_admin cannot DELETE an existing super_admin row", () => {
    const r = tx(`
      ${setJwt(memberId, memberEmail)}
      DELETE FROM public.user_roles
        WHERE user_id = '${superAdminId}' AND role = 'super_admin';
    `);
    // Guard trigger raises on DELETE of a super_admin row for non-super_admin callers.
    expect(r.ok).toBe(false);
    expect(r.stderr).toMatch(/forbidden.*super_admin|super_admin role changes require/i);
  });

  it("existing super_admin CAN INSERT another super_admin (rolled back)", () => {
    const target = q(`
      SELECT user_id::text FROM public.user_roles
       WHERE role='member'
         AND user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role='super_admin')
       OFFSET 0 LIMIT 1
    `);
    if (!target) return;
    const r = tx(`
      ${setJwt(superAdminId, superAdminEmail)}
      INSERT INTO public.user_roles (user_id, role, granted_by)
        VALUES ('${target}', 'super_admin', '${superAdminId}')
        ON CONFLICT (user_id, role) DO NOTHING;
    `);
    expect(r.ok).toBe(true);
  });

  it("guard does NOT reject changes to non-super_admin roles with the super_admin message", () => {
    const r = tx(`
      ${setJwt(memberId, memberEmail)}
      INSERT INTO public.user_roles (user_id, role) VALUES ('${memberId}', 'moderator')
        ON CONFLICT DO NOTHING;
    `);
    if (!r.ok) {
      // RLS may still reject, but never with the super_admin-specific message.
      expect(r.stderr).not.toMatch(/forbidden.*super_admin/i);
    }
  });
});

d("audit_log spoof guard (INSERT WITH CHECK)", () => {
  let memberId = "";
  const memberEmail = "member.mock@example.test";
  const otherId = "00000000-0000-0000-0000-000000000042";

  beforeAll(() => {
    memberId = q(`
      SELECT user_id::text FROM public.user_roles
       WHERE role='member'
         AND user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role='super_admin')
       LIMIT 1
    `);
  });

  it("has fixture user", () => {
    expect(memberId).toMatch(/[0-9a-f-]{36}/);
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

  it("allows INSERT with matching id + email + real role the caller holds", () => {
    // handle_new_user() grants 'member' to every confirmed user, so this
    // matches the WITH CHECK EXISTS clause.
    const r = tx(`
      ${setJwt(memberId, memberEmail)}
      INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
      VALUES ('${memberId}', '${memberEmail}', 'member', 'test.self', 'x', '{}'::jsonb);
    `);
    expect(r.ok).toBe(true);
  });

  it("allows INSERT with NULL actor_email + NULL actor_role", () => {
    const r = tx(`
      ${setJwt(memberId, memberEmail)}
      INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
      VALUES ('${memberId}', NULL, NULL, 'test.self.nullmeta', 'x', '{}'::jsonb);
    `);
    expect(r.ok).toBe(true);
  });

  it("non-admin SELECT on audit_log returns zero rows (private.is_admin gate)", () => {
    const out = execFileSync(
      "psql",
      [
        "-tAX",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `BEGIN;
         ${setJwt(memberId, memberEmail)}
         SELECT COUNT(*) FROM public.audit_log;
         ROLLBACK;`,
      ],
      { encoding: "utf8" },
    ).trim();
    const nums = out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => /^\d+$/.test(s));
    expect(nums.at(-1)).toBe("0");
  });
});
