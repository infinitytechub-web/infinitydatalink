## Goal

Three related changes:

1. **Route staff to the admin dashboard on login** — when a user with any admin role visits `/app` or lands post-auth, land them on `/admin` instead of the member overview.
2. **Add a Super Admin role-history audit page** — dedicated page showing every `role.super_admin.grant` / `role.super_admin.revoke` event with target user, actor, timestamps, seeded/manual status, and reason/note.
3. **Add Playwright e2e tests** covering the RBAC boundaries around `/admin/*` and the super-admin-only surfaces.

## 1. Redirect staff to admin dashboard

- In `src/routes/_member.app.tsx` (the member portal shell), add a client-side gate: if the signed-in user has any admin role, `<Navigate to="/admin" replace />` before rendering member UI. This preserves the two shells (member vs admin) and only changes which one loads by default.
- In `src/routes/auth.tsx` post-login redirect logic, if the user has any admin role and no explicit `redirect` search param, push to `/admin` instead of `/app`. (Verify current behaviour, adjust only if needed.)
- Home-page "Sign in" affordance and any post-signup landing already flow through `/auth`; no change needed there.
- Non-goal: do NOT delete `_member.app.index.tsx`; members without admin roles still see it.

## 2. Super Admin role-history page

New route `src/routes/_admin.admin.super-admins.history.tsx` (child of the existing Super Admins area).

- Server function `listSuperAdminRoleHistory` in `src/lib/admin-roles.functions.ts`:
  - Guards with existing `assertSuperAdmin`.
  - Reads `audit_log` where `action IN ('role.super_admin.grant','role.super_admin.revoke')`.
  - Joins target email + name from `profiles` / `user_roles` (target user id = `target` column).
  - Returns `{ id, occurred_at, event: 'grant'|'revoke', actor_id, actor_email, target_user_id, target_email, note, reason, seeded }` sorted newest-first with pagination (`limit`, `offset`, filters: event type, date range, target email substring).
- Page UI (matches the existing audit page pattern in `_admin.admin.audit.tsx`):
  - Filter bar: event type (grant/revoke/all), date range, target email search.
  - Table columns: When (exact timestamp), Event, Target user (email + link to `/admin/members/$id`), Actor (email + role), Note/Reason, Seeded badge.
  - Row-click opens a details drawer showing the full audit metadata (JSON), the target user's *current* super_admin status (still active vs revoked), and — for the current super_admins — the original grant timestamp + granting actor's email from `user_roles.granted_at` / `granted_by`.
- Wire nav in `src/routes/_admin.admin.tsx` under Governance:
  - Keep "Super Admins" → `/admin/super-admins` (directory).
  - Add "Grant history" → `/admin/super-admins/history`.
- Also enrich the existing directory page (`_admin.admin.super-admins.tsx`) row to render a compact "Granted <relative> by <email>" line beneath each name (data already returned by `list_super_admins`).

## 3. Playwright RBAC e2e tests

Install dev deps: `@playwright/test`. Add `playwright.config.ts` targeting `http://localhost:8080`. Store scripts under `e2e/`.

Session strategy: the Lovable browser knowledge card documents `LOVABLE_BROWSER_SUPABASE_*` env injection for one signed-in identity per run. Since we need three identities (unauthenticated, member, super_admin), the tests will:

- Read the injected session from env once (whichever identity the user provides via Lovable preview) and treat that as the "primary" identity. Determine whether it is `member` or `super_admin` by querying `/api/...` or a small helper server function `whoAmI` that returns role names.
- Branch each `test.describe` on the primary identity so the suite runs meaningfully with either fixture:
  - **Unauthenticated** (fresh context, no session restore): `/admin`, `/admin/super-admins`, `/admin/super-admins/history` all redirect to `/auth`.
  - **Member primary** (has member role only): those same routes redirect to `/app` (via `_admin.tsx` gate), and `/admin` UI never renders. Also asserts `POST` to protected server fns (`listSuperAdmins`) returns 401/403.
  - **Super admin primary**: `/admin` loads dashboard, `/admin/super-admins` loads directory, `/admin/super-admins/history` loads audit table with ≥1 row (the seed grant). Also verifies the redirect from `/app` → `/admin` from item 1.

Add `bun run test:e2e` script. Document in `docs/security-controls.md` that the suite needs a super_admin session for full coverage; a member session runs the negative-path subset.

## Technical details

- `_admin.tsx` gate stays unchanged (already redirects non-admins to `/app`). The new `_member.app.tsx` gate is the mirror of it and prevents redirect loops because it only redirects when `isAdmin` is true (admin gate only redirects when not admin).
- Role history uses `audit_log` — no schema migration needed (grant/revoke already write events with `action = 'role.super_admin.grant' | 'role.super_admin.revoke'`).
- The details drawer's "current status" enrichment queries `user_roles` for the target: if the row still exists and role = `super_admin`, show "Currently active — granted <granted_at> by <granted_by_email>"; otherwise "Revoked".
- Playwright tests run against the sandbox's `localhost:8080` dev server (per browser-use knowledge). No auto-start; the dev server is already running.

## Files touched

Edit:
- `src/routes/_member.app.tsx` — admin redirect gate.
- `src/routes/auth.tsx` — post-login redirect target for admins.
- `src/routes/_admin.admin.tsx` — nav item for Grant history.
- `src/routes/_admin.admin.super-admins.tsx` — compact grant-metadata line per row.
- `src/lib/admin-roles.functions.ts` — new `listSuperAdminRoleHistory` server fn (+ small `whoAmI` helper for e2e).
- `package.json` — `test:e2e` script + Playwright dev dep.
- `docs/security-controls.md` — note the e2e coverage matrix.

Create:
- `src/routes/_admin.admin.super-admins.history.tsx`
- `playwright.config.ts`
- `e2e/rbac.spec.ts`

## Out of scope

- Multi-identity Playwright orchestration that programmatically mints extra sessions (requires service-role keys we don't hand out in Lovable Cloud). The suite adapts to whichever session Lovable injects.
- Redesign of the existing audit page — the new page is separate and role-history-specific.
