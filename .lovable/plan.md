## Savings — Next 4 Modules

Building all four selected capabilities on top of existing tables (`savings_accounts`, `savings_plans`, `transfers`, `transactions`). No breaking changes to existing UI.

### 1) Savings goals & progress

- Add `goal_started_at`, `goal_completed_at`, `last_milestone_pct` columns to `savings_accounts` (goal_amount/target_date already exist).
- New server fns: `setGoal`, `clearGoal`, `getGoalProgress` (includes projected completion date from avg monthly contribution).
- UI: `<GoalCard/>` with animated SVG progress ring, target vs. current, projected date, on-track badge.
- Add `GoalDialog` on `_member.app.savings.index.tsx` and account detail page.
- After each cleared deposit, DB trigger notifies member at 25/50/75/100% milestones via `notifications` table (writes once per threshold using `last_milestone_pct`).

### 2) Admin plan management

- New route `_admin.admin.savings.plans.tsx` (CRUD for `savings_plans`).
- Server fns in new `src/lib/admin-savings-plans.functions.ts`: `listPlans`, `createPlan`, `updatePlan`, `togglePlanActive`, `reorderPlans`. All gated by super_admin/finance_officer and write `audit_log` rows (`savings_plan.created|updated|activated|deactivated`).
- Form with name, schedule, rate, min contribution, contribution amount, lock days, description, sort order, active flag.
- Guard: prevent deactivating a plan that has active accounts (soft warn + require reason).

### 3) Own-account transfers & sweeps

- New table `savings_sweeps`: id, user_id, from_account_id, to_account_id, amount, frequency (weekly/monthly), day_of_week/day_of_month, next_run_at, status, last_run_status/error, runs_completed.
- Reuse existing `request_transfer` RPC for instant own-account transfers; add server fn `submitOwnAccountTransfer` that verifies both accounts belong to caller and skips 2-step approval (calls `clear_transfer` if same owner).
- Server fns: `listMySweeps`, `createSweep`, `pauseSweep`, `resumeSweep`, `deleteSweep`.
- Cron: DB function `run_savings_sweeps()` + `pg_cron` hourly. Runs due sweeps by calling `post_transfer` + auto-clear when both accounts share owner.
- UI additions on `_member.app.transfers.tsx`: "Between my accounts" quick action + "Scheduled sweeps" section with pause/resume/edit.

### 4) Statements & interest accrual

- New table `savings_statements`: id, account_id, user_id, period_start, period_end, opening_balance, closing_balance, deposits_total, withdrawals_total, interest_credited, generated_at.
- DB function `accrue_monthly_interest(_period_end date)`:
  - For each active account, compute monthly interest = balance × (rate/12), post an `interest` transaction (cleared), update balance, and upsert a `savings_statements` row summarizing the period.
  - Writes `audit_log` (`savings.interest_accrual`).
- Cron: 1st of each month at 02:00 UTC calls `accrue_monthly_interest`.
- Server fns: `listMyStatements`, `getStatement` (returns line items for the period).
- Route `_member.app.savings.statements.tsx`: table of statements with download buttons (CSV + PDF via dynamic `jspdf` import). PDF header uses `branding_settings`.
- Admin manual trigger button on `_admin.admin.savings.tsx` (super_admin only) to re-run current period accrual with confirmation and audit note.

### Technical details

- All server fns follow existing pattern: `createServerFn().middleware([requireSupabaseAuth]).inputValidator().handler(...)`, RLS-scoped queries via `context.supabase`, privileged RPCs via `supabaseAdmin`.
- Migrations follow the CREATE TABLE → GRANT → ENABLE RLS → CREATE POLICY sequence; `authenticated` gets scoped access, `service_role` all, no `anon`.
- All new admin actions log to `audit_log` with actor role.
- CSV export uses existing `src/lib/exports.ts` (formula-injection safe). PDF import is dynamic to keep SSR safe.
- No changes to auto-generated Supabase files or branding pipeline.

### File map

New:
- `src/lib/admin-savings-plans.functions.ts`
- `src/lib/savings-goals.functions.ts`
- `src/lib/savings-sweeps.functions.ts`
- `src/lib/savings-statements.functions.ts`
- `src/components/goal-card.tsx`, `src/components/goal-dialog.tsx`, `src/components/sweep-dialog.tsx`
- `src/routes/_admin.admin.savings.plans.tsx`
- `src/routes/_member.app.savings.statements.tsx`
- `src/routes/api/public/hooks/monthly-interest.ts`
- `src/routes/api/public/hooks/savings-sweeps.ts`
- 2 migrations (schema + cron)

Edited:
- `src/routes/_member.app.savings.index.tsx` (goal card + goal dialog + statements link)
- `src/routes/_member.app.savings.$accountId.tsx` (goal panel)
- `src/routes/_member.app.transfers.tsx` (own-account quick action + sweeps section)
- `src/routes/_admin.admin.savings.tsx` (plans link + manual accrual button)

Proceeding with implementation.
