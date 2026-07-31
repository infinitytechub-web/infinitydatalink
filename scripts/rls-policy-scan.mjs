#!/usr/bin/env node
/**
 * Static RLS posture scanner for supabase/migrations/*.sql.
 *
 * For every table created in the `public` schema it verifies the final state
 * of the migration history:
 *   1. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` exists.
 *   2. At least one `CREATE POLICY ... ON <table>` exists.
 *   3. At least one `GRANT ... ON <table>` exists (PostgREST needs it).
 *
 * Any table missing one of those is a finding. Findings are compared against
 * `.security/rls-baseline.json` so the gate fails only when a NEW finding
 * appears; the baseline documents knowingly-accepted exceptions.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase/migrations');
const BASELINE_PATH = join(ROOT, '.security/rls-baseline.json');

const CREATE_TABLE_RE =
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([a-zA-Z_][\w]*)"?/gi;
const DROP_TABLE_RE = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?"?([a-zA-Z_][\w]*)"?/gi;
const ENABLE_RLS_RE =
  /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?"?([a-zA-Z_][\w]*)"?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
const DISABLE_RLS_RE =
  /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?"?([a-zA-Z_][\w]*)"?\s+DISABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
const CREATE_POLICY_RE =
  /CREATE\s+POLICY\s+[^\n]*?\s+ON\s+(?:public\.)?"?([a-zA-Z_][\w]*)"?/gi;
const GRANT_RE =
  /GRANT\s+[\s\S]{0,200}?\s+ON\s+(?:TABLE\s+)?(?:public\.)?"?([a-zA-Z_][\w]*)"?\s+TO\s/gi;

// Non-public schemas we intentionally keep out of the Data API.
const NON_PUBLIC_PREFIX = /^(private|auth|storage|realtime|vault)\./i;

function collect(sql, re, into) {
  for (const m of sql.matchAll(re)) into.add(m[1].toLowerCase());
}

function scan() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const tables = new Set();
  const rlsEnabled = new Set();
  const policies = new Set();
  const grants = new Set();

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');

    for (const m of sql.matchAll(CREATE_TABLE_RE)) {
      const full = m[0].replace(/^[\s\S]*?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/i, '');
      if (NON_PUBLIC_PREFIX.test(full)) continue;
      tables.add(m[1].toLowerCase());
    }
    for (const m of sql.matchAll(DROP_TABLE_RE)) tables.delete(m[1].toLowerCase());

    collect(sql, ENABLE_RLS_RE, rlsEnabled);
    collect(sql, CREATE_POLICY_RE, policies);
    collect(sql, GRANT_RE, grants);
    for (const m of sql.matchAll(DISABLE_RLS_RE)) rlsEnabled.delete(m[1].toLowerCase());
  }

  const findings = [];
  for (const t of [...tables].sort()) {
    if (!rlsEnabled.has(t)) findings.push(`${t}: RLS not enabled`);
    else if (!policies.has(t)) findings.push(`${t}: RLS enabled but no policy (table is locked)`);
    if (!grants.has(t)) findings.push(`${t}: no GRANT statement (Data API cannot reach it)`);
  }
  return { tableCount: tables.size, findings };
}

function loadBaseline() {
  try {
    return new Set(JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).accepted ?? []);
  } catch {
    return new Set();
  }
}

const { tableCount, findings } = scan();
const baseline = loadBaseline();
const isNew = findings.filter((f) => !baseline.has(f));
const fixed = [...baseline].filter((f) => !findings.includes(f));

console.log(`RLS scan: ${tableCount} public table(s), ${findings.length} finding(s).`);
if (process.argv.includes('--list')) for (const f of findings) console.log('  -', f);

if (fixed.length) {
  console.warn('\n⚠️  Baseline entries no longer reproduce (remove them):');
  for (const f of fixed) console.warn('   -', f);
  if (process.env.SECURITY_GATE_STRICT === '1') process.exit(1);
}

if (isNew.length) {
  console.error('\n❌ SECURITY GATE: new RLS findings.');
  for (const f of isNew) console.error('   +', f);
  console.error('\nFix the migration, or add the exact string to .security/rls-baseline.json with a review note.');
  process.exit(1);
}

console.log('\n✅ No new RLS findings.');
