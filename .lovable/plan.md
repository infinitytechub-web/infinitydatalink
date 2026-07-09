# KYC review workflow & notifications

Three additions on top of the existing KYC surface: an admin queue dashboard with reviewer assignment and bulk decisions, a member-facing status page, and email notifications on approval/rejection. SMS is deferred (hook in place).

## 1. Database migration

- Extend `profiles`: `kyc_assigned_to uuid references auth.users`, `kyc_assigned_at timestamptz`.
- Extend `kyc_documents`: `assigned_to uuid` is not needed — assignment lives on `profiles`.
- New enum `kyc_notification_channel` — `email`, `sms`.
- New table `public.kyc_notifications` — `member_id`, `channel kyc_notification_channel`, `decision kyc_doc_status`, `recipient text`, `subject text`, `status text` (`queued|sent|failed`), `error text`, `sent_at timestamptz`, timestamps. GRANTs + RLS (member reads own; admins read all; server writes).
- RLS additions on `profiles`: allow compliance/super_admin `UPDATE` of `kyc_assigned_to`, `kyc_assigned_at` (already covered by the existing admin update policy — verify and widen if needed).

## 2. Server functions

### `src/lib/admin-kyc.functions.ts` (extend)
- `getKycSummary()` → counts by status (`pending`, `active`, `rejected`) + unassigned pending + assigned-to-me + last-24h decisions. Used by dashboard summary cards.
- `listKycQueue` — extend inputs with `assignee: 'any'|'me'|'unassigned'|<uuid>`; return rows include `kyc_assigned_to`, assignee display name, `kyc_notes`.
- `listKycReviewers()` → admins with `super_admin`/`compliance_officer` roles for the assignment dropdown.
- `assignKyc({ member_ids: uuid[], assignee_id: uuid | null })` — bulk set/clear `kyc_assigned_to`; audit_log entry per member.
- `decideKyc` — after successful decision, enqueue email notification (see §4). No signature change.
- `bulkDecideKyc({ member_ids: uuid[], decision, notes })` — same validation as `decideKyc` (rejection requires ≥5 char note); runs per member in a single handler, aggregates results `{ succeeded, failed: [{id, error}] }`, enqueues one notification per approved/rejected member, single audit_log summary + per-member entries.

Admin gate reused via `assertKycAdmin`. Reviewer-of-record enforcement: for individual `decideKyc`, if `kyc_assigned_to` is set and not equal to caller, require `super_admin` role (override).

### `src/lib/member-kyc.functions.ts` (new, `requireSupabaseAuth`)
- `getMyKycStatus()` → derived progress:
  - `profile_complete` — required fields present (`full_name`, `phone`, `date_of_birth`, `gender`, `region`, `address_line`, `national_id`).
  - `documents_submitted` — has at least `national_id_front`, `national_id_back`, `selfie` uploaded (any status ≠ deleted).
  - `review_state` — `not_started|in_review|approved|rejected` from `profiles.kyc` + presence of docs.
  - `latest_decision` — `{ decision, notes, reviewed_at, reviewer_name? }` (reviewer name resolved only when approved; never reveal reviewer email).
  - `next_action` — human string + `link` (e.g. `/app/profile#documents`).
  - `notifications` — last 5 rows from `kyc_notifications` for this member (channel, status, sent_at).

## 3. Routes

### Rewrite `src/routes/_admin.admin.members.tsx` (queue dashboard)
- Header: `PageHeader` + 4 summary cards from `getKycSummary` (Pending, Assigned to me, Unassigned, Decided today).
- Filters row: status (existing), assignee dropdown (`Any / Me / Unassigned / <reviewer>` from `listKycReviewers`), search, page size.
- Table: checkbox column for selection, name/member_no, status pill, assignee cell with inline `Assign` popover (self-claim or pick reviewer), pending docs count, updated_at, link to detail.
- Selection toolbar (visible when ≥1 row selected):
  - `Assign to…` (dropdown of reviewers + Unassign).
  - `Bulk approve` → confirm dialog with optional shared note.
  - `Bulk reject` → dialog with required shared note (≥5 chars).
  - After success: toast with `succeeded/failed` counts, invalidate queue + summary.
- Keeps `ExportBar` (`export:members`).

### New `src/routes/_member.app.kyc.tsx`
- `PageHeader` "KYC verification".
- Stepper (3 steps: Profile details, Upload documents, Review) using status icons from `getMyKycStatus`.
- Current status banner using existing `StatusPill` colour scheme (Pending review / Verified / Rejected — includes `latest_decision.notes` when rejected).
- Next action card with primary button linking to `/app/profile` at the right anchor.
- Notification history list (Email · Sent 2h ago, etc.); "SMS coming soon" placeholder.
- Sidebar entry added to member nav (in `_member.app.tsx`) between Profile and Support.

### `src/routes/_member.app.profile.tsx`
- Add prominent link banner "View verification status →" pointing at `/app/kyc` when `kyc` is `pending` or `rejected`.

### `_admin.admin.tsx`
- Add breadcrumb label for `/admin/members` → "KYC queue".

## 4. Email notifications

Uses the Lovable app-email pipeline (queued, retriable).

- On first turn: call `email_domain--check_email_domain_status`. If no domain, show the standard email setup dialog and stop; resume after setup.
- If a domain exists, ensure infra + scaffold have run (`email_domain--setup_email_infra`, `email_domain--scaffold_transactional_email`) — the scaffold is idempotent.
- Add two React Email templates in `src/lib/email-templates/`:
  - `kyc-approved.tsx` — congratulations, next steps (open a loan / start saving), link to `/app/kyc`. Subject: "Your KYC verification is approved".
  - `kyc-rejected.tsx` — reviewer note (escaped via props), what to fix, link back to `/app/profile`. Subject: "Action needed on your KYC verification".
- Register both in `src/lib/email-templates/registry.ts`.
- New helper `src/lib/email/send-kyc-notification.server.ts` — server-only wrapper that:
  1. Loads recipient email + name from `profiles` / `auth.users`.
  2. Inserts `kyc_notifications` row (`status='queued'`).
  3. POSTs internally to `/lovable/email/transactional/send` with a service token, passing an idempotency key of `kyc-<decision>-<member_id>-<reviewed_at ms>` so retries dedupe.
  4. On failure, marks row `failed` with error, on success marks `sent` with `sent_at`.
- `decideKyc` and `bulkDecideKyc` call this helper after the transactional DB update; failures are logged to `audit_log` but do not fail the decision.

## 5. SMS hook (deferred)

- `kyc_notifications` supports `channel='sms'` but no rows are inserted yet.
- `send-kyc-notification.server.ts` has a TODO block for future Twilio/Africa's Talking implementation; UI on `/app/kyc` shows "SMS notifications coming soon".

## Out of scope

- SMS sending, in-app notification centre, admin push notifications.
- Reviewer performance analytics (decision count, avg time).
- Reassignment workflow beyond bulk assign/unassign (no comments/threads).
- Editing already-sent decisions.

## Technical notes

- Bulk operations run sequentially inside one server fn handler (small batch sizes; queue capped at 50 selections in UI). Failures are collected, not thrown.
- `kyc_notifications` writes go through the authenticated `supabase` client with a policy allowing compliance/super_admin insert; the send helper runs inside `decideKyc`/`bulkDecideKyc` which already asserts admin role.
- Reviewer names in member-facing responses are limited to `full_name`; never expose `email` or `id`.
- Query keys: `['admin','kyc','summary']`, `['admin','kyc','reviewers']`, `['member','kyc','status']`. Invalidate `summary` + `queue` after assign/decide/bulk-decide.
