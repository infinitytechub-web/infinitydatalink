# Security Gate

CI-enforced checks that fail the build when the security posture drifts.
Run everything locally with `bun run security:gate`.

## Checks

1. **Dependency audit** — `node scripts/dependency-audit.mjs` (`bun run security:audit`).
   Runs `bun audit --json --prod` (falls back to `npm audit --json --omit=dev`)
   and exits 1 on any high or critical advisory in the production tree.
   The workflow also runs daily on a schedule, so a newly published advisory
   fails the build even without a commit.

2. **SECURITY DEFINER allowlist** — `node scripts/security-definer-scan.mjs`
   (`bun run security:definer`). Statically scans every migration under
   `supabase/migrations/` for `CREATE [OR REPLACE] FUNCTION ... SECURITY DEFINER`
   blocks, normalizes them to `schema.name(argtype1,argtype2,...)` signatures, and
   compares the final state against `.security/security-definer-allowlist.json`.
   Any signature not on the allowlist fails the gate.

3. **RLS posture** — `node scripts/rls-policy-scan.mjs` (`bun run security:rls`).
   Replays the migration history and, for every table created in `public`,
   requires (a) `ENABLE ROW LEVEL SECURITY`, (b) at least one policy, and
   (c) at least one `GRANT` so PostgREST can reach it. New findings fail the
   build; knowingly-accepted exceptions live in `.security/rls-baseline.json`.

4. **Hardcoded credentials** — `node scripts/secret-scan.mjs`
   (`bun run security:secrets`). Greps `src/`, `scripts/`, `supabase/`, `e2e/`
   and `docs/` for private keys, service-role JWTs and provider tokens.
   `process.env` / `import.meta.env` references and publishable/anon keys are
   allowed by design. Reviewed false positives go in
   `.security/secret-scan-baseline.json` keyed as `<path>:<rule id>`.

5. **RBAC unit tests** — `role-guards` and `rbac-matrix` suites run in the gate
   so a permission-matrix regression breaks CI.

## Baselines: "fail only on new findings"

Checks 3 and 4 compare against a baseline file so an existing accepted
exception does not block every build, while anything new fails immediately.
Both baselines are currently empty — the tree is clean, so any new finding
fails. Adding an entry is a reviewed security decision: paste the exact
finding string the scanner prints and explain in the PR why it is acceptable.
The scanners also warn when a baseline entry no longer reproduces (and fail
with `SECURITY_GATE_STRICT=1`) so the baselines stay tight.

## Adding a new SECURITY DEFINER function

`SECURITY DEFINER` bypasses RLS, so every addition is a security-relevant
change. The reviewer workflow:

1. Write the migration with `SET search_path = public, pg_temp` and explicit
   `REVOKE ALL ... FROM PUBLIC, anon, authenticated` + narrow `GRANT EXECUTE`.
   See `docs/security-controls.md` for the template.
2. Run `node scripts/security-definer-scan.mjs --list` locally to see the
   new normalized signature.
3. Append that signature to `.security/security-definer-allowlist.json`
   in the same PR. The scanner emits the exact string to paste.
4. Explain in the PR description **who** should be able to call it and **why**
   `SECURITY DEFINER` is required.

## Removing a function

Delete the migration entry (via `DROP FUNCTION`) and remove the matching
signature from the allowlist. The scanner warns about stale allowlist entries
and, when `SECURITY_GATE_STRICT=1`, fails on them.
