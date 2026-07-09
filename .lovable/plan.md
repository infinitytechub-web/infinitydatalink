## Phase: Savings accounts & plans (real data)

Replace placeholder savings UI with real, KYC-gated savings flows for members and live admin oversight.

### 1. Database

Extend the schema so plans carry meaningful terms, accounts track goals, and money movement uses a safe ledger.

- `savings_plans`: add `description`, `min_contribution`, `contribution_amount`, `lock_days`, `is_active`, `sort_order`. Seed 4 starter plans (Cooperative Shares, Susu Daily, Real Estate Fund, Education Fund).
- `savings_accounts`: add `nickname`, `goal_amount`, `goal_target_date`, `status` (active | closed), unique `(user_id, plan_id)` while active.
- New `savings_contributions_schedule` (optional cron-friendly log) — skip for now; use `transactions` as source of truth.
- New RPC `public.post_savings_contribution(_account_id uuid, _amount numeric, _channel text, _note text)` — SECURITY DEFINER, verifies caller owns account and is KYC-approved, inserts a `deposit` transaction with `status='pending'`, updates `savings_accounts.updated_at`. Balance only moves when finance officer marks the transaction `posted`.
- New RPC `public.post_savings_withdrawal(...)` — same shape, requires balance ≥ amount, creates `withdrawal` transaction `pending`.
- New RPC `public.finalize_transaction(_txn_id uuid, _status txn_status)` — finance/super_admin only; on `posted`, adjusts `savings_accounts.balance` atomically; on `failed`, no balance change.
- RLS: members read own accounts / own transactions; finance_officer + super_admin read all; only the RPCs mutate balance.
- GRANTs on every new/altered table for `authenticated` + `service_role`; EXECUTE on RPCs to `authenticated` only.

### 2. Server functions (`src/lib/savings.functions.ts`)

All `requireSupabaseAuth`.

- `listMyAccounts()` — accounts joined to plans, with computed progress %.
- `listAvailablePlans()` — active plans not yet enrolled by caller.
- `enrollInPlan({ plan_id, nickname, goal_amount?, goal_target_date? })` — insert account, blocked if KYC not approved.
- `getMySavingsAccount({ id })` — account + recent 20 transactions.
- `submitContribution({ account_id, amount, channel, note? })` → calls RPC.
- `submitWithdrawal({ account_id, amount, channel, note? })` → calls RPC.
- Admin fns (finance_officer / super_admin gated via `has_role`):
  - `adminListSavingsSummary()` — total balances, active plans, pending contribution count, failed-24h count, per-plan breakdown.
  - `adminListPendingTransactions({ page, kind? })`.
  - `adminSettleTransaction({ txn_id, status, note? })` → calls RPC + writes audit_log.

### 3. Member UI

- `/app/savings` (existing) — replace mock with `listMyAccounts`: cards showing plan, balance, goal progress bar, next-contribution CTA. Empty state → "Enroll in a plan" opens `/app/savings/enroll`.
- `/app/savings/enroll` — plan picker (name, schedule, interest, min contribution), nickname + optional goal form, submit → `enrollInPlan`. KYC-not-approved gate shows link back to `/app/kyc`.
- `/app/savings/$accountId` — details page: balance, goal progress, "Add contribution" + "Request withdrawal" dialogs, recent transactions table with status pills.

### 4. Admin UI

- `/admin/savings` — replace mock KPIs and plan table with `adminListSavingsSummary` output. Add "Pending contributions" section (top 10 pending) with quick Approve / Reject buttons calling `adminSettleTransaction` (requires note on reject).

### 5. Notifications & audit

- Reuse existing transactional email pipeline to email member on contribution `posted` / `failed` (template `savings-contribution-settled`).
- Every admin settle writes an `audit_log` row: `action='savings.settle'`, target = txn id.

### Technical notes

- Money stored as `numeric(14,2)`; UI formatting via existing `formatMoney`.
- Balance mutations only inside RPC transactions to prevent double-posting; RPCs use `FOR UPDATE` on `savings_accounts` row.
- Reuse existing `SectionCard`, `KPIStat`, `Money`, `StatusPill`, `Pagination`, `SortHeader`, `ExportBar` primitives — no new design tokens.
- Query keys namespaced `["member","savings",...]` and `["admin","savings",...]` so KYC/transaction mutations can invalidate precisely.
- All new server fns callable only under `_member` / `_admin` layouts (both are `ssr:false`); no public loader touches them.

### Deliverables checklist

- [ ] Migration: plan/account columns, RPCs, RLS, GRANTs, seed plans
- [ ] `src/lib/savings.functions.ts` (member + admin)
- [ ] Member savings list, enroll, detail routes
- [ ] Admin savings dashboard with pending queue
- [ ] Settlement email template + wiring
- [ ] Audit log entries on admin actions
