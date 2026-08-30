# Security findings report — release 2026-08-03

Scan run: 2026-08-03T16:14:14Z (backend scan + dependency audit + persisted findings review)

## Summary

| Scanner                                 | Status  | Findings        |
| --------------------------------------- | ------- | --------------- |
| Backend / database (Supabase linter)    | success | 48 (all `warn`) |
| Backend deep scan (`supabase_lov` v3.2) | success | 0               |
| App MCP surface                         | success | 0               |
| Connector security                      | success | 0               |
| Dependency audit (high/critical)        | success | 0               |
| Persisted findings (prior releases)     | —       | 0 open          |

No high or critical severity issues. No open findings carried over from previous releases.

## Findings detail

All 48 findings collapse into two linter rules, both `warn`:

### 1. Public (anon) can execute a `SECURITY DEFINER` function — 18 occurrences

`lint=0028_anon_security_definer_function_executable`

Functions in `public` still holding `EXECUTE` for the `anon` role:

`apply_settings_change`, `check_registration_availability`, `execute_dividend_run`,
`guard_guarantor_self_update`, `has_permission_for`, `kyc_vault_purge_candidates`,
`my_permissions`, `notify_goal_milestone`, `notify_loan_event`, `notify_withdrawal_event`,
`profiles_guard_national_id_dup`, `profiles_set_minor_flag`, `purchase_shares`,
`reapply_kyc_vault_retention`, `recycle_notifications`, `restore_recycled_notification`,
`sell_shares`, `transfer_shares`

Notes for triage:

- `guard_*`, `notify_*`, `profiles_*` are **trigger functions**. They never need a role
  grant at all — revoking `EXECUTE FROM anon, authenticated` is a no-risk cleanup.
- `check_registration_availability` is intentionally reachable pre-signup (registration
  duplicate check) and is expected to stay anon-callable.
- `apply_settings_change`, `execute_dividend_run`, `purchase_shares`, `sell_shares`,
  `transfer_shares`, `reapply_kyc_vault_retention`, `kyc_vault_purge_candidates` perform
  internal role checks, so exposure is guarded in-function, but the grant to `anon` is
  broader than intended and should be revoked.

### 2. Signed-in users can execute a `SECURITY DEFINER` function — 30 occurrences

`lint=0029_authenticated_security_definer_function_executable`

The 18 above (also granted to `authenticated`) plus:
`approve_dividend_run`, `cancel_savings_withdrawal`, `preview_runtime_log_retention`,
`purge_runtime_error_logs`, `register_entity`, `reject_dividend_run`,
`request_savings_withdrawal`, `request_transfer`, `reset_own_kyc_pending`,
`resubmit_own_kyc`, `savings_held_amount`, `submit_dividend_run_for_approval`

Most of these are legitimate member/staff RPCs (`request_transfer`,
`resubmit_own_kyc`, `savings_held_amount`, …) that must be callable by signed-in users
and enforce authorisation internally via `private.has_role` / `private.has_permission_for`.
Admin-only routines exposed here (`purge_runtime_error_logs`,
`preview_runtime_log_retention`, dividend-run approvals) rely on those in-function role
checks rather than grant-level restriction.

## Posture confirmed healthy

- `search_path` is pinned on every `public` `SECURITY DEFINER` function (no
  `0011_function_search_path_mutable` findings this run).
- Privileged helpers live in the non-exposed `private` schema.
- No hardcoded credentials, no dependency advisories at high/critical.

## Recommended follow-ups (not applied in this release)

1. Revoke `EXECUTE` from `anon`/`authenticated` on all trigger functions.
2. Revoke `anon` `EXECUTE` on the privileged RPCs listed in section 1 (keep only
   `check_registration_availability`).
3. Restrict admin-only routines to `service_role` / server-side callers where the app
   never calls them from the browser.
