# Nine-module expansion: Reports, Teller, Operations, Loan Calculator, Withdrawals, Notifications, Support, Accounts & Access, File Management

The app already ships a large part of this surface: admin reports, savings/loan/withdrawal approval workflows, notifications + preferences, audit logging, RBAC with a database permission matrix, KYC gates, and document management. This work fills the genuine gaps and wires everything into one coherent Reports/Teller/Operations/Support/Files experience rather than duplicating what exists.

Because this is a very large scope, it is delivered in five sequenced phases. Each phase ends in a working, testable app.

## What already exists (reused, not rebuilt)
- Admin: reports, finance ledgers, savings + withdrawal approvals, loans (products, arrears, workouts, settlements), payments, notifications delivery, audit log + recycle bin, security centre, roles & permissions matrix, documents, vault.
- Member: savings (incl. goals, pots, fixed deposits, statements), loans, repayments, transactions, transfers, payments, inbox, alert settings, help FAQ page.
- Foundations: `role_permissions` capability matrix + `has_permission_for`, `writeAudit`, step-up re-auth, notification fan-out, transaction RPCs with references.

## Phase 1 — Roles, capabilities, Loan Calculator
- Add `teller` and `support_officer` to the role enum; add `teller`, `support`, `files`, `reports` capability modules to the permission matrix with explicit (not name-derived) grants, seeded in a migration and editable in the existing Roles & Permissions manager.
- Loan Calculator (`/admin/loan-calculator`, `/app/loan-calculator`): amount, rate, duration, frequency, start date; outputs installment, total interest, total repayment, full amortisation schedule with due dates and running balance. Reuses the existing amortisation logic used by disbursement so estimates match reality. Marked as an estimate, with "Apply for this loan" prefilling the existing loan application dialog.

## Phase 2 — Teller Mode
- New tables: `teller_sessions` (open/close, opening/closing float, expected vs counted, variance) and `teller_transactions` (teller id, member id, reference, type, method, amount, device info, timestamps), both with GRANTs, RLS scoped to the owning teller plus supervisory capabilities, and indexes.
- `/admin/teller` workspace gated by `teller.*` capabilities: member lookup by member/user ID, permitted profile summary, and posting of deposits, savings contributions, withdrawals, loan repayments, and permitted payments through the existing server-side posting RPCs (so balances, references, duplicate protection, and audit trails are unchanged).
- Receipt generation with print + download, today's transaction list, live drawer balance, session open/close, and end-of-day reconciliation with variance capture. Every posting writes an audit entry.

## Phase 3 — Operations Dashboard + Withdrawals completion
- `/admin/operations`: live KPI cards (members, active users, pending registrations, today's deposits/withdrawals/savings/repayments, pending loans, pending withdrawals, failed transactions, pending approvals, active tellers, teller transaction count), trend charts, system alerts feed, and a recent-activity table. Data comes from one aggregate server function; live refresh reuses the existing realtime/presence wiring.
- Withdrawals: extend the status set to Pending, Under Review, Approved, Processing, Completed, Rejected, Cancelled, Failed with a server-enforced transition map; add configurable limits and fees surfaced to the member before submitting. New member page `/app/withdrawals` (request, source account, method, limits, fees, status tracker, history, receipt download). Admin side gains review/process/complete actions, limit and approval-workflow configuration, and export — all audited.

## Phase 4 — Reports hub, Notifications, Support Center
- Admin Reports hub: one shared report engine with report definitions for savings, loans, repayments, withdrawals, deposits, income, expenses, transactions, members, teller activity, operations, notifications, audit logs, and account activity. Shared toolbar: date range, member/user filter, transaction-type filter, search, sorting, summary stats, charts, preview, print, and export to CSV, Excel, and PDF (CSV keeps the existing formula-injection sanitisation).
- Member Reports/Statements hub `/app/reports`: account, savings, and loan statements, transaction and withdrawal history, payment receipts, and financial summaries — all through owner-scoped authenticated server functions.
- Notifications: add the missing event types (deposits, teller postings, repayment reminders, payment confirmations, support responses, announcements) to the existing fan-out; add admin system announcements with targeting, plus notification history and preference coverage for the new types.
- Support Center: `support_tickets`, `support_ticket_messages` (internal-note flag), `support_ticket_attachments` with RLS so members see only their own tickets and staff need `support.*`. Member ticketing (category, description, attachments, replies, close) and staff console (assign, reply, priority, status, internal notes, attachments, search/filter, close). FAQ/help content and contact details move onto the ticket page; WhatsApp and live-chat hooks are configuration-driven placeholders in settings, clearly labelled as integration points.

## Phase 5 — Accounts & Access, File Management, verification
- `/admin/accounts`: create/edit users, activate/deactivate, suspend, lock/unlock, password reset and forced change, role and permission management, registration approve/reject, login and device history, session list and revocation. All privileged actions run through server functions that verify capabilities, require step-up for destructive ones, and write audit entries.
- File Management `/admin/files` plus a read-only member view: `files` table (owner, category, type, size, storage path, archived state) on a private storage bucket with signed URLs. Upload, preview, download, rename, categorise, archive, restore, delete, search, filter, export index. Server-side MIME/extension and size validation, per-file access control, upload history, malware-scan hook readiness (reuses the existing upload scan log), and audit logging on every action.
- Verification pass: install, typecheck, build; then an end-to-end run over admin login, member login, teller login, registration approval, savings/deposit/withdrawal/repayment postings, calculator to application, reports and each export format, notifications, support tickets, accounts actions, and file upload/download — checked on desktop and mobile widths in both light and dark mode, including negative tests that a member and a teller cannot reach capabilities they were not granted.

## Technical notes
- All new reads/writes are `createServerFn` handlers with `requireSupabaseAuth` and `assertPermission`; no route-level-only gating. Member-facing data stays owner-scoped through RLS.
- Every new public-schema table ships GRANTs, RLS enabled, explicit policies, timestamps with update triggers, and indexes for its filter columns in the same migration.
- Financial postings reuse existing RPCs so references, duplicate protection, status tracking, and balance atomicity are inherited rather than reimplemented.
- Exports: CSV/Excel generated server-side from the shared report engine; PDF rendered from the same dataset so print, preview, and download always agree.
- Navigation: admin and member menus are extended with the requested items; mobile bottom navigation keeps its current primary tabs with new modules under More.
