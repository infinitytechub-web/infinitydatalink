# Member reports: drill-down, reconciliation, scheduled statements

Three additions to the member reports hub at `/app/reports`.

## 1. Drill-down to full details

Every report row gains a record identity so the reference cell becomes a link:

- Savings rows link to the existing account page, loan rows to the existing loan page.
- Transactions, withdrawal requests, repayment instalments and payment receipts have no detail page today, so they open a details panel on the reports page: full record fields, related member/loan/account context, status trail where one exists (withdrawal timeline, receipt payment intent), and a "Copy JSON" action.
- The open record is stored in the URL (`?record=<dataset>:<id>`), so a details view is deep-linkable and survives refresh, matching the admin audit details panel.

## 2. Reconciliation view

A new tab on the reports hub, scoped to the signed-in member:

- Pending vs cleared totals for the selected date range, plus a count of failed items.
- Mismatch checks, each row explaining the issue and linking through to the record via the drill-down above:
  - Pending transactions older than a configurable ageing threshold (default 3 days).
  - Withdrawal requests marked paid with no matching cleared withdrawal transaction.
  - Payment receipts with no cleared transaction for the same reference/amount.
  - Repayment instalments marked paid whose paid amount has no matching cleared repayment entries.
  - Savings accounts whose recorded balance differs from the balance recomputed from cleared movements (same signed-kind logic the admin reconciliation already uses).
- A clean state message when nothing is flagged, and CSV/Excel/PDF export of the mismatch list through the existing export bar (audited like other member downloads).

## 3. Scheduled statement delivery

- Members configure schedules on the reports hub: dataset, frequency (weekly / monthly / quarterly), delivery channels (email and/or SMS), and active/paused toggle. Existing notification preferences still apply, so a member who has email or SMS off will see that flagged.
- A background job generates each due statement, records the run, and queues delivery: email carries the statement (period totals plus a CSV attachment-style body of rows, capped), SMS carries a short summary with a link back to `/app/reports`.
- Each schedule shows last run, last outcome and next run so delivery is verifiable.

## Technical notes

**Database (one migration)**

- `statement_schedules`: user_id, dataset, frequency, channels (email/sms booleans), timezone-free `next_run_at`, `last_run_at`, `last_status`, `last_error`, active flag, timestamps + updated_at trigger. GRANTs for `authenticated` (own rows) and `service_role`; RLS scoped to `auth.uid()`.
- `statement_runs`: schedule_id, period_start/period_end, row_count, channels attempted, status, error, created_at — unique on (schedule_id, period_start, period_end) for idempotent re-runs. GRANT select to `authenticated`, all to `service_role`.
- `statement_job_lease`: single-row lease with expiry for single-flight.
- `pg_cron` entry hitting the new hook hourly.

**Server**

- `src/lib/member-reports.functions.ts`: extend row builders to carry `record_id` (and `record_kind`) without changing the exported column sets; add `getMyRecordDetail` (auth middleware, own-record checks per table) returning a plain DTO.
- `src/lib/member-reconciliation.functions.ts`: `runMyReconciliation` with the pending/cleared aggregation and mismatch rules; signed-kind map reused from the admin savings reconciliation logic.
- `src/lib/statement-schedules.functions.ts`: list/upsert/delete/pause schedules plus `runMyScheduleNow` for a manual send; `statement-schedules.server.ts` holds the due-schedule processor (bounded batch, lease, idempotent run rows, `enqueue_email` for email and the existing notification dispatch for SMS, pause on repeated failure).
- `src/routes/api/public/hooks/statement-schedules.ts`: cron hook following the existing hook pattern (`authorizeCronRequest`, admin client, JSON result, paused-state guard, bounded batch).

**UI**

- `src/routes/_member.app.reports.tsx`: linked reference cells, `?record=` details panel, a Reconciliation tab, and a Scheduled statements card.
- New components `src/components/report-record-details.tsx` and `src/components/statement-schedule-panel.tsx`; reuse `ExportBar`, `SectionCard`, `KPIStat`, `Money`, `StatusPill`.
- Head metadata on the reports route stays unique; no new top-level routes are added.
