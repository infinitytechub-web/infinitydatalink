#!/usr/bin/env node
/**
 * Production SSR smoke test.
 *
 * Boots the built Cloudflare Worker via `wrangler dev` against
 * dist/server/wrangler.json and requests every route, failing on HTTP 500.
 * Catches SSR-only issues (browser-only imports pulled into the server
 * graph, tslib/CJS interop crashes, workerd nodejs_compat gaps, etc.)
 * that dev-mode Vite would hide.
 *
 * Requires: `bun run build` (or `vite build`) to have produced dist/server/.
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROUTES_DIR = "src/routes";
const HOST = process.env.SSR_SMOKE_HOST ?? "http://127.0.0.1:4173";
const PORT = Number(new URL(HOST).port || 4173);
const WORKER_CONFIG = "dist/server/wrangler.json";
const READY_TIMEOUT_MS = 120_000;

function collectRoutes(dir = ROUTES_DIR, prefix = "") {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...collectRoutes(full, `${prefix}${name}/`));
      continue;
    }
    if (!/\.(tsx?|jsx?)$/.test(name)) continue;
    if (name.startsWith("__")) continue;
    const base = (prefix + name)
      .replace(/\.(tsx?|jsx?)$/, "")
      .replace(/\[\.\]/g, ".");
    // Skip server-only files under api/ or lovable/ (probed separately if needed)
    if (base.startsWith("api/") || base.startsWith("lovable/") || base.startsWith("email/")) continue;
    const segments = base.split(/[./]/).filter(Boolean);
    const urlSegs = [];
    for (const seg of segments) {
      if (seg.startsWith("_")) continue;
      if (seg === "index") continue;
      if (seg === "$") { urlSegs.push("smoke"); continue; }
      if (seg.startsWith("$")) { urlSegs.push("smoke-id"); continue; }
      urlSegs.push(seg);
    }
    const url = "/" + urlSegs.join("/");
    out.push(url === "/" ? "/" : url.replace(/\/+$/, ""));
  }
  return Array.from(new Set(out));
}

async function waitForServer(url, timeoutMs) {
  const start = Date.now();
  let lastErr;
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url, { redirect: "manual" });
      // Any HTTP response (even 500) means the worker is up.
      if (typeof r.status === "number") return;
    } catch (e) { lastErr = e; }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Worker at ${url} did not become ready in ${timeoutMs}ms (${lastErr?.message ?? "no response"})`);
}

async function main() {
  if (!existsSync(WORKER_CONFIG)) {
    console.error(`Missing ${WORKER_CONFIG}. Run \`bun run build\` first.`);
    process.exit(2);
  }

  const routes = collectRoutes().sort();
  console.log(`Discovered ${routes.length} routes`);

  const server = spawn(
    "npx",
    ["-y", "wrangler", "dev", "--config", WORKER_CONFIG, "--port", String(PORT), "--ip", "127.0.0.1", "--local"],
    { stdio: ["ignore", "inherit", "inherit"], env: { ...process.env } },
  );
  const cleanup = () => { try { server.kill("SIGTERM"); } catch {} };
  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(130); });

  try {
    await waitForServer(HOST, READY_TIMEOUT_MS);
    const failures = [];
    for (const path of routes) {
      const url = `${HOST}${path}`;
      try {
        const res = await fetch(url, { redirect: "manual" });
        const tag = res.status >= 500 ? "FAIL" : "OK  ";
        console.log(`${tag} ${res.status} ${path}`);
        if (res.status >= 500) {
          const body = await res.text().catch(() => "");
          failures.push({ path, status: res.status, snippet: body.slice(0, 400) });
        }
      } catch (err) {
        console.log(`FAIL ERR ${path} — ${err.message}`);
        failures.push({ path, status: 0, snippet: err.message });
      }
    }
    if (failures.length) {
      console.error(`\n${failures.length} route(s) failed SSR against the production worker:`);
      for (const f of failures) console.error(`  ${f.status} ${f.path}\n    ${f.snippet}`);
      process.exit(1);
    }
    console.log(`\nAll ${routes.length} routes SSR-clean against the production worker.`);
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
