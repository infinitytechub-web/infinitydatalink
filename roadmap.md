# Nine-module expansion roadmap

## Done
- [x] Phase 1 — Roles & capabilities: `teller`, `support_officer` roles, `teller`/`support`/`files`/`reports` capability modules seeded into `role_permissions`.
- [x] Phase 1 — Loan Calculator: shared `src/components/loan-calculator.tsx`, admin route `/admin/loan-calculator`, member route `/app/loan-calculator` with "Apply for this loan" prefill.
- [x] Phase 2 — Teller Mode: `teller_sessions` + `teller_transactions` tables (RLS, grants), `src/lib/teller.functions.ts` (open/close till, member lookup, idempotent postings via existing audited RPCs, supervisor activity list), admin route `/admin/teller` with drawer KPIs, receipts and close-of-day reconciliation.

## Pending
- [ ] Phase 3 — Operations Dashboard (real-time queue/KPI board) and member-facing Withdrawals surface refresh.
- [ ] Phase 4 — Reports hub (admin + member exports), Notifications expansion, Support Center ticketing.
- [ ] Phase 5 — Accounts & Access management screen, File Management (secure storage + RBAC downloads), end-to-end verification pass.
