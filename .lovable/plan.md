## Goal

Turn the admin area into a data-driven analytics surface: replace mocked KPIs and activity with live metrics from the database, add a real pending-approvals feed on the dashboard, and ship a dedicated Reports page with date-range analytics and CSV/PDF export.

## Data layer — new server functions

New file `src/lib/admin-analytics.functions.ts`, all `createServerFn` + `requireSupabaseAuth` + admin-role guard (`private.has_role(userId,'admin')`), returning plain DTOs.

- `getAdminOverview` — one call for the dashboard KPI strip and side rails:
  - `members_total`, `members_new_30d`
  - `savings_aum` (sum of `savings_accounts.balance`), `savings_delta_mom` (this month vs previous month net contributions)
  - `loans_active_principal` (sum of `loans.amount` where status in `approved`,`active`), `loans_on_time_rate` (approved+not-overdue / approved)
  - `pending_counts`: loans pending, plus a placeholder 0 for withdrawals until they exist
  - `recent_activity`: last 8 rows from `audit_log` joined to `profiles` for display name
  - `pending_approvals`: 5 newest `loans` where status='pending' with member name, amount, ref, product
- `getReport` — parameterised analytics for the Reports page:
  - Input (Zod): `{ from: ISO, to: ISO, granularity: 'day'|'week'|'month' }`
  - Returns:
    - `series.new_members[]` — bucketed profile signups
    - `series.contributions[]` — sum of `transactions.amount` where type in deposit/contribution
    - `series.disbursements[]` — sum of `loans.amount` where decided_at in range and status=approved
    - `series.repayments[]` — sum of `transactions.amount` where type='loan_repayment'
    - `totals` — same 4 metrics summed for the range
    - `loan_status_mix` — count per status in range
    - `top_products` — count/amount grouped by loan product
  - Bucketing done with `date_trunc(granularity, ...)` via `supabase.rpc` or a SQL view; if no view exists yet, use small server-side aggregation in JS after pulling raw rows filtered by date (rows already filtered by RLS/date so volume stays bounded).

All heavy aggregations run through `context.supabase` (RLS as admin). If any query needs privileges beyond the admin's own reads (e.g. counting rows across every member), call `has_role` first, then load `supabaseAdmin` inside the handler — no module-scope import.

## Route wiring

### `src/routes/_admin.admin.index.tsx` — live dashboard
- Convert to `useSuspenseQuery(overviewQueryOptions)` with a route loader that primes it via `ensureQueryData`.
- Replace the four hard-coded `<KPIStat>` values with the live overview.
- Replace mock `approvals[]` with `overview.pending_approvals`; keep Approve/Reject buttons wired to the existing `decideLoan` mutation from `admin-loans.functions.ts`, invalidating the overview query and the audit query on success.
- Replace `live[]` with `overview.recent_activity`, rendering `action`, actor email, and relative time.
- Add `errorComponent` and `pendingComponent` (skeleton) to the route.

### `src/routes/_admin.admin.reports.tsx` — new
- Placed under the existing `_admin` layout so it inherits the admin guard.
- Sidebar nav link added in the admin shell (`_admin.admin.tsx`) between Audit and Settings.
- URL-driven state via `validateSearch`: `from`, `to` (default: last 30 days), `granularity` (default `day`).
- Sections:
  1. **Filters bar**: date-range inputs, granularity segmented control, Reset.
  2. **Headline totals**: 4 KPI cards (new members, contributions, disbursements, repayments) for the selected range.
  3. **Trend chart**: single line/area chart with the 4 series, using `recharts` (already common in the stack — verify and install if missing).
  4. **Loan status mix**: small horizontal bar / pill list.
  5. **Top products**: table with product, count, total disbursed.
- `ExportBar` at page level to export the bucketed series as CSV/PDF using the existing export component (columns: bucket, new_members, contributions, disbursements, repayments).

### `src/routes/_admin.admin.tsx`
- Add the "Reports" nav item.

## Charts library

Check `package.json` for `recharts`. If absent, add it (`bun add recharts`). Use a single `<ResponsiveContainer>` + `<LineChart>` with 4 `<Line>` series and a shared `<XAxis>` on `bucket`.

## Empty and error states

- Empty range → `EmptyState` primitive with hint "Widen the date range or seed activity".
- Server-fn failure → route `errorComponent` shows message + retry via `router.invalidate()`.

## Out of scope

- Cohort analytics, funnel/retention.
- Realtime dashboard updates (polling only via query staleTime, e.g. 60s for overview).
- New RLS policies — reads all go through admin-authenticated queries against existing policies; if a query needs to bypass a per-user policy, use `supabaseAdmin` inside the handler after the role check.
- Withdrawals metrics — feature doesn't exist yet; leave counters at 0 with a "coming soon" hint.

## Technical notes

- Server fns live in client-safe `src/lib/admin-analytics.functions.ts`; no top-level `client.server` import.
- Admin gate pattern reused from `admin-loans.functions.ts` (has_role check on entry).
- All time bucketing returns ISO strings; formatting is client-side.
- Query keys: `['admin','overview']`, `['admin','report', from, to, granularity]`.
- Router preload stays at `defaultPreloadStaleTime: 0`; Query owns freshness (overview stale 60s, report stale 30s).