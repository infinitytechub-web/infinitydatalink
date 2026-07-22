# Security Gate

CI-enforced checks that fail the build when the security posture drifts.

## Checks

1. **Dependency audit** — `node scripts/dependency-audit.mjs`.
   Runs `bun audit --json --prod` (falls back to `npm audit --json --omit=dev`)
   and exits 1 on any high or critical advisory in the production tree.

2. **SECURITY DEFINER allowlist** — `node scripts/security-definer-scan.mjs`.
   Statically scans every migration under `supabase/migrations/` for
   `CREATE [OR REPLACE] FUNCTION ... SECURITY DEFINER` blocks, normalizes them
   to `schema.name(argtype1,argtype2,...)` signatures, and compares the final
   state against `.security/security-definer-allowlist.json`. Any signature
   not on the allowlist fails the gate.

## Running locally

```bash
node scripts/dependency-audit.mjs
node scripts/security-definer-scan.mjs
```

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
