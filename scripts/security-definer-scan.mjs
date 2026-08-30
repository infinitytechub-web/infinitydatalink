#!/usr/bin/env node
/**
 * Static scanner for SECURITY DEFINER functions declared in supabase/migrations/*.sql.
 *
 * - Walks every migration in filename order (which is chronological for the
 *   `YYYYMMDD…` prefix Supabase generates).
 * - Extracts each `CREATE [OR REPLACE] FUNCTION <schema>.<name>(<args>) …` block
 *   and records whether the final definition is SECURITY DEFINER.
 * - Compares the resulting signature set to `.security/security-definer-allowlist.json`.
 * - Fails (exit 1) on any signature not in the allowlist.
 *
 * The allowlist is the security gate: adding a new SECURITY DEFINER function
 * requires an explicit review that updates the JSON file.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");
const ALLOWLIST_PATH = join(ROOT, ".security/security-definer-allowlist.json");

const CREATE_FN_RE =
  /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-zA-Z_][\w]*\.[a-zA-Z_][\w]*)\s*\(([^)]*)\)([\s\S]*?)(?:\$\$|\$_\$|AS\s+\$)/gi;

/** Normalize an arg list like `_user_id uuid, _role app_role DEFAULT 'x'`
 *  down to comparable type-only signature `uuid,app_role`. */
function normalizeArgs(raw) {
  const args = raw
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => {
      // strip DEFAULT clause
      a = a.replace(/\s+DEFAULT\s+.*$/i, "").trim();
      // "IN name type" or "name type" — take last token(s) as type
      const parts = a.split(/\s+/);
      // drop leading IN/OUT/INOUT/VARIADIC
      if (/^(IN|OUT|INOUT|VARIADIC)$/i.test(parts[0])) parts.shift();
      if (parts.length === 1) return parts[0].toLowerCase();
      // If more than 2 tokens, type may be multi-word (e.g. "timestamp with time zone")
      return parts.slice(1).join(" ").toLowerCase();
    });
  return args.join(",");
}

function scan() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  /** @type {Map<string, {isDefiner: boolean, file: string}>} */
  const state = new Map();

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const match of sql.matchAll(CREATE_FN_RE)) {
      const [, fqName, args, tail] = match;
      const sig = `${fqName}(${normalizeArgs(args)})`;
      const isDefiner = /SECURITY\s+DEFINER/i.test(tail);
      state.set(sig, { isDefiner, file });
    }

    // Handle DROP FUNCTION to keep state honest.
    for (const m of sql.matchAll(
      /DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?([a-zA-Z_][\w]*\.[a-zA-Z_][\w]*)\s*\(([^)]*)\)/gi,
    )) {
      const [, fq, args] = m;
      state.delete(`${fq}(${normalizeArgs(args)})`);
    }
  }

  const definers = [...state.entries()]
    .filter(([, v]) => v.isDefiner)
    .map(([sig]) => sig)
    .sort();

  return definers;
}

function loadAllowlist() {
  try {
    const raw = readFileSync(ALLOWLIST_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return new Set(parsed.functions ?? []);
  } catch (err) {
    console.error(`Failed to read allowlist at ${ALLOWLIST_PATH}: ${err.message}`);
    process.exit(2);
  }
}

const found = scan();
const allowlist = loadAllowlist();

const unexpected = found.filter((sig) => !allowlist.has(sig));
const stale = [...allowlist].filter((sig) => !found.includes(sig));

console.log(`Found ${found.length} SECURITY DEFINER functions in migrations.`);
console.log(`Allowlist size: ${allowlist.size}`);

if (process.argv.includes("--list")) {
  console.log("\n--- Discovered ---");
  for (const s of found) console.log(" ", s);
}

if (unexpected.length) {
  console.error("\n❌ SECURITY GATE: unexpected SECURITY DEFINER functions detected.");
  console.error("   These are not in .security/security-definer-allowlist.json:");
  for (const s of unexpected) console.error("   +", s);
  console.error(
    "\nIf intentional, review the security posture and add the signature(s) to the allowlist.",
  );
  process.exit(1);
}

if (stale.length) {
  console.warn("\n⚠️  Allowlist contains signatures no longer present in migrations:");
  for (const s of stale) console.warn("   -", s);
  console.warn("   Remove them from the allowlist to keep it tight.");
  if (process.env.SECURITY_GATE_STRICT === "1") process.exit(1);
}

console.log("\n✅ SECURITY DEFINER surface matches allowlist.");
