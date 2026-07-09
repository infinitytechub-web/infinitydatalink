# Supabase Security Controls

Living reference for the database-layer security posture of this app. Update
when you add tables, roles, or SECURITY DEFINER functions.

Last verified: 2026-07-09.

---

## 1. Role model (RBAC)

### Roles

App roles are enumerated in the `public.app_role` enum:

| Role                  | Purpose                                       |
| --------------------- | --------------------------------------------- |
| `super_admin`         | Full administrative access                    |
| `compliance_officer`  | KYC review and decisions                      |
| `loan_officer`        | Loan origination and decisions                |
| `finance_officer`     | Finance operations, ledger corrections        |
| `auditor`             | Read-only across all data                     |
| `member`              | End-user, owns their own profile & records    |

### Storage

- `public.user_roles(user_id uuid, role app_role)` — the **only** place a
  user's roles live.
- Never store roles on `profiles` or any user-editable table
  (privilege escalation risk).
- On signup, `handle_new_user` inserts a default `('<uid>', 'member')` row.

### Role checks

Two SECURITY DEFINER helpers, both in the **`private` schema** (not exposed on
the REST/Data API):

- `private.has_role(_user_id uuid, _role app_role) → boolean`
- `private.can_read_all(_user_id uuid) → boolean` — convenience for
  admin-audience reads (super_admin / auditor).

Rules:
- RLS policies MUST use these helpers, never inline `EXISTS (SELECT … FROM
  user_roles …)`. Inline lookups can recurse when the target table itself has
  RLS.
- Both are `SECURITY DEFINER` with `SET search_path = public` so they run
  under a stable schema resolution regardless of caller settings.
- Because they live in `private`, they are **not callable from PostgREST**;
  only server-side SQL (RLS predicates, other SECURITY DEFINER functions,
  service-role clients) can invoke them.

---

## 2. RLS is on for every `public` table

RLS is enabled on all 14 public tables (verified via
`pg_tables.rowsecurity`):

`audit_log`, `email_send_log`, `email_send_state`,
`email_unsubscribe_tokens`, `kyc_documents`, `kyc_notifications`, `loans`,
`next_of_kin`, `profiles`, `savings_accounts`, `savings_plans`,
`suppressed_emails`, `transactions`, `user_roles`.

**Rule:** every new `public` table gets `ALTER TABLE … ENABLE ROW LEVEL
SECURITY` in the same migration that creates it, immediately followed by
`CREATE POLICY` statements.

### Policy patterns in use

- **Owner-scoped** (member data): `USING (auth.uid() = <owner column>)` with
  a matching `WITH CHECK` on writes. Examples: `profiles`, `next_of_kin`,
  `savings_accounts`, `savings_plans`, `transactions`, `kyc_documents`,
  `kyc_notifications`.
- **Admin-audience reads**: `USING (private.can_read_all(auth.uid()))`.
- **Role-scoped writes** (e.g. KYC decisions): `USING
  (private.has_role(auth.uid(), 'compliance_officer') OR
  private.has_role(auth.uid(), 'super_admin'))`.
- **Server-only tables** (queues, logs written from SECURITY DEFINER code):
  no `TO anon` / `TO authenticated` policies; writes happen via service role
  or SECURITY DEFINER helpers.

### `user_roles` policy

- `SELECT`: only admins (via `can_read_all`) or self (`auth.uid() = user_id`).
- **No `INSERT/UPDATE/DELETE` policy for authenticated** — role changes go
  through server functions using the service role or a SECURITY DEFINER
  admin function that verifies the caller is `super_admin`.

---

## 3. Table grants (Data API access)

Supabase does **not** grant default `public` schema privileges to `anon`,
`authenticated`, or `service_role`. Every new public table needs explicit
grants in the same migration, otherwise PostgREST returns a permission error
that RLS cannot bypass.

Default grant block for a user-facing table:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated;
GRANT ALL ON public.<table> TO service_role;
-- Add anon SELECT ONLY when a policy explicitly allows anon reads.
```

Guidance:
- Drop `authenticated` privileges (or narrow to `SELECT`) for tables that
  should only be written by server code.
- **Never** add `anon` grants to user-owned tables.
- Always include `service_role` for tables touched by server functions or
  admin/webhook code.

---

## 4. SECURITY DEFINER function grants

SECURITY DEFINER runs with the function owner's privileges and bypasses RLS.
Every SECURITY DEFINER function in `public` must have EXECUTE revoked from
`PUBLIC`, `anon`, and `authenticated` unless it is explicitly intended as a
client-callable API.

### Current state (public schema)

| Function                                       | SECURITY DEFINER | `search_path`         | Callable by                        |
| ---------------------------------------------- | ---------------- | --------------------- | ---------------------------------- |
| `handle_new_user()`                            | yes              | `public`              | Trigger only (revoked from all)    |
| `update_updated_at_column()`                   | no               | `public`              | Trigger only (revoked from all)    |
| `enqueue_email(text, jsonb)`                   | yes              | `public, pg_temp`     | `service_role` only                |
| `read_email_batch(text, int, int)`             | yes              | `public, pg_temp`     | `service_role` only                |
| `delete_email(text, bigint)`                   | yes              | `public, pg_temp`     | `service_role` only                |
| `move_to_dlq(text, text, bigint, jsonb)`       | yes              | `public, pg_temp`     | `service_role` only                |
| `email_queue_dispatch()`                       | yes              | `""` (empty)          | `service_role` / cron              |
| `email_queue_wake()`                           | yes              | `""` (empty)          | Trigger / `service_role`           |

### Private-schema helpers (not on the Data API)

| Function                                        | SECURITY DEFINER | `search_path` |
| ----------------------------------------------- | ---------------- | ------------- |
| `private.has_role(uuid, app_role)`              | yes              | `public`      |
| `private.can_read_all(uuid)`                    | yes              | `public`      |

The `private` schema is not in PostgREST's exposed schemas, so no REST
grant lockdown is required — RLS predicates still invoke them via the
SQL layer.

### Adding a new SECURITY DEFINER function

Template migration:

```sql
CREATE OR REPLACE FUNCTION public.my_privileged_op(<args>)
RETURNS <type>
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp   -- MANDATORY, see §5
AS $$ ... $$;

-- Lock it down by default; grant back only what's needed.
REVOKE ALL ON FUNCTION public.my_privileged_op(<args>) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_privileged_op(<args>) TO service_role;
-- If (and only if) signed-in users need it:
-- GRANT EXECUTE ON FUNCTION public.my_privileged_op(<args>) TO authenticated;
```

Prefer to keep helpers callable only by RLS/other SQL by placing them in
`private` and revoking nothing further (they aren't exposed).

---

## 5. `search_path` pinning

An unpinned `search_path` on a SECURITY DEFINER function lets a caller alter
schema resolution and hijack function/table references. Every SECURITY
DEFINER function in this project sets `search_path` at creation time via
`SET search_path = …` (verified with `pg_proc.proconfig`).

Rules:
- **SECURITY DEFINER**: always `SET search_path = public, pg_temp`
  (or `= ""` if the function fully-qualifies every reference, as the email
  queue dispatchers do).
- **SECURITY INVOKER**: still recommended to pin `search_path` when the
  function references unqualified objects; the Supabase linter flags
  unpinned functions regardless of `SECURITY` mode.
- Reference all objects with schema qualifiers (`public.profiles`,
  `pgmq.send`, `auth.uid()`) inside SECURITY DEFINER bodies — pinning is a
  belt, qualification is suspenders.

---

## 6. Client / server boundary reminders

- Browser client uses the **publishable key**; RLS applies.
  `import { supabase } from '@/integrations/supabase/client'`.
- Signed-in server functions use `requireSupabaseAuth` middleware; queries
  still run under the user's JWT so RLS applies.
- `supabaseAdmin` (service role) **bypasses RLS**. Load it inside handler
  bodies only, and verify the caller's role before any write:
  ```ts
  const { data: isAdmin } = await context.supabase
    .rpc('has_role', { _user_id: context.userId, _role: 'super_admin' });
  if (!isAdmin) throw new Error('Forbidden');
  ```
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to browser code, loaders, or
  loader-returned data.

---

## 7. Maintenance checklist

When adding a table:
- [ ] `CREATE TABLE` in migration
- [ ] `GRANT` to `authenticated` (and `service_role`); add `anon` only if a
      policy allows anonymous reads
- [ ] `ENABLE ROW LEVEL SECURITY`
- [ ] `CREATE POLICY` for each audience (self / admin / server-only)
- [ ] Uses `private.has_role` / `private.can_read_all` in policies, not
      inline `user_roles` subqueries

When adding a SECURITY DEFINER function:
- [ ] `SET search_path = public, pg_temp` in the function definition
- [ ] `REVOKE ALL … FROM PUBLIC, anon, authenticated`
- [ ] `GRANT EXECUTE` only to the roles that must call it
      (usually `service_role`; `authenticated` only for RLS-support helpers)
- [ ] All object references fully schema-qualified inside the body

When touching roles:
- [ ] Role writes go through server code with role verification, never a
      client mutation on `user_roles`
- [ ] New role added? Extend `app_role` enum + update RLS predicates that
      enumerate roles explicitly
