# Phase 3–4: Operations, Withdrawals, File Management, Notifications

## 1. Operations Dashboard (Admin)

New page `/admin/operations` — a single live control board for the duty officer, refreshed every 15 seconds.

- Queue counters with age/SLA breach highlighting: pending user approvals, KYC reviews, withdrawal requests, loan applications, loan workouts/settlements, staged settings changes, support items.
- Money-in-motion strip: today's deposits, withdrawals paid, loan repayments, teller cash position, open teller tills.
- Activity feed: newest audit entries with actor, action and target, each linking to the record.
- Health tiles: failed recurring contributions, failed notification outbox rows, last scheduled-job runs, unresolved runtime errors, users online now.
- Every tile deep-links into the module that owns the work, so nothing is a dead end.

## 2. Withdrawals module

The request/approve/reject/pay/cancel engine already exists (`src/lib/withdrawals.functions.ts`) and the admin queue lives at `/admin/savings/withdrawals`. The gap is the member surface and one dedicated admin entry point.

- New member page `/app/withdrawals`: request form (account, amount, channel, reason) validated against the configured minimum/maximum/daily limits and available balance net of holds; list of my requests with filters and pagination; cancel while pending; per-request status timeline; CSV/print of my withdrawal history.
- Withdrawals promoted to a top-level admin nav item, keeping the existing queue page (approve, reject, pay, bulk cancel, settings, export) as the destination.
- Status changes continue to write audit entries and notify the member in-app/email/SMS; the member page shows the officer's note or rejection reason.

## 3. File Management module (new)

Today only KYC and entity documents exist, and the admin register is super-admin-only. This adds a general secure file store.

- New private storage bucket plus a `member_files` table recording owner, folder/category, filename, mime type, size, checksum, visibility (private to member vs shared with staff), uploader, review state and soft-delete.
- Member page `/app/files`: drag-and-drop upload with client + server validation (allowed types PDF/JPEG/PNG/DOCX/XLSX/CSV, size cap, extension-vs-mime match, per-member quota), list with search and category filter, in-app preview for images/PDF via short-lived signed URLs, download, rename, delete.
- Admin page `/admin/files`: all files with owner/category/date filters, preview, download, approve/reject with a note, delete, and CSV export — gated on the `files` capability rather than hard-coded super admin.
- Every upload, preview, download, metadata change and delete writes an audit entry with the file id, owner and actor; rejected uploads are recorded in the existing upload-scan log.

## 4. Notifications Center

In-app notifications, read/unread, preferences and history already exist (`/app/inbox`, `/app/notifications`, `/admin/notifications`). This completes them rather than rebuilding.

- Header bell in both portals: unread count badge, dropdown of the newest items, mark-read on open, "view all" into the inbox, live-updating from the existing realtime subscription.
- Inbox additions: category grouping, unread-only quick filter, bulk mark read/unread, per-item deep link into the originating record, and empty/error states.
- Preferences page gains the categories introduced by this phase (withdrawals, files, teller postings) with per-channel toggles.
- Admin delivery page gains resend for failed outbox rows and a per-category delivery summary.

## Technical notes

- New server functions: `src/lib/operations.functions.ts` (aggregated counters + feed, `approvals.view`-gated), `src/lib/files.functions.ts` (member upload/list/sign/delete) and admin file actions gated by `files.*` capabilities via `assertPermission`.
- One migration: `member_files` table with GRANTs, RLS (owner reads/writes own rows; staff read via `has_permission_for('files', ...)`), timestamps and update trigger; storage RLS policies on the new bucket; the bucket itself created with the storage tool.
- Reads follow the existing loader + `useSuspenseQuery` pattern; writes go through `useServerFn` mutations with toast feedback. All privileged writes use the admin client only after `assertPermission`, and every state change calls `writeAudit`.
- Signed URLs are minted server-side with short expiry and never stored in client state beyond the open preview.
- Nav and breadcrumb maps in `_admin.admin.tsx` and `_member.app.tsx` updated for Operations, Withdrawals, Files; each new route gets its own title/description/noindex head.
