## Status: SHIPPED — Member profile & KYC.

Turn the mocked member profile into a real KYC surface: editable personal details, next-of-kin management, ID document uploads into a private storage bucket, and an admin verification workflow that approves or rejects each member and drives `profiles.kyc`.

## Database migration

Single migration adding structure only (no data).

- Extend `profiles` with: `date_of_birth date`, `gender text`, `digital_address text`, `address_line text`, `occupation text`, `employer text`, `kyc_notes text`, `kyc_reviewed_by uuid references auth.users`, `kyc_reviewed_at timestamptz`.
- New enum `kyc_doc_type` — `national_id_front`, `national_id_back`, `selfie`, `proof_of_address`, `other`.
- New enum `kyc_doc_status` — `pending`, `approved`, `rejected`.
- New table `public.next_of_kin` — `member_id uuid references profiles`, `full_name`, `relationship`, `phone`, `email`, `national_id`, `address`, timestamps.
- New table `public.kyc_documents` — `member_id`, `doc_type kyc_doc_type`, `storage_path text unique`, `mime_type`, `size_bytes`, `status kyc_doc_status default 'pending'`, `reviewed_by uuid`, `reviewed_at`, `review_notes`, timestamps.
- GRANTs (per project rule) on both tables: `authenticated` SELECT/INSERT/UPDATE/DELETE, `service_role` ALL. No `anon`.
- RLS:
  - `next_of_kin`: member can read/write rows where `member_id = auth.uid()`; admins (`has_role(auth.uid(),'super_admin' | 'compliance_officer')`) can read all.
  - `kyc_documents`: member can `SELECT`/`INSERT`/`DELETE` own rows only while `status='pending'`; admins select all + update review fields.
  - `profiles`: keep existing member self-select/update; add admin update policy for `kyc`, `kyc_notes`, `kyc_reviewed_by`, `kyc_reviewed_at`.
- `update_updated_at_column` triggers on both new tables.
- Storage bucket `kyc-documents` (private) created via `storage_create_bucket`; storage.objects policies (via migration): user may `INSERT`/`SELECT`/`DELETE` only under prefix `<auth.uid()>/…`; compliance/super_admin may `SELECT` all under the bucket.

## Server functions

New client-safe modules — no top-level `client.server` import.

`src/lib/member-profile.functions.ts` (all `requireSupabaseAuth`):
- `getMyProfile` → `{ profile, next_of_kin[], documents[] }`.
- `updateMyProfile` (Zod: `full_name`, `phone`, `date_of_birth`, `gender`, `region`, `digital_address`, `address_line`, `occupation`, `employer`, `national_id`). Reject changes to `national_id`/`date_of_birth` when `profiles.kyc = 'active'`.
- `upsertNextOfKin`, `deleteNextOfKin`.
- `createKycUploadUrl({ doc_type, filename, mime_type, size_bytes })` — validates size ≤ 8 MB and mime in `image/jpeg|image/png|application/pdf`; returns `{ storage_path, signed_url, token }` via `supabase.storage.from('kyc-documents').createSignedUploadUrl`.
- `registerKycDocument({ doc_type, storage_path, mime_type, size_bytes })` — inserts row, sets `profiles.kyc='pending'`, writes `audit_log`.
- `deleteMyPendingKycDocument(id)` — deletes the storage object and row if `status='pending'` and belongs to caller.

`src/lib/admin-kyc.functions.ts` (admin-role guard via `has_role`):
- `listKycQueue({ status?, q?, page?, page_size? })` → paginated members + latest submitted doc + pending doc count.
- `getMemberKyc(member_id)` → full profile + next-of-kin + documents with short-TTL signed view URLs.
- `decideKyc({ member_id, decision: 'approved'|'rejected', notes })` — updates `profiles.kyc`, `kyc_reviewed_*`, marks all pending docs with the same decision, writes `audit_log` (required note when rejecting).
- `signKycDocument(document_id)` — 5-minute signed URL for admin viewing.

## Routes

### Rewrite `src/routes/_member.app.profile.tsx`
Three sections driven by `getMyProfile`:
1. **Personal details** — editable form (fields above), inline save via `updateMyProfile` mutation, banner showing `kyc` status (`Pending review`, `Verified`, `Rejected — see notes`), locked-field notice when `kyc='active'`.
2. **Next of kin** — table + add/edit dialog + delete, uses `upsertNextOfKin`/`deleteNextOfKin`.
3. **KYC documents** — per-type upload slots (National ID front/back, Selfie, Proof of address, Other). Flow: user picks doc_type + file → `createKycUploadUrl` → `uploadToSignedUrl` → `registerKycDocument`. Uploaded row shows status pill, uploaded date, delete button while pending. Rejected docs surface `review_notes`.

Region preset selector stays local as it is today.

### Rewrite `src/routes/_admin.admin.members.tsx`
- Live data via `listKycQueue`; status filter (`all|pending|active|rejected`), search box (name/member_no/national_id), pagination, ExportBar (existing `export:members` permission).
- Each row links to the new detail route.

### New `src/routes/_admin.admin.members.$id.tsx`
- Uses `getMemberKyc`. Shows profile card, next-of-kin list, documents grid with "View" button (opens signed URL in new tab), status pill, and an **Approve / Reject** action bar bound to `decideKyc`. Rejection requires a note (reuses the required-note pattern from loan decisions). Success invalidates `admin/kyc` queries and returns to the queue.

### `_admin.admin.tsx`
Add `/admin/members/$id` to CRUMBS map.

## UI conventions

- Reuse `PageHeader`, `SectionCard`, `StatusPill` (extend with `pending/active/rejected` mapping already covered).
- Forms use `react-hook-form` + Zod (present in stack).
- KYC status pill drives banner colour on member profile.

## Query keys / invalidation

- `['member','profile']`, `['admin','kyc','queue', filters]`, `['admin','kyc','member', id]`.
- After any mutation, invalidate the impacted key and `['admin','overview']` (KYC pending count feeds into future overview widgets).

## Out of scope

- OCR / automated ID matching.
- Tier promotion, biometrics, trusted devices.
- Email/SMS notifications on decision — audit_log only for now.
- Bulk decisioning; each member reviewed individually.

## Technical notes

- Storage path format: `<user_id>/<doc_id>-<safe-filename>`; enforced client-side and by the storage RLS prefix check.
- `has_role` already exists (see `db-functions`); admin gate uses the same set as `admin-analytics.functions.ts`.
- Ensure the migration adds an `updated_at` trigger for both new tables using the existing `public.update_updated_at_column`.
- No changes to auth-attacher/middleware wiring; existing bearer flow covers all new server fns.
