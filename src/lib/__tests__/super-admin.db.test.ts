import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

/**
 * Integration tests that run against the live database via psql (the sandbox
 * exec role has SELECT/INSERT only). These validate the RLS + trigger layer
 * that protects Super Admin role assignments and the controlled seed list.
 *
 * They are skipped automatically when PGHOST is not set (e.g. CI without DB
 * credentials).
 */

const hasDb = !!process.env.PGHOST;
const d = hasDb ? describe : describe.skip;

function q(sql: string): string {
  return execFileSync("psql", ["-tAX", "-c", sql], { encoding: "utf8" }).trim();
}

d("Database: super_admin seed & role enforcement", () => {
  it("seed list is non-empty and controlled", () => {
    const count = Number(q("SELECT COUNT(*) FROM public.super_admin_seed_emails"));
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("every super_admin role assignment corresponds to a real user", () => {
    const orphans = Number(
      q(
        `SELECT COUNT(*) FROM public.user_roles ur
           LEFT JOIN auth.users u ON u.id = ur.user_id
          WHERE ur.role = 'super_admin' AND u.id IS NULL`,
      ),
    );
    expect(orphans).toBe(0);
  });

  it("every super_admin user has a confirmed email", () => {
    const unconfirmed = Number(
      q(
        `SELECT COUNT(*) FROM public.user_roles ur
            JOIN auth.users u ON u.id = ur.user_id
           WHERE ur.role = 'super_admin' AND u.email_confirmed_at IS NULL`,
      ),
    );
    expect(unconfirmed).toBe(0);
  });

  it("guard trigger is installed on user_roles", () => {
    const rows = q(
      "SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.user_roles'::regclass AND tgname = 'guard_super_admin_role_ins'",
    );
    expect(rows).toContain("guard_super_admin_role_ins");
  });

  it("grant/revoke RPCs exist and require authenticated role", () => {
    const grants = q(
      `SELECT grantee || ':' || privilege_type FROM information_schema.routine_privileges
         WHERE routine_schema='public'
           AND routine_name IN ('grant_super_admin_by_email','revoke_super_admin','list_super_admins')`,
    );
    // Should be granted to authenticated (and NOT to PUBLIC or anon)
    expect(grants).toContain("authenticated:EXECUTE");
    expect(grants).not.toContain("PUBLIC:EXECUTE");
    expect(grants).not.toContain("anon:EXECUTE");
  });

  it("user_roles has grant metadata columns", () => {
    const cols = q(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='user_roles'",
    );
    expect(cols).toContain("granted_at");
    expect(cols).toContain("granted_by");
  });

  it("RLS is enabled on super_admin_seed_emails", () => {
    const rls = q(
      "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.super_admin_seed_emails'::regclass",
    );
    expect(rls).toBe("t");
  });

  it("seed emails are lower-cased (case-insensitive matching invariant)", () => {
    const bad = Number(
      q("SELECT COUNT(*) FROM public.super_admin_seed_emails WHERE email <> lower(email)"),
    );
    expect(bad).toBe(0);
  });
});
