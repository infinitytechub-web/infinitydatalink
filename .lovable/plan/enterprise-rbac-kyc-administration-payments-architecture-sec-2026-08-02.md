# Enterprise RBAC, KYC administration, payments architecture & Security Center

This is a large program of work. It is sequenced into six phases so each one lands
working and verified without breaking what already exists. Everything listed is in
scope; the phases only control the order.

Verified starting point (checked against the live database and code):

- `app_role` currently has: `super_admin`, `compliance_officer`, `loan_officer`,
  `finance_officer`, `auditor`, `member`. There is **no** `manager` or generic `admin` role.
- `settings_change_requests` exists (0 rows) but only super admins can read/insert it,
  and the Change Approvals screen (`/admin/console/approvals`) is wired to that table only.
- `/admin/security` is a 72-line placeholder screen.
- `/admin/payments` today is only reconciliation over existing `transactions` — there is
  no payment-provider, webhook, receipt or gateway-config layer.
- Presence (`src/lib/online-presence.ts`) tracks user/name/role/online_at only — no
  last-login, session duration, IP or device data.
- Entity records (group / department / institution) exist with documents, but they have
  no KYC review workflow comparable to individual KYC.

---

## Phase 1 — Roles & granular permissions (foundation)

- Add `manager` and `admin` to the `app_role` enum. Keep the existing officer roles as
  the "Staff/Officer" tier so nothing currently working regresses.
- Introduce a permissions layer: module × action capability matrix
  (`view, create, edit, delete, approve, reject, export, print, download,
manage_users, manage_kyc, manage_payments, manage_security, manage_reports,
manage_settings`) over modules (kyc, membership, entities, savings, loans, payments,
  approvals, reports, security, settings, documents, users).
- Single source of truth in `src/lib/permissions.ts` plus a database mirror
  (`role_permissions` table + `private.has_permission(uid, module, action)`) so RLS
  policies and server functions enforce the same matrix as the UI.
- Extend `src/lib/auth.tsx` with `can(module, action)`; extend role-guard helpers and
  `rbac-matrix.ts` to consult permissions instead of hardcoded role lists.
- New/updated policies and grants for every table the new roles must reach.
- Admin → Roles & Permissions page gains a permission matrix editor (super admin only),
  with each change routed through Change Approvals (Phase 4).

## Phase 2 — Action controls everywhere

- One shared `RecordActions` component: View | Edit | Delete | Download | Print |
  Approve | Reject, each rendered only when `can(module, action)` allows it.
- Print support via a print-friendly stylesheet + per-record print view; download reuses
  the existing sanitised PDF/CSV/XLSX/DOCX exporters.
- Apply consistently to: individual KYC, entity records, loans, savings, withdrawals,
  transfers, expenses, payments, documents, approvals, notifications.
- Every destructive/decision action goes through a server function that re-checks
  permission, requires a note, honours step-up where already configured, and writes audit.
- Delete is soft-delete into the existing `recycle_bin` pattern wherever a hard delete
  would destroy financial history.

## Phase 3 — KYC administration for all member types

- Extend the existing individual KYC review with **edit/modify** (admin correction of
  submitted fields and documents) — every field change captured as a before/after audit
  entry, reusing the existing diff/snapshot machinery.
- Add a real KYC workflow to entities (group, department, institution): submission
  record, document checklist per type, reviewer queue, approve/reject with reason,
  resubmission, notifications — mirroring the individual flow so admins get one
  consistent experience.
- Delete/restore, download and print for all four KYC types, gated by `manage_kyc`.
- Admin KYC queue gains a type filter (Individual / Group / Department / Institution).

## Phase 4 — Change Approvals (complete module)

- Generalise `settings_change_requests` into an approvals engine: any registered change
  kind (settings, branding, role grant, permission matrix, payment config, KYC override,
  provider credentials) can be staged.
- Full lifecycle: Request → Review → Approve/Reject → Apply → Audit, with pending queue,
  approval history, approver identity, timestamps, change diff, reason/comments and
  failure capture on apply.
- Enforced two-person rule: requester cannot approve their own request; apply happens
  only inside a `SECURITY DEFINER` routine so the workflow cannot be bypassed by direct
  table writes. RLS opened to approvers (manager/admin/super admin) per permission.

## Phase 5 — Payment gateway architecture (credential-ready, no invented keys)

- `payment_providers` (config + capabilities + test/live mode, no secrets in the table),
  `payment_intents`, `payment_transactions`, `payment_webhook_events`, `payment_receipts`,
  all with grants, RLS and audit.
- Provider abstraction in `src/lib/payments/` with a typed `PaymentProvider` interface and
  a `manual/offline` provider active by default, so the flow works end-to-end today and a
  real provider drops in later.
- Server functions for initiate → authorise → capture → settle → refund, with idempotent
  transaction references and pending/succeeded/failed status tracking.
- Signature-verified webhook route under `src/routes/api/public/payments/webhook/$provider.ts`.
- Admin payment configuration screen: providers, modes, fees, callback URLs, and a
  "credentials required" state. Credentials are requested through the secrets flow when
  the administrator supplies them — nothing hardcoded.
- Member-facing payment history + downloadable/printable receipts.

## Phase 6 — Security Center, upload scanner, live users, navigation, verification

- **Security Center** (`/admin/security`) with: security event log, authentication and
  session monitoring, rate-limit and request-filter configuration, suspicious-activity
  detection (failed logins, privilege-denied events, impossible-location/burst patterns),
  access-control audit and RLS/permission posture summary.
- Backend enforcement: `security_events` table, per-identity rate limiting inside server
  functions and public routes, session hygiene checks, and denial logging on every
  permission failure.
- **Secure upload scanner** in a shared `src/lib/uploads/validate.server.ts`: size caps,
  extension allowlist, declared-vs-sniffed MIME check via magic bytes, filename
  sanitisation, dangerous-content heuristics (embedded scripts, polyglots, archive/exe
  signatures), quarantine on failure, private-bucket storage, and a security log entry.
  Routed through every existing upload path (KYC docs, entity docs, attestations, branding).
- **Real-time online users widget** on the admin dashboard: blinking green live indicator,
  last login, session duration, IP and device/browser — collected server-side into a
  `user_sessions` table on sign-in, joined into presence, and exposed **only** to admins
  with `manage_security`/`manage_users`. Non-privileged views keep the current
  name/role-only roster.
- **Navigation redesign**: regroup the sidebar into Overview, Membership & KYC, Savings,
  Lending, Payments, Reports, Governance, Security, Settings, with consistent icons,
  spacing, hierarchy, collapsible groups, command-palette search and mobile behaviour.
  Nothing removed — items are grouped and permission-filtered.
- **Verification**: security scan + linter, dependency audit, `tsgo` typecheck, unit/DB
  test suites (including new permission-matrix and upload-scanner tests), Playwright E2E
  for manager role, KYC edit, entity KYC, approvals, payment flow and the live-users
  widget, then a production build. Final report covers all ten requested points.

## Technical notes

- Roles stay in `user_roles`; permissions are role-derived in `role_permissions` — never
  stored on `profiles`, so no privilege-escalation path is introduced.
- All new tables follow the required order: CREATE TABLE → GRANT → ENABLE RLS → POLICY,
  with `authenticated`/`service_role` grants only where a policy allows the read.
- No new Supabase Edge Functions: app logic uses `createServerFn`; webhooks and cron use
  TanStack routes under `src/routes/api/public/*` with signature/secret verification.
- Existing officer roles, step-up sessions, audit helpers, recycle bin, notification
  fan-out and CSV-injection sanitisers are reused rather than replaced.

## Sequencing note

Phases 1–2 land first because everything else depends on the permission layer. I will
report progress after each phase, and existing functionality is re-verified at each step.
