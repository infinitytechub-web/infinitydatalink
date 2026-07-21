
# IT-360 CashApp — System Interface Phased Plan

Delivered in 5 phases. Each phase is independently shippable and passes typecheck/build before the next starts. GHS is the default currency; FX uses `exchangerate.host` (no key).

---

## Phase 1 — Dual Login + Auth polish

Redesign `src/routes/auth.tsx` into a two-panel layout matching the reference image.

- Left panel: **User Login** (teal gradient, member iconography, "Sign in as member" CTA, link to sign-up + forgot password).
- Right panel: **Administrator Login** (deep-emerald/gold accent, shield icon, "Staff sign-in" CTA, no self-service sign-up link).
- Shared behind the scenes: same Supabase `signInWithPassword`; after sign-in, existing role gate routes members to `/app` and staff to `/admin` (no schema change).
- Keep + polish password **strength meter** and **eye toggle** (already present) on both panels; add caps-lock hint and inline validation.
- Responsive: stacks vertically < 900px with a segmented tab (User / Admin) to switch panels.
- Apply professional typeface (already `serif`/`sans` tokens) consistently; refine spacing, focus rings, and dark-mode contrast.

Signup approval gate (paired with Phase 4 DB change but shown to user here):
- After successful sign-in, if `profiles.status = 'pending'` → route to a new `/auth/pending` screen ("Awaiting admin approval").
- If `rejected` → `/auth/rejected` with contact prompt.

---

## Phase 2 — 3D auto-collapse navigation

Enhance `src/components/portal-shell.tsx` (used by both `_admin` and `_member` shells).

- Add a subtle 3D treatment: layered shadow, gradient rail, raised active card, hover lift; respects `prefers-reduced-motion`.
- Behavior: sidebar **auto-collapses to icon rail** after any nav item click; hamburger/chevron re-expands. Persist state per portal in `localStorage`.
- Keyboard: `[` toggles; focus outline preserved when collapsed.
- Mobile: existing sheet drawer — auto-close on navigation (fix if currently sticky).
- No route/data changes.

---

## Phase 3 — Admin dashboard widgets

Extend `src/routes/_admin.admin.index.tsx` with a grid of professional cards. All widgets use existing tokens + `recharts`.

Widgets:
1. **Quick Statistics Cards** — members, active loans, deposits today, GHS liquidity (reuse `admin-analytics` KPIs).
2. **Real-time AI Business Intelligence** — narrative summary + 3 recommended actions via `src/lib/ai-insights.functions.ts` (Lovable AI Gateway, existing); auto-refresh every 5 min.
3. **Analytics Dashboard** — 30-day cash-flow + contribution mix charts.
4. **System Health & Performance** — surfaces `admin-health` probes with pass/fail chips and last-run timestamp.
5. **Live Users panel** — Supabase Realtime presence channel `presence:admin`; shows currently-online staff with avatars.
6. **Notifications Center** — new `notifications` table (per-admin, read/unread, category); bell in header + drawer list.
7. **Recent Activity Feed** — top 20 rows from `audit_log`.
8. **System Status Monitoring** — DB latency, edge-fn last error, email queue depth (from existing analytics_query).
9. **Universal Currency Converter Widget** — GHS default, dropdown for USD/EUR/GBP/NGN/etc., live rates from `exchangerate.host` via a `createServerFn` that caches 30 min in-memory + DB (`fx_rates` table).
10. **Purge controls** — buttons on Notifications, Audit Trail, and a new **Recycle Bin** section; each calls a server fn that soft-deletes → hard-deletes after confirm dialog with typed confirmation. All purges write to `audit_log`.

New tables (Phase 4 migration bundles these):
- `notifications(id, user_id, category, title, body, read_at, created_at)`
- `fx_rates(base, quote, rate, fetched_at)`
- `recycle_bin(id, entity_table, entity_id, payload jsonb, deleted_by, deleted_at, purge_after)`

---

## Phase 4 — RBAC, signup approval, settings guardrails

Database migration (single file):

- `profiles`: add `status text not null default 'pending' check (status in ('pending','approved','rejected','deactivated'))`, `approved_by`, `approved_at`, `rejection_reason`.
- Update `handle_new_user()` trigger: leaves status='pending'; existing rows backfilled to `approved` in same migration.
- Add `approve_user(_uid, _note)` / `reject_user(_uid, _reason)` / `set_user_active(_uid, _active)` SECURITY DEFINER RPCs (super_admin or compliance_officer).
- Create tables from Phase 3 (`notifications`, `fx_rates`, `recycle_bin`) with GRANTs + RLS.
- New `permissions` + `role_permissions` tables so admins can create/edit **custom roles** and toggle permissions without a code deploy. Seed with the built-in matrix from `admin-role-management.functions.ts`.
- `system_settings(key, value jsonb, updated_by, updated_at)` gated to super_admin for currency / FX overrides / regional settings.

Server functions (`src/lib/`):
- `admin-approvals.functions.ts` — list pending signups, approve, reject (bulk).
- `admin-permissions.functions.ts` — CRUD custom roles, assign/revoke permissions, activate/deactivate accounts.
- `system-settings.functions.ts` — read/write default currency, FX override, regions.
- `fx.functions.ts` — public FX fetch (server-cached) + admin manual override.
- `notifications.functions.ts` — list, mark read, purge.
- `recycle-bin.functions.ts` — list, restore, purge.

Routes:
- `/admin/approvals` — pending signup queue with approve/reject.
- `/admin/roles` — extended with **Create role** + **Edit permissions** tabs.
- `/admin/settings` — currency, FX, regions, purge retention windows (super_admin only).
- `/admin/recycle-bin` — recoverable deletions.
- `/auth/pending`, `/auth/rejected` — post-signup gates.

Gate wiring: `_member.tsx` + `_admin.tsx` check `profile.status`; only `approved` proceeds.

---

## Phase 5 — Expanded Branding

Extend existing `branding_settings` table + `BrandingProvider`:

- Add fields: `secondary_color`, `favicon_url`, `login_hero_url`, `login_tagline`, `org_legal_name`, `org_address`, `org_registration_no`, `footer_html`, `email_header_logo_url`, `email_footer_html`, `support_email`, `support_phone`.
- `/admin/branding` gets tabbed sections: **Identity**, **Colors**, **Login Screen**, **Organization**, **Footer**, **Email Branding**. Live preview panel on the right.
- `BrandingProvider` injects favicon `<link>`, secondary color CSS var, footer content into shells; `auth.tsx` reads `login_hero_url` and `login_tagline`; email templates in `src/lib/email-templates/*` read new branding fields.

---

## Delivery order

1. Phase 1 (auth) — no DB change, ships immediately.
2. Phase 2 (nav) — pure UI.
3. Phase 4 DB migration + approval gate (blocks new signups behind admin).
4. Phase 3 widgets consuming new tables.
5. Phase 5 branding expansion.

## Technical notes

- FX: server fn calls `https://api.exchangerate.host/latest?base=GHS`; store in `fx_rates`, TTL 30 min, fallback to last cached row on network fail. Admin can override any pair manually via `system_settings`.
- Live users: Supabase Realtime presence on channel `presence:admin` joined inside `AdminLayout`; no DB writes.
- Purge: two-step confirm dialog requires typing "PURGE"; server fn logs `audit_log` action `system.purge` with counts.
- Every new `public` table ships with `GRANT` + RLS + policies in the same migration.
- Reuse existing `role-guards.ts`; add `permission-guards.ts` sourced from `role_permissions` join for dynamic checks.
- Signup approval: default `disable_signup=false` unchanged; users can sign up but can't reach `/app` until approved.

## Out of scope (unless requested)

- No mobile app; only responsive web.
- No new payment integrations.
- No overhaul of existing loans/savings flows beyond permission wiring.
