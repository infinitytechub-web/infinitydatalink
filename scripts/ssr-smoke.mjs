#!/usr/bin/env node
/**
 * SSR smoke test: boots the built app and requests every route,
 * failing on HTTP 500 (browser-only imports crashing on the server,
 * loader throws, etc.). Redirects (3xx) and 4xx are treated as OK.
 */
import { spawn } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROUTES_DIR = "src/routes";
const HOST = process.env.SSR_SMOKE_HOST ?? "http://localhost:4173";
const PORT = Number(new URL(HOST).port || 4173);

/** Walk src/routes and derive URL paths from filenames. */
function collectRoutes(dir = ROUTES_DIR, prefix = "") {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...collectRoutes(full, `${prefix}${name}/`));
      continue;
    }
    if (!/\.(tsx?|jsx?)$/.test(name)) continue;
    if (name.startsWith("__")) continue; // __root
    // strip extension + escape brackets like [.]
    let base = (prefix + name)
      .replace(/\.(tsx?|jsx?)$/, "")
      .replace(/\[\.\]/g, ".");
    // Skip server-only route files (api/, lovable/, email/, sitemap.xml handled below)
    // Dots => slashes; index => ""; underscore-prefixed segments (layouts) drop
    const segments = base.split(/[./]/).filter(Boolean);
    const urlSegs = [];
    let skip = false;
    for (const seg of segments) {
      if (seg.startsWith("_")) continue; // pathless layout segment
      if (seg === "index") continue;
      if (seg === "$") { urlSegs.push("smoke"); continue; }
      if (seg.startsWith("$")) { urlSegs.push("smoke-id"); continue; }
      urlSegs.push(seg);
    }
    if (skip) continue;
    const url = "/" + urlSegs.join("/");
    out.push(url === "/" ? "/" : url.replace(/\/+$/, ""));
  }
  return Array.from(new Set(out));
}

async function waitForServer(url, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url, { redirect: "manual" });
      if (r.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server at ${url} did not become ready in ${timeoutMs}ms`);
}

async function main() {
  const routes = collectRoutes().sort();
  console.log(`Discovered ${routes.length} routes`);

  const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--host", "127.0.0.1"], {
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env },
  });
  const cleanup = () => { try { server.kill("SIGTERM"); } catch {} };
  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(130); });

  try {
    await waitForServer(HOST);
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
      console.error(`\n${failures.length} route(s) failed SSR:`);
      for (const f of failures) console.error(`  ${f.status} ${f.path}\n    ${f.snippet}`);
      process.exit(1);
    }
    console.log(`\nAll ${routes.length} routes SSR-clean.`);
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
