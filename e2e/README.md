# RBAC End-to-End Tests

Playwright specs that verify Super Admin-only routes and endpoints reject
non-staff callers and accept Super Admins across full navigation flows.

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

`rbac.spec.ts` verifies:

1. **Unauthenticated** users hitting `/admin/**` are redirected to `/auth`.
2. **Members** who sign in and navigate to `/admin` are redirected out (no
   admin shell renders).
3. **Members** are blocked from Super Admin routes (`/admin/super-admins`,
   `/admin/super-admins/history`) and receive no data.
4. **Super Admins** signing in are routed to the Admin dashboard (not the
   member portal), can open `/admin/super-admins` and the new grant/revoke
   history page, and see the events table.
5. Server functions `listSuperAdmins`, `listSuperAdminRoleHistory`,
   `grantSuperAdminByEmail`, and `revokeSuperAdmin` reject non-super_admin
   callers with a `forbidden` error.
