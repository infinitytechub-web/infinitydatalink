# Individual Membership, Ghana Card Registration & Mandatory KYC

## What exists today (verified)

- Sign-up collects only full name, email, password. No Ghana Card or phone capture.
- `profiles` already has `status` (pending/approved/rejected/deactivated), `approved_at`, `approved_by`, `rejection_reason`, `national_id`, `phone`, `kyc`.
- Admin approval already works: approvals page plus `approve_user` / `reject_user` routines with audit-log writes.
- The member shell blocks unapproved users with a "Awaiting administrator approval" screen.
- A verification-status page exists at `/app/kyc`, but nothing forces KYC completion before using the rest of the dashboard.
- Entity registration supports `group`, `department`, `institution` only — there is no individual membership type.
- No uniqueness on `profiles.national_id` or `profiles.phone`.

So this work extends the existing flow; it does not rebuild approval or KYC from scratch.

## 1. Registration with Ghana Card

Add to the member sign-up form: Ghana Card number (fixed `GHA-` prefix shown in the field, user types the 10 digits only), telephone number, and membership type selector (Individual / Group / Department / Institution).

- Client validation: exactly 10 digits, canonical stored value `GHA-XXXXXXXXXX`; Ghana MSISDN check for phone.
- Duplicate prevention: unique indexes on normalized Ghana Card and phone, plus a pre-submit availability check so users get a clear "already registered" message instead of a raw database error.
- Server-side re-validation on account creation so the browser is never the only gate.

## 2. Approval workflow (extend, don't duplicate)

- New registrations continue to land as `pending`; the new biodata is stored on the profile at sign-up time.
- The existing admin approvals queue gains Ghana Card, phone, and membership-type columns and filters, so admins approve/reject in the same place they do now.
- Approve/reject continues to write status, reviewer, timestamp, reason, and an audit-log entry; approval additionally sends the member an in-app + email notification via the existing notification path.

## 3. First login → mandatory KYC

- After approval, first sign-in routes the member to the KYC flow instead of the dashboard overview.
- The member shell gains a KYC gate: until required profile fields and required documents are submitted, restricted pages redirect to the KYC page. Always-allowed pages: KYC, profile, notifications, support.
- A persistent KYC status banner/badge on the dashboard shows step progress (details → documents → review) and the review outcome.
- Admin KYC review queue keeps working as-is and additionally surfaces the Ghana Card and membership type.

## 4. Individual membership

- Extend the membership category set so "Individual" is a first-class type alongside group/department/institution, recorded on the member's profile at registration.
- The existing entity registration wizard keeps its current three types untouched; individual membership is captured on the person, not as a fake organization.
- Admin membership management gains a category filter and counts covering all four categories.

## 5. Validation, errors, and verification

- Consistent loading, error, and success states on every new form and action.
- End-to-end check with a scripted browser run: register with Ghana Card → duplicate attempt rejected → admin approves → first login lands on KYC → KYC submitted → admin reviews → dashboard unlocked. Plus existing group/department/institution registration regression, permission gates, and mobile/tablet layout checks.
- Typecheck and production build must be clean at the end.

## Technical notes

Database migration (single migration, additive only):
- `profiles`: add `membership_type` (individual/group/department/institution, default individual), `ghana_card` normalized column or reuse `national_id` with a canonical-format check, `kyc_submitted_at`.
- Unique indexes on the normalized Ghana Card and on phone (partial, ignoring nulls) so existing rows are unaffected.
- Extend `handle_new_user` to copy Ghana Card, phone, and membership type from sign-up metadata into the profile.
- New `check_registration_availability` routine (callable pre-signup) for duplicate detection without exposing other users' data.
- Keep the existing sensitive-column guard trigger: members still cannot self-edit Ghana Card, tier, KYC status, or approval status after registration.
- All new tables/columns keep current RLS posture; grants unchanged (no new public-schema tables planned).

Frontend:
- `src/routes/auth.tsx` — sign-up fields and validation.
- `src/lib/member-registration.functions.ts` (new) — availability check + normalization helpers.
- `src/routes/_member.app.tsx` — KYC gate and status banner.
- `src/routes/_member.app.kyc.tsx` — mandatory-completion messaging and next-step CTA.
- `src/routes/_admin.admin.members.tsx`, `_admin.admin.approvals.tsx`, admin KYC queue — new columns/filters.
- Ghana Card format/regex lives in `src/lib/org-config.ts` (updated to the `GHA-XXXXXXXXXX` form) so validation is defined once.
