# Nine-module expansion roadmap

## Done
- [x] Phase 1 — Roles & capabilities: `teller`, `support_officer` roles, `teller`/`support`/`files`/`reports` capability modules seeded into `role_permissions`.
- [x] Phase 1 — Loan Calculator: shared `src/components/loan-calculator.tsx`, admin route `/admin/loan-calculator`, member route `/app/loan-calculator` with "Apply for this loan" prefill.
- [x] Phase 2 — Teller Mode: `teller_sessions` + `teller_transactions` tables (RLS, grants), `src/lib/teller.functions.ts` (open/close till, member lookup, idempotent postings via existing audited RPCs, supervisor activity list), admin route `/admin/teller` with drawer KPIs, receipts and close-of-day reconciliation.

- [x] Phase 4 — Support Centre: `support_tickets` + `support_messages` (RLS, grants, TKT refs), `src/lib/support.functions.ts`, member ticketing on `/app/support`, staff queue on `/admin/support` with SLA signals, internal notes, assignment and audited resolutions.

## Pending
- [ ] Phase 3 — Operations Dashboard refinements and member-facing Withdrawals surface refresh.
- [x] Phase 4b — Member reports hub: `/app/reports` with savings, loans, repayments, withdrawals, payment receipts and transaction statements (own-data scoped, date/status filters, range totals, pagination, audited CSV/Excel/PDF/Print downloads).
- [x] Phase 4 — Reports hub: `/admin/exports` with 8 datasets (savings, loans, repayments, withdrawals, deposits, income, expenses, transactions), date/status/reference filters, range totals, pagination and audited CSV/Excel/PDF/Print downloads (`src/lib/reports.functions.ts`, `src/lib/reports.shared.ts`).
- [x] Phase 5a — Accounts & Access: `/admin/roles` permission matrix, role grants/revokes and team member management.
- [ ] Phase 5 — File Management (secure storage + RBAC downloads), end-to-end verification pass.

