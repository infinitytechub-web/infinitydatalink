## Goal

Swap member savings, loans, and transactions pages from mock arrays to live Supabase data, and add a member loan application form that persists to the backend as a pending approval.

## Data layer

Create `src/lib/member-data.functions.ts` with `createServerFn` + `requireSupabaseAuth` handlers:

- `getMySavings` — joins `savings_accounts` with `savings_plans`; returns plan name, schedule, balance, interest rate.
- `getMyLoans` — selects the member's `loans` rows (ref, product, amount, term, rate, status, decided_at).
- `getMyTransactions` — selects `transactions` for the user, newest first, limited (e.g. 200).
- `getMySummary` — aggregates KPI totals (total savings, active loan balance, next contribution) so the header stat cards match live data.
- `applyForLoan` — validates input with Zod (product, amount, term_months, purpose), generates a `ref` like `LN-YYYY-XXXX`, inserts a `loans` row with `status = 'pending'` and `user_id = context.userId`, writes an `audit_log` entry (`action: 'loan.application.submitted'`), and returns the new loan.

All fetchers return plain DTOs (no Supabase client objects).

## Route wiring (TanStack Query pattern)

For each of the three member routes, replace the mock arrays with:

- `queryOptions` keyed per resource (`['member','savings']`, etc.).
- `loader` calls `context.queryClient.ensureQueryData(...)`.
- Component uses `useSuspenseQuery` and renders the existing table/KPI markup with live rows.
- Add `errorComponent` and `notFoundComponent`, plus a `pendingComponent` skeleton.
- Empty-state handling (already have `EmptyState` primitive) when there are no rows.
- Wire `ExportBar` `rows` to the live data.

Routes touched: `src/routes/_member.app.savings.tsx`, `src/routes/_member.app.loans.tsx`, `src/routes/_member.app.transactions.tsx`, and `src/routes/_member.app.index.tsx` (overview KPIs).

Since the member area lives under `_member` (not `_authenticated`), confirm the layout gates unauthenticated users before loader runs; if not, move the queries into the component with `useSuspenseQuery` only (no loader) to avoid SSR 401s. Plan: inspect `_member.tsx` and use component-level `useSuspenseQuery` without a loader for safety.

## Loan application form

New component `src/components/loan-application-dialog.tsx`:

- Trigger: reuse the existing "Apply for a loan" button on `_member.app.loans.tsx`.
- Dialog with fields: Product (select: Business Expansion, Home Improvement, Education, Emergency), Amount (GH₵), Term (months), Purpose (textarea).
- Client-side Zod validation with inline errors.
- `useMutation` calling `applyForLoan` via `useServerFn`.
- On success: toast, close dialog, `queryClient.invalidateQueries(['member','loans'])` and `['member','summary']`.
- On error: toast with message.

## Status pill

Extend `StatusPill` mapping to cover loan statuses (`pending`, `approved`, `rejected`, `active`, `cleared`) if any are missing.

## Out of scope

- Admin approval UI (already covered by earlier phase plan).
- Seeding demo data — real accounts start empty; empty states handle it.
- Realtime subscriptions.

## Technical notes

- Server functions live in `src/lib/*.functions.ts` (client-safe path), imports at top only if client-safe.
- Bearer middleware already registered in `src/start.ts`, so `requireSupabaseAuth` works from components.
- Loan `ref` generation done server-side using `crypto.randomUUID().slice(0,4).toUpperCase()` combined with year.
