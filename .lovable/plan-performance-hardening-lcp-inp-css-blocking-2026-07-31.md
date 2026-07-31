# Performance hardening: LCP, INP, CSS blocking

Goal: cut render-blocking CSS, shrink first-load JavaScript, and reduce interaction latency without changing the UI or removing features.

## What I confirmed so far

- `src/styles.css` imports four `@fontsource` packages (Inter Variable, Plus Jakarta Sans Variable, IBM Plex Mono 400 + 500). Those font CSS files get inlined into the single app stylesheet that `src/routes/__root.tsx` links on every route, so fonts block first paint sitewide.
- `src/routes/__root.tsx` links one global stylesheet (`../styles.css?url`) for all routes; there is no per-route CSS scoping.
- Only one `document.cookie` write exists (`src/components/ui/sidebar.tsx`) — no hot-path cookie reads in app code. The ~53 ms "get cookie" self-time most likely comes from the auth/session client, which I will confirm by profiling before changing anything.
- Route components are already code-split automatically by TanStack Start, and several routes already lazy-load heavy widgets.

The exact hashed CSS filenames in the report (`app-boot-*`, `globals-*`, `fonts-*`, …) do not match this repo's current build output, so step 1 is to produce a real production build and measure what actually ships.

## Plan

1. **Baseline measurement**
   - Clean production build, record per-asset CSS/JS sizes and chunk graph (bundle analyzer already wired via `BUNDLE_ANALYZE=1`).
   - Run a Lighthouse/Playwright trace against the production preview for LCP, FCP, TBT, CLS, and CSS blocking time. This is the "before" number I will report — no claimed metric without a trace.

2. **Fonts off the critical path**
   - Remove the `@fontsource` `@import`s from `src/styles.css` and instead reference the font files from the root route head: `preload` only the single weight/subset used above the fold, `font-display: swap` for the rest, loaded async.
   - Drop unused families/weights (`@fontsource/ibm-plex-sans`, `@fontsource/libre-baskerville` appear unused — will verify with a search before removing).
   - Keep the same `--font-sans` / `--font-serif` / `--font-mono` token names so no component changes.
   - Set metric-compatible fallbacks so swapping the font does not shift layout (keeps CLS ≤ 0.1).

3. **CSS splitting and async loading**
   - Keep the small critical shell CSS as the blocking stylesheet on `__root`.
   - Move genuinely route-scoped styling (admin/report-only) into route-level `head().links` so unrelated routes don't pay for it.
   - Any deferred sheet uses `rel=preload` + `onload` swap with a `<noscript>` fallback, generated from the build manifest — never hard-coded hashes.
   - Verify Tailwind's `source(none)` + `@source "../src"` scope excludes generated files (`routeTree.gen.ts`) so no dead utilities ship.

4. **JavaScript execution**
   - From the analyzer output, split the heaviest non-critical dependencies out of the initial chunk: recharts, xlsx/export helpers, PDF/statement generation, WebAuthn, and the entity-registration wizard. These become dynamic imports behind existing Suspense boundaries.
   - Ensure the landing route (`/`) pulls in no admin/member portal code.
   - Confirm each lazy module emits its own chunk in the build output.

5. **React render + TanStack Query**
   - Audit `AuthProvider`, `BrandingProvider`, `ThemeProvider`, and `PortalShell` for context values recreated every render; memoize only where a re-render cascade is demonstrable.
   - Deduplicate queries that fire on shell mount, give reference data longer `staleTime`/`gcTime`, and make secondary-widget queries `enabled`-gated so they don't compete with first paint.
   - Check realtime/presence subscriptions and timers for missing cleanup (memory pressure / GC time).

6. **INP**
   - Profile the interactions named in the report (nav clicks, table sort/filter/pagination, modals). Apply `startTransition`, debounced filters, and pagination limits where a long task is actually measured.

7. **Verification gate**
   - `tsgo` typecheck, ESLint, unit tests, SSR smoke script, and the existing Playwright specs.
   - Clean rebuild; confirm no missing assets, no console errors, no 404s.
   - Re-run the Lighthouse trace and report before/after side by side. If a target (LCP < 2.5 s, INP < 200 ms) is not met, I will state the measured value and the remaining bottleneck rather than claim success.

## Constraints I will hold to

- No framework, router, or styling-system changes; Tailwind v4 CSS-first config stays.
- No visual regressions — font swap and CSS splitting must render identically.
- No new dependencies beyond what is already installed (Lighthouse runs through the existing Playwright/Chromium).
- Field metrics (the 7,960 ms LCP) come from real users and cannot be re-measured here; I will report lab metrics and explain that field data updates over days.
