## Goal

Close two gaps in the admin console: build the missing finance modules and add support for non-individual member types (Group, Department, Institution).

## What exists today

- Admin has: Analytics, Reports (contributions/disbursements), Loans, Members (KYC queue for individuals), Savings, Payments, Audit, Security, Super Admins, Settings.
- `profiles` covers individuals only. No entity model, no expenses, no transfers module, no cash-flow / P&L views.

## Part A — Financial modules

### A1. Database
New migration adds:

- `expenses` — id, category, vendor, amount, currency, incurred_on, paid_on, status (`pending|approved|paid|rejected`), payment_channel, reference, notes, created_by, approved_by, approved_at.
- `expense_categories` — seeded catalogue (Payroll, Rent, Utilities, Bank Charges, Marketing, IT, Travel, Other).
- `transfers` — id, from_account_id, to_account_id, amount, status (`pending|cleared|failed|reversed`), channel, note, ref, created_by, cleared_at. On clear, atomically debits/credits `savings_accounts` and writes two paired rows in `transactions` (kinds `transfer_out` / `transfer_in`).
- `balance_adjustments` — id, savings_account_id, direction (`credit|debit`), amount, reason, reference_txn_id, approved_by. On post, writes a `transactions` row (`adjustment`) and updates `savings_accounts.balance`.
- Extend `txn_kind` enum with `transfer_in`, `transfer_out`, `adjustment`, `expense` (if not present).
- RPCs (SECURITY DEFINER, `search_path` pinned, `finance_officer`/`super_admin` only): `post_expense`, `approve_expense`, `pay_expense`, `post_transfer`, `clear_transfer`, `post_balance_adjustment`.
- RLS: staff full access, members read-only on transfers where they are counterpart. All new tables get proper GRANTs + `service_role` full access.
- Audit-log entries for every state change.

### A2. Server functions (`src/lib/admin-finance.functions.ts`)
`listCashFlow(range)`, `listIncomeBreakdown(range)`, `listExpenses(filters)`, `createExpense`, `approveExpense`, `payExpense`, `listTransfers`, `createTransfer`, `clearTransfer`, `listBalanceAdjustments`, `postBalanceAdjustment`, `getFinancialSummary(range)`. All use `requireSupabaseAuth` + `finance_officer|super_admin` guard.

### A3. Routes
- `/admin/finance` — layout with sub-nav.
- `/admin/finance/index.tsx` — **Financial dashboard**: KPI cards (Net cash, Income MTD, Expenses MTD, Net position, Pending approvals), trend chart (income vs expenses), top categories.
- `/admin/finance/cash-flow.tsx` — inflow vs outflow table + area chart, date range, CSV/PDF export.
- `/admin/finance/income.tsx` — contributions + loan interest + fees, grouped and drillable.
- `/admin/finance/expenses.tsx` — expenses table with filters (status/category/date), create/approve/pay dialogs, exports.
- `/admin/finance/contributions.tsx` — dedicated view of member contributions, per-member and per-plan aggregates.
- `/admin/finance/transfers.tsx` — transfers ledger + "New transfer" dialog + clear/reverse actions.
- `/admin/finance/balances.tsx` — **Balance management**: per-account balances, reconciliation deltas, "Post adjustment" dialog.
- `/admin/finance/summary.tsx` — **Financial summaries**: period P&L, movement schedule, exportable statement.

All routes: Suspense with `KPIGridSkeleton`/`SectionCardSkeleton` fallbacks, `ErrorState` for `errorComponent`, URL-driven filters via `validateSearch`, ExportBar (CSV/Excel/PDF), reduced-motion-safe charts using `TrendChart`/`BarList`.

## Part B — Membership Management

### B1. Database
New migration adds:

- `entity_type` enum: `group | department | institution`.
- `entities` — id, type, name, registration_no, tax_id, parent_entity_id (nullable, self-ref for department ⊂ institution), contact_email, contact_phone, region, address_line, digital_address, status (`pending|active|suspended|closed`), kyc_status, kyc_notes, created_by, reviewed_by, reviewed_at.
- `entity_memberships` — id, entity_id, profile_id, role (`owner|admin|member`), joined_at, status. Unique(entity_id, profile_id).
- `entity_documents` — bucket-backed KYC docs for entities (registration cert, tax cert, mandate).
- New storage bucket `entity-documents` (private) mirroring `kyc-documents` policies.
- RLS: staff full access; entity `owner|admin` sees own entity + its members; members see entity they belong to. GRANTs + `service_role`.
- Audit rows on create/approve/suspend.

### B2. Server functions (`src/lib/admin-entities.functions.ts`)
`registerEntity`, `listEntities({type, status, q, page})`, `getEntity(id)`, `approveEntity`, `suspendEntity`, `addEntityMember`, `removeEntityMember`, `uploadEntityDocument`, plus a public/self-serve `registerEntitySelf` for the enroll flow.

### B3. Routes
Replace the current Members route with a proper Membership module:

- `/admin/members` — layout w/ tabs: Individuals · Groups · Departments · Institutions.
- `/admin/members/individuals.tsx` — current KYC queue (existing content moved).
- `/admin/members/groups.tsx`, `/admin/members/departments.tsx`, `/admin/members/institutions.tsx` — filtered `entities` list per type with search, status filter, pagination, "Register new" button.
- `/admin/members/entities.$id.tsx` — detail page: profile, documents, members roster, approve/suspend actions, audit.
- `/admin/members/register.$type.tsx` — multi-step registration form (basics → contact → documents → review) with distinct field sets per type (Institution requires tax_id, Department requires `parent_entity_id`, Group allows optional registration_no).
- Sidebar `Membership Management` group with 4 links (Individuals / Groups / Departments / Institutions).

### B4. Member self-serve
`/app/entities/register.tsx` — signed-in member can register a Group/Department/Institution they are owner of; it enters the admin KYC queue.

## Technical notes

- `finance_officer` role already exists and is honoured by loan/payment RPCs — reuse it.
- All new RPCs follow the established pattern: `_actor_id` param, `search_path=public,private,pg_temp`, audit-log write on state change.
- New transfer/adjustment/expense rows share the existing `transactions` ledger so Reports and Analytics KPIs pick them up automatically.
- Charts reuse `src/components/charts.tsx` primitives — no new chart libs.
- All routes use the existing `KPIGridSkeleton` / `SectionCardSkeleton` / `ErrorState` primitives for consistent loading/empty/error states.
- Follows TanStack route conventions (`_admin.admin.finance.*.tsx`, `_admin.admin.members.*.tsx`) with dot-separated filenames and matching `createFileRoute` paths.

## Order of build

1. Migration A1 (finance tables + RPCs).
2. Server fns A2 + routes A3 + sidebar entries.
3. Migration B1 (entities + memberships + storage bucket).
4. Server fns B2 + routes B3 + B4.
5. Typecheck, Playwright smoke of `/admin/finance/*` and `/admin/members/*`, screenshot verify.
