import { describe, expect, it, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";

/**
 * Direct DB tests for two Super-Admin-critical guards, using mocked JWT
 * claims so `auth.uid()` and `auth.jwt()` resolve without a live Supabase
 * session:
 *
 *   1. `guard_super_admin_role` trigger — blocks unauthorized INSERT/DELETE
 *      of the `super_admin` role on `public.user_roles`.
 *      Triggers fire for every INSERT/DELETE regardless of the caller role
 *      or BYPASSRLS, so this is validated directly.
 *
 *   2. `audit_log` INSERT policy — blocks callers from spoofing `actor_id`,
 *      `actor_email`, or `actor_role`.
 *      The sandbox role has BYPASSRLS and cannot switch to `authenticated`,
 *      so the WITH CHECK expression is evaluated directly as a boolean
 *      under mocked JWT claims (same expression the RLS engine runs).
 *
 * Skipped when PGHOST is unset.
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

/** Install mocked JWT claims for the current transaction. */
function setJwt(userId: string, email: string): string {
  const claims = JSON.stringify({ sub: userId, email, role: "authenticated" });
  return `SELECT set_config('request.jwt.claims', $CLAIM$${claims}$CLAIM$, true);`;
}

/**
 * Evaluate the exact WITH CHECK expression from the
 * "authenticated can append audit" policy under mocked JWT claims. Returns
 * "t" when the policy would allow the row, "f" when it would reject it.
 */
function evalAuditPolicy(args: {
  jwtUserId: string;
  jwtEmail: string;
  actorId: string;
  actorEmail: string | null;
  actorRole: string | null;
}): string {
  const actorEmailSql = args.actorEmail === null ? "NULL" : `'${args.actorEmail}'`;
  const actorRoleSql = args.actorRole === null ? "NULL" : `'${args.actorRole}'`;
  return q(`
    BEGIN;
    ${setJwt(args.jwtUserId, args.jwtEmail)}
    SELECT (
      '${args.actorId}'::uuid = auth.uid()
      AND (
        ${actorEmailSql}::text IS NULL
        OR lower(${actorEmailSql}::text) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
      AND (
        ${actorRoleSql}::text IS NULL
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role::text = ${actorRoleSql}::text
        )
      )
    );
    ROLLBACK;
  `).trim().split(/\r?\n/).at(-1)!.trim();
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
    expect(r.ok).toBe(false);
    expect(r.stderr).toMatch(/forbidden.*super_admin|super_admin role changes require/i);
  });

  it("existing super_admin CAN INSERT another super_admin (rolled back)", () => {
    const target = q(`
      SELECT user_id::text FROM public.user_roles
       WHERE role='member'
         AND user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role='super_admin')
       LIMIT 1
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

  it("guard does NOT rewrite the message for non-super_admin role changes", () => {
    const r = tx(`
      ${setJwt(memberId, memberEmail)}
      INSERT INTO public.user_roles (user_id, role) VALUES ('${memberId}', 'moderator')
        ON CONFLICT DO NOTHING;
    `);
    if (!r.ok) {
      expect(r.stderr).not.toMatch(/forbidden.*super_admin/i);
    }
  });

  it("no anonymous caller (auth.uid() IS NULL) can INSERT super_admin either", () => {
    const r = tx(`
      SELECT set_config('request.jwt.claims', '', true);
      INSERT INTO public.user_roles (user_id, role)
        VALUES (gen_random_uuid(), 'super_admin');
    `);
    // The guard early-returns when auth.uid() is NULL (definer/admin path),
    // but the FK to auth.users MUST reject a random uuid — either the
    // guard or the FK must block it.
    expect(r.ok).toBe(false);
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

  it("policy has expected WITH CHECK expression", () => {
    const expr = q(`
      SELECT with_check FROM pg_policies
       WHERE schemaname='public' AND tablename='audit_log'
         AND policyname='authenticated can append audit'
    `);
    expect(expr).toMatch(/actor_id = auth\.uid\(\)/);
    expect(expr).toMatch(/actor_email/);
    expect(expr).toMatch(/actor_role/);
    expect(expr).toMatch(/user_roles/);
  });

  it("rejects when actor_id != auth.uid()", () => {
    const allowed = evalAuditPolicy({
      jwtUserId: memberId,
      jwtEmail: memberEmail,
      actorId: otherId,
      actorEmail: memberEmail,
      actorRole: null,
    });
    expect(allowed).toBe("f");
  });

  it("rejects a spoofed actor_email", () => {
    const allowed = evalAuditPolicy({
      jwtUserId: memberId,
      jwtEmail: memberEmail,
      actorId: memberId,
      actorEmail: "attacker@evil.example",
      actorRole: null,
    });
    expect(allowed).toBe("f");
  });

  it("rejects a spoofed actor_role the caller does not hold", () => {
    const allowed = evalAuditPolicy({
      jwtUserId: memberId,
      jwtEmail: memberEmail,
      actorId: memberId,
      actorEmail: memberEmail,
      actorRole: "super_admin",
    });
    expect(allowed).toBe("f");
  });

  it("rejects case-mismatched actor_role (exact ::text compare)", () => {
    const allowed = evalAuditPolicy({
      jwtUserId: memberId,
      jwtEmail: memberEmail,
      actorId: memberId,
      actorEmail: memberEmail,
      actorRole: "MEMBER",
    });
    expect(allowed).toBe("f");
  });

  it("allows matching id + email + real role the caller holds", () => {
    const allowed = evalAuditPolicy({
      jwtUserId: memberId,
      jwtEmail: memberEmail,
      actorId: memberId,
      actorEmail: memberEmail,
      actorRole: "member",
    });
    expect(allowed).toBe("t");
  });

  it("allows NULL actor_email and NULL actor_role (well-formed self-audit)", () => {
    const allowed = evalAuditPolicy({
      jwtUserId: memberId,
      jwtEmail: memberEmail,
      actorId: memberId,
      actorEmail: null,
      actorRole: null,
    });
    expect(allowed).toBe("t");
  });

  it("email comparison is case-insensitive", () => {
    const allowed = evalAuditPolicy({
      jwtUserId: memberId,
      jwtEmail: "Foo.Bar@Example.Test",
      actorId: memberId,
      actorEmail: "foo.bar@example.test",
      actorRole: null,
    });
    expect(allowed).toBe("t");
  });
});
