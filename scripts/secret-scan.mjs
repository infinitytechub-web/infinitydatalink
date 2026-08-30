#!/usr/bin/env node
/**
 * Hardcoded-credential scanner.
 *
 * Greps the tracked source tree for high-signal secret shapes (private keys,
 * service-role JWTs, provider tokens, inline passwords). Publishable/anon keys
 * are allowed by design and are explicitly excluded.
 *
 * Any match fails the gate unless its `path:rule` pair is listed in
 * `.security/secret-scan-baseline.json`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BASELINE_PATH = join(ROOT, ".security/secret-scan-baseline.json");

const SCAN_DIRS = ["src", "scripts", "supabase", "e2e", "docs"];
const SCAN_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|sql|json|md|yml|yaml|css|html)$/i;
const SKIP_DIR = /^(node_modules|dist|\.git|\.output|\.nitro|\.vinxi|coverage|build)$/;
const SKIP_FILE = /(^|\/)(routeTree\.gen\.ts|bun\.lock|package-lock\.json)$/;

const RULES = [
  { id: "private-key-block", re: /-----BEGIN\s+(RSA|EC|OPENSSH|PGP|DSA)?\s*PRIVATE KEY-----/ },
  { id: "aws-access-key-id", re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: "supabase-secret-key", re: /\bsb_secret_[A-Za-z0-9_-]{10,}/ },
  { id: "service-role-jwt", re: /"role"\s*:\s*"service_role"/ },
  { id: "stripe-secret-key", re: /\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}/ },
  { id: "github-token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  { id: "openai-key", re: /\bsk-(proj-)?[A-Za-z0-9]{32,}/ },
  { id: "slack-token", re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/ },
  { id: "twilio-auth-token", re: /\bSK[0-9a-fA-F]{32}\b/ },
  {
    id: "inline-password-assignment",
    re: /\b(password|passwd|secret|api_?key|token)\s*[:=]\s*["'`][^"'`$\s{]{12,}["'`]/i,
  },
];

// Values that are public by design or obvious placeholders.
const ALLOW_LINE =
  /(process\.env|import\.meta\.env|VITE_|PUBLISHABLE|publishable|anon\s*key|sb_publishable_|example|placeholder|changeme|your[-_]?(key|token|secret)|xxx|\*\*\*|<[a-z_-]+>|\$\{)/i;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR.test(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (SCAN_EXT.test(entry) && !SKIP_FILE.test(full)) out.push(full);
  }
  return out;
}

const files = SCAN_DIRS.filter((d) => {
  try {
    return statSync(join(ROOT, d)).isDirectory();
  } catch {
    return false;
  }
}).flatMap((d) => walk(join(ROOT, d)));

const findings = [];
for (const file of files) {
  const rel = relative(ROOT, file);
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.length > 2000) return; // minified/base64 blobs
    if (ALLOW_LINE.test(line)) return;
    for (const rule of RULES) {
      if (rule.re.test(line)) findings.push({ key: `${rel}:${rule.id}`, line: i + 1 });
    }
  });
}

let baseline = new Set();
try {
  baseline = new Set(JSON.parse(readFileSync(BASELINE_PATH, "utf8")).accepted ?? []);
} catch {
  /* no baseline yet */
}

const isNew = findings.filter((f) => !baseline.has(f.key));

console.log(`Secret scan: ${files.length} file(s) scanned, ${findings.length} match(es).`);

if (isNew.length) {
  console.error("\n❌ SECURITY GATE: potential hardcoded credential(s).");
  for (const f of isNew) console.error(`   + ${f.key} (line ${f.line})`);
  console.error(
    '\nMove real credentials to project secrets (process.env). If this is a false positive, add the "path:rule" key to .security/secret-scan-baseline.json.',
  );
  process.exit(1);
}

console.log("\n✅ No new hardcoded-credential findings.");
