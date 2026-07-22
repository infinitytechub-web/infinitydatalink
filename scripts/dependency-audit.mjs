#!/usr/bin/env node
/**
 * Fails CI when `bun audit` (or `npm audit` fallback) reports any
 * high or critical severity advisory against the production dependency tree.
 *
 * Runs the audit as JSON, parses the vulnerability counts, and exits 1
 * if `high + critical > 0`. Prints the human-readable report for logs.
 */
import { spawnSync } from 'node:child_process';

function tryRun(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: 'utf8' });
  return {
    ok: res.status === 0 || res.status === 1, // audit exits non-zero on findings
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    status: res.status,
    error: res.error,
  };
}

function parseBunAudit(json) {
  // bun audit --json prints an array of advisories or an object with vulns.
  try {
    const data = JSON.parse(json);
    const counts = { low: 0, moderate: 0, high: 0, critical: 0 };
    const list = Array.isArray(data) ? data : (data.advisories ?? []);
    for (const adv of list) {
      const sev = (adv.severity ?? adv.level ?? '').toLowerCase();
      if (sev in counts) counts[sev]++;
    }
    return counts;
  } catch {
    return null;
  }
}

function parseNpmAudit(json) {
  try {
    const data = JSON.parse(json);
    const v = data.metadata?.vulnerabilities ?? {};
    return {
      low: v.low ?? 0,
      moderate: v.moderate ?? 0,
      high: v.high ?? 0,
      critical: v.critical ?? 0,
    };
  } catch {
    return null;
  }
}

let counts = null;
let raw = '';

// Prefer bun (matches project lockfile). Fall back to npm audit.
const bun = tryRun('bun', ['audit', '--json', '--prod']);
if (bun.stdout) {
  const parsed = parseBunAudit(bun.stdout);
  if (parsed) {
    counts = parsed;
    raw = bun.stdout;
  }
}

if (!counts) {
  console.warn('bun audit unavailable or unparseable; falling back to npm audit.');
  const npm = tryRun('npm', ['audit', '--json', '--omit=dev']);
  if (npm.stdout) {
    counts = parseNpmAudit(npm.stdout);
    raw = npm.stdout;
  }
}

if (!counts) {
  console.error('❌ Could not obtain audit results from bun or npm.');
  console.error(bun.stderr || bun.error?.message || '');
  process.exit(2);
}

console.log('Dependency audit summary:');
console.log(`  low=${counts.low}  moderate=${counts.moderate}  high=${counts.high}  critical=${counts.critical}`);

const gate = counts.high + counts.critical;
if (gate > 0) {
  console.error(`\n❌ SECURITY GATE: ${gate} high/critical vulnerability finding(s).`);
  console.error('Raw audit output:\n' + raw.slice(0, 4000));
  process.exit(1);
}

console.log('\n✅ No high/critical dependency vulnerabilities.');
