# End-to-End Tests

Playwright specs covering RBAC and the transfer lifecycle.

The RBAC specs (`rbac.spec.ts`, `rbac-api.spec.ts`) verify Super Admin-only
routes and endpoints reject non-staff callers and accept Super Admins across
navigation flows. The transfer specs (`transfers.spec.ts`,
`transfers-api.spec.ts`) verify the member↔member and account↔account
request → approval / rejection lifecycle end-to-end.


## Running

Playwright is not bundled with the app. Install once:

```bash
bun add -d @playwright/test
bunx playwright install --with-deps chromium
```

Environment variables required (do NOT commit real credentials):

- `E2E_BASE_URL` — e.g. `http://localhost:8080`
- `E2E_MEMBER_EMAIL`, `E2E_MEMBER_PASSWORD` — a member-only account (funded
  savings account preferred so the transfer lifecycle test can run)
- `E2E_SUPER_ADMIN_EMAIL`, `E2E_SUPER_ADMIN_PASSWORD` — a Super Admin account
- `E2E_FINANCE_EMAIL`, `E2E_FINANCE_PASSWORD` — optional; `finance_officer`
  or `super_admin` used to clear/reject transfers in the lifecycle spec
- `E2E_MEMBER2_EMAIL`, `E2E_MEMBER2_PASSWORD` — optional second member for
  the member↔member transfer lifecycle test


Then:

```bash
bunx playwright test -c e2e/playwright.config.ts
```

## What is covered

`rbac.spec.ts` — UI/navigation coverage:

1. **Unauthenticated** users hitting `/admin/**` are redirected to `/auth`.
2. **Members** signing in land on `/app`, not `/admin`; navigating to Super
   Admin routes shows no data.
3. **Super Admins** are routed to `/admin`, can open the directory + grant
   history, sort and paginate history via URL, and download the CSV.

`rbac-api.spec.ts` — direct API/RPC coverage (no UI, no server-function
wrapper — hits Supabase/PostgREST with real user JWTs, so it proves the
database policies, guard triggers, and `SECURITY DEFINER` RPCs stand on
their own even if a caller bypasses the client entirely):

1. **Anonymous** callers cannot invoke `list_super_admins`,
   `grant_super_admin_by_email`, `revoke_super_admin`, cannot read
   `audit_log`, and cannot write `user_roles` or `super_admin_seed_emails`.
2. **Authenticated non-staff members** are rejected by the same RPCs with a
   `forbidden` error; direct `INSERT`/`DELETE` on `user_roles.super_admin`
   is blocked by the `guard_super_admin_role` trigger; a spoofed
   `audit_log` row with `actor_role='super_admin'` is rejected by the
   `WITH CHECK` policy.
3. **Super Admin** callers can invoke `list_super_admins`, read
   `audit_log`, and are still prevented from revoking themselves
   (`cannot_revoke_self` / `last_super_admin`).

Optional env for the API suite: `E2E_TEST_TARGET_EMAIL` (defaults to the
member email; used only for negative grant/revoke attempts).

`transfers.spec.ts` — UI smoke:

1. **Unauthenticated** callers hitting `/app/transfers` and
   `/admin/finance/transfers` are redirected to `/auth`.
2. **Member** lands on the Transfers portal with the request affordance and
   history table visible.
3. **Finance staff** land on the admin Transfer Ledger with the status
   vocabulary visible for row actions.

`transfers-api.spec.ts` — direct RPC lifecycle:

1. **Anonymous** callers cannot invoke `request_transfer`, `clear_transfer`,
   or `reject_transfer`, and cannot read the `transfers` ledger.
2. **Member** RPC guards fire: `same_account`, `invalid_amount`,
   `source_not_owned`; and members are rejected by `clear_transfer` /
   `reject_transfer`.
3. **Pending → cleared** for both account↔account (self-owned) and
   member↔member requests moves balances by the transfer amount, stamps
   `cleared_at` + `out_txn_id` + `in_txn_id`, and rejects any repeat
   settlement with `transfer_not_pending`.
4. **Pending → failed (rejected)** records the reason in the transfer note,
   leaves balances untouched, and rejects any repeat action.

