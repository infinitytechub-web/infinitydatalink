# Loans: real disbursement, officer repayment view, reminders, member account page

## 1. Disbursement moves money into the member's account
- When finance/admin confirms a staged disbursement, the loan amount is credited to the member's chosen savings account in the same step (balance + ledger transaction "Loan disbursement"), and the loan becomes active.
- Officer picks the destination account (member's savings accounts listed) when staging; defaults to the primary account.
- Cash/bank-payout channels still record the release without crediting savings.
- Member gets an in-app notification "Loan disbursed — GH₵X credited to <account>".

## 2. Repayment section on the Loan officer dashboard
- New "Repayments" panel on /admin/loan-dashboard: one row per active loan with member, product, installments paid / overdue / remaining, amount paid, outstanding balance, next due date.
- Filters (all / overdue only), sorting, pagination; click opens the loan detail.
- Pending member-submitted payments shown with a Confirm button for officers, so the ledger updates once confirmed.

## 3. Due and overdue reminders (email + in-app)
- Daily scheduled check (once per day): installments due in 3 days, due today, and overdue (1, 7, 14 days).
- Each sends an in-app notification and an app email ("Repayment reminder" template in the brand style) with amount, due date and a Pay link.
- Never sends the same reminder twice for the same installment and stage.
- Requires the app email setup; if your sending domain is not ready, in-app reminders still work and email starts once it is.

## 4. Member account page (/app/account)
- Profile summary (name, member no., phone, email, KYC status), login history (date, device/browser, sign-in method), and recent activity (payments, withdrawals, profile changes).
- Only the signed-in member can see their own data; staff cannot open another member's page there.
- Login history recorded at each sign-in.

## 5. Live test on your test loan
- Submit a repayment on the test loan, confirm it as an officer, and verify the ledger row, remaining balance and installment counts update live on /app/repayments without refresh. Report results with screenshots.

## Technical details
- Migration: `loans.disbursement_account_id`; update `disburse_loan` to atomically credit the savings account via the existing balance RPC; `confirm_member_loan_repayment` RPC (staff-gated) allocating to schedule rows; `login_events` table (owner-only SELECT, insert via security-definer RPC); `loan_reminder_log` (unique installment+stage).
- Realtime subscription on repayment schedule/transactions for the member page.
- Reminder job: server route under /api/public/hooks with cron auth, scheduled daily; email via existing app-email send route + new `repayment-reminder` template.
- Member account route under the member layout using `requireSupabaseAuth` and RLS `auth.uid()` scoping.
- Tests for: no duplicate reminders, disbursement credits exact amount, member cannot read others' login history.
