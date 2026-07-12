# End-to-End Tests

Playwright specs covering RBAC and the transfer lifecycle.

The RBAC specs (`rbac.spec.ts`, `rbac-api.spec.ts`) verify Super Admin-only
routes and endpoints reject non-staff callers and accept Super Admins across
navigation flows. The transfer specs (`transfers.spec.ts`,
`transfers-api.spec.ts`) verify the member↔member and account↔account
request → approval / rejection lifecycle end-to-end.


## Running

Playwright is not bundled with the app. Install once:

```bash
bun add -d @playwright/test
bunx playwright install --with-deps chromium
```

Environment variables required (do NOT commit real credentials):

- `E2E_BASE_URL` — e.g. `http://localhost:8080`
- `E2E_MEMBER_EMAIL`, `E2E_MEMBER_PASSWORD` — a member-only account
- `E2E_SUPER_ADMIN_EMAIL`, `E2E_SUPER_ADMIN_PASSWORD` — a Super Admin account

Then:

```bash
bunx playwright test -c e2e/playwright.config.ts
```

## What is covered

`rbac.spec.ts` — UI/navigation coverage:

1. **Unauthenticated** users hitting `/admin/**` are redirected to `/auth`.
2. **Members** signing in land on `/app`, not `/admin`; navigating to Super
   Admin routes shows no data.
3. **Super Admins** are routed to `/admin`, can open the directory + grant
   history, sort and paginate history via URL, and download the CSV.

`rbac-api.spec.ts` — direct API/RPC coverage (no UI, no server-function
wrapper — hits Supabase/PostgREST with real user JWTs, so it proves the
database policies, guard triggers, and `SECURITY DEFINER` RPCs stand on
their own even if a caller bypasses the client entirely):

1. **Anonymous** callers cannot invoke `list_super_admins`,
   `grant_super_admin_by_email`, `revoke_super_admin`, cannot read
   `audit_log`, and cannot write `user_roles` or `super_admin_seed_emails`.
2. **Authenticated non-staff members** are rejected by the same RPCs with a
   `forbidden` error; direct `INSERT`/`DELETE` on `user_roles.super_admin`
   is blocked by the `guard_super_admin_role` trigger; a spoofed
   `audit_log` row with `actor_role='super_admin'` is rejected by the
   `WITH CHECK` policy.
3. **Super Admin** callers can invoke `list_super_admins`, read
   `audit_log`, and are still prevented from revoking themselves
   (`cannot_revoke_self` / `last_super_admin`).

Optional env for the API suite: `E2E_TEST_TARGET_EMAIL` (defaults to the
member email; used only for negative grant/revoke attempts).
