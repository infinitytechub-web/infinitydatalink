# Application Health Audit — Findings Report

You asked for the audit report first, so this plan is the deliverable. No code will change until you pick items to fix in a follow-up.

## Method

- TypeScript strict compile (`tsgo --noEmit`)
- HTTP probe across 20 representative admin/member routes
- Dev-server log + browser console scan
- Static scans: 61 route files, 25 server functions, dependency graph, SSR patterns, heavy imports

## 1. Runtime & Build Health — GREEN

- **TypeScript:** 0 errors under strict mode.
- **HTTP probe:** every sampled route returns 200 (public/authed content) or 307 (auth redirect on protected routes). No 500s.
- **Console / dev-server logs:** clean, no active errors or warnings.
- **AsyncBoundary + Suspense:** wired at root and used in 38 route locations; 42 routes use TanStack Query for data.
- **SSR crashes:** none reproducible. Prior realtime-js and `@simplewebauthn` SSR issues are patched; only 2 routes still opt out with `ssr:false` (member app + admin gate — intentional).
- **Static heavy imports:** `xlsx` / `jspdf` are already dynamic-imported through `src/lib/exports.ts`. Good.

Conclusion: no “Page Error” / rendering / runtime failures are currently reproducible.

## 2. Areas Worth Improving (ranked by impact)

### P1 — User-visible perf

1. **`lucide-react` icon imports.** Barrel imports (`import { X, Y } from "lucide-react"`) balloon route chunks. Sample routes import 15–30 icons each. Switching to `lucide-react/icons/x` per-icon imports (or centralizing a small allowlist) can shave meaningful JS on first paint.
2. **`recharts` on the admin dashboard.** Large synchronous chart lib on `/admin` and `/admin/finance/*`. Lazy-loading the chart components behind `React.lazy` + `AsyncBoundary` would speed the first admin paint noticeably on mobile (your current viewport is 428px).
3. **`AuthProvider` hydration cost.** On sign-in the provider fires two sequential Supabase reads (`user_roles`, `profiles`) then hydrates on every `SIGNED_IN`/`USER_UPDATED`. Combining into one RPC or caching per session would remove a visible flash on protected routes.
4. **Direct `supabase.from(...)` in 3 client components.** Should route through TanStack Query with a stable `queryKey` to avoid duplicate fetches on remount.

### P2 — Robustness

5. **`AsyncBoundary` retry** clears React error state but does not always call `router.invalidate()` in nested placements — a stuck error inside a leaf can require a full refresh. Standardize the retry contract.
6. **`ssr:false` on `_admin` and `_member`** avoids prerender 401s but disables SSR entirely for those subtrees. Fine for authed shells, but any public-ish leaf that ends up under them loses SSR. Worth documenting the boundary.
7. **`profiles`/`user_roles` reads** in `src/lib/auth.tsx` swallow errors silently (`if (error || !data) return []`). A one-time console warn (dev only) would surface RLS/permission regressions faster.

### P3 — Hygiene

8. **1 `TODO`/`FIXME`** remaining in `src/`.
9. **19 `useEffect` call sites**; a few in `PortalShell`/`BrandingProvider` re-run on every render because dependency arrays include object literals. Low impact, easy fix.
10. **No web-vitals telemetry** in the runtime error logger — you have error capture but no perf capture, so “feels slow” reports have no data behind them.
11. **Bundle analyzer not wired** in `vite.config.ts`; adding `rollup-plugin-visualizer` behind a flag would let you verify P1.1/P1.2 wins.

## 3. Not Issues (verified, do not touch)

- Realtime SSR stub (`src/integrations/supabase/realtime-ssr-stub.ts`) — working as designed.
- Server-fn `.functions.ts` layout and `client.server` isolation — clean.
- Root SEO/head metadata — present and per-route where required.
- `AsyncBoundary` + Query error reset — correct pattern.
- Security-definer allowlist + CI gates — in place.

## 4. What I Recommend Next

Pick any subset and I'll implement in build mode:

- **A.** P1 perf pack: per-icon `lucide-react`, lazy `recharts`, single-RPC auth hydration, migrate the 3 stray `supabase.from` calls to Query.
- **B.** P2 robustness pack: unify `AsyncBoundary` retry contract, add dev-mode warns to auth loaders, document SSR boundary.
- **C.** Observability pack: web-vitals reporting into `runtime_error_logs`, wire bundle visualizer, add a `/admin/health` perf tab.
- **D.** Just fix the one page you're actually seeing break — tell me which and I'll diagnose it directly.

Reply with A / B / C / D (or any combination) and I'll produce the implementation plan.
