## Audit vs. your checklist

I inspected `src/styles.css`, `src/routes/__root.tsx`, `src/components/portal-shell.tsx`, and the admin route tree. Current state against each item:

| Requirement | Status | Notes |
|---|---|---|
| Professional typography | Pass | Libre Baskerville + IBM Plex Sans/Mono via `@fontsource`. |
| Teal & White admin theme | **Fail** | Current palette is "Emerald Prestige" — deep green `#064e3b` + gold `#c9a84c` on cream `#f5f0e0`. No teal, no white surface. |
| Premium color palette | Partial | Cohesive, but not the teal/white brief. |
| Light mode | Pass | Default `:root` tokens are wired. |
| Dark mode | **Fail** | `.dark` tokens exist in CSS, but no `ThemeProvider`, no toggle, no `class="dark"` is ever applied. |
| Accessibility (WCAG AA) | Partial | Tokens use `text-foreground` etc.; not audited for contrast in the new palette, icon-only button labels, or focus rings. |
| Beautiful dashboard cards | Partial | Cards exist; no elevation system, gradient trims, or KPI treatment. |
| Modern charts | Partial | `recharts` is used on `/admin/reports`; styling is default. |
| Responsive tables | Partial | `table-controls.tsx` handles pagination/sort; tables don't collapse gracefully on mobile. |
| Professional icons | Pass | `lucide-react` throughout. |
| Glassmorphism where appropriate | **Fail** | No `backdrop-blur` / translucent surfaces anywhere. |
| 3D left navigation | **Fail** | Sidebar is flat solid green; no depth, gradient, inset shadow, or icon-tile treatment. |
| Mobile-first | Partial | Sidebar collapses; header + tables not fully tuned for < 640 px. |
| Consistent spacing | Partial | Ad-hoc `p-4 / gap-3` values; no spacing scale doc. |
| Visual hierarchy | Partial | Serif headings help, but weights/sizes are inconsistent across admin pages. |
| Smooth animations | **Fail** | `tw-animate-css` imported but unused; no page/route or hover motion. |
| Fast loading | Pass | Suspense + `ensureQueryData` loader pattern already in place. |

Six items fail outright and seven are partial. Recommend a focused polish pass, not a rewrite.

## Plan — Teal & White fintech polish

### 1. Retheme to Teal & White (design tokens only)

Rewrite the token block in `src/styles.css`. Keep every semantic name; only values change so every existing component picks up the new theme with no code edits.

Light (default):
- `--background` `#ffffff`, page surface `--muted` `#f1f5f7`
- `--foreground` `#0b2b31` (deep teal ink)
- `--primary` `#0d9488` (teal-600), `--primary-foreground` `#ffffff`
- `--accent` `#14b8a6` (teal-500) for highlights; `--ring` matches
- `--card` `#ffffff`, `--border` `rgba(13, 148, 136, 0.12)`
- `--success` `#0d9488`, `--warning` `#d97706`, `--destructive` `#b91c1c`
- Sidebar: gradient `#083344 → #0e7490` (see step 4), gold accent removed

Dark:
- `--background` `#04181c`, `--card` `#0b2b31`
- `--foreground` `#e6fbf8`, `--muted-foreground` `rgba(230,251,248,0.66)`
- `--primary` `#2dd4bf` on `#04181c`, `--accent` `#5eead4`
- Verify each pair hits WCAG AA (4.5:1 body, 3:1 large) with a contrast pass.

Replace the Emerald Prestige comment block. Remove now-unused `--gold` / `--cream` tokens (or repoint to teal neutrals) so nothing in the codebase can drift back.

### 2. Ship dark mode end-to-end

- Add `src/components/theme-provider.tsx`: React context + `localStorage` persistence + `prefers-color-scheme` fallback; toggles `class="dark"` on `<html>`. Read in a `useEffect` (never in `useState` initializer) to avoid hydration mismatch.
- Wrap `<RootLayout>` in `__root.tsx`.
- Add a `ThemeToggle` (sun/moon `lucide` icon-only Button with `aria-label`) in `portal-shell.tsx` header, visible in both admin and member shells.
- Update the `theme-color` meta tag to update dynamically.

### 3. 3D left navigation

In `portal-shell.tsx` sidebar:
- Background: `bg-linear-to-b from-[#083344] via-[#0e7490] to-[#083344]`, plus a subtle inner-shadow ring (`shadow-[inset_-1px_0_0_rgba(255,255,255,0.06)]`) and a soft right-edge drop shadow.
- Each nav item becomes a "tile": rounded `rounded-xl`, translucent surface `bg-white/5`, `hover:bg-white/10`, active state adds a teal-glow ring + inset highlight + 1px raised top border to fake bevel.
- Icon container: 36×36 rounded square with `bg-linear-to-br from-white/15 to-white/0` and `shadow-inner` — this reads as "3D" without heavy skeuomorphism.
- Collapsed state keeps the tile look at icon-only 44×44 (meets tap target).

### 4. Glassmorphism where appropriate

- Sticky top header in `portal-shell.tsx`: `bg-background/70 backdrop-blur-xl border-b border-border/60`.
- Dialog overlays (`super-admin-*` modals, `loan-application-dialog`, audit details): overlay uses `bg-background/40 backdrop-blur-md`.
- KPI cards on `/admin` dashboard: optional accent card variant `bg-card/70 backdrop-blur-xl` over a soft teal radial in the page background.
- Do NOT hand-write `-webkit-backdrop-filter` — Tailwind's `backdrop-*` utilities handle prefixing.

### 5. Dashboard cards + charts

- Introduce `<StatCard>` primitive in `src/components/primitives.tsx`: label (uppercase 11px tracking-wide muted), value (serif 32px), delta chip (teal-500 / rose-600), sparkline slot. Elevation via `shadow-[0_1px_2px_rgba(11,43,49,0.06),0_8px_24px_-12px_rgba(13,148,136,0.25)]`.
- Retrofit `/admin` (KPIs), `/admin/reports`, `/app` dashboards to use it.
- Chart theming: pass teal palette (`#0d9488`, `#5eead4`, `#0891b2`, `#f59e0b` for warnings) into every `recharts` component; grid `stroke="var(--border)"`, tooltip uses `bg-popover text-popover-foreground rounded-md shadow-lg`.

### 6. Responsive tables + mobile-first

- Wrap every admin table (`_admin.admin.loans`, `.super-admins.history`, `.audit`, `.members`, savings, transactions) in a `<div className="overflow-x-auto -mx-4 sm:mx-0">` and give the `<table>` `min-w-[640px]`.
- Apply the grid header pattern from the responsive-layout guide to page headers: `grid grid-cols-[minmax(0,1fr)_auto] gap-4 sm:flex` + `min-w-0` + `truncate`.
- Confirm sidebar `offcanvas` on mobile with a persistent `SidebarTrigger` in the sticky header.
- Set the preview viewport to mobile to visually verify.

### 7. Smooth animations

- Use existing `tw-animate-css` utilities: `animate-fade-in` for route bodies, `animate-scale-in` on Dialog content, `hover-scale` on nav tiles + KPI cards.
- Add `transition-colors duration-200` to interactive tokens on Button/Card variants that don't already have it.
- Respect `prefers-reduced-motion` via a single `@media (prefers-reduced-motion: reduce)` block in `styles.css` that disables non-essential transitions.

### 8. Accessibility sweep

- Audit every `size="icon"` Button; add `aria-label` where missing (theme toggle, sidebar trigger, table row action menus, close buttons).
- Ensure exactly one `<main>` per route (currently rendered inside `portal-shell.tsx`).
- Verify focus rings visible on teal background: `focus-visible:ring-2 ring-ring ring-offset-2 ring-offset-background`.
- Contrast-check each new token pair in both modes.

### 9. Verification

- `bunx tsgo` and `bunx vitest run` to keep the existing 66-test suite green.
- Playwright script that visits `/`, `/admin`, `/admin/loans`, `/admin/reports`, `/admin/super-admins`, and `/app` in both light and dark mode at desktop (1280) and mobile (390) widths and saves screenshots to `/tmp/browser/ui-audit/` for a visual diff.

## Technical details

- Files touched: `src/styles.css` (tokens), `src/routes/__root.tsx` (theme provider + dynamic meta), `src/components/portal-shell.tsx` (sidebar, header, glass, mobile), `src/components/primitives.tsx` (`StatCard`, badge tweaks), `src/components/theme-provider.tsx` (new), `src/components/theme-toggle.tsx` (new), each admin route file for table wrappers and KPI adoption, chart usage sites for palette props.
- No schema / server-function / RBAC changes.
- No new npm packages required — `lucide-react`, `tailwindcss`, `tw-animate-css`, `recharts`, and shadcn primitives are already installed.

## Out of scope (call out if you want them)

- Redesign of auth screens.
- Chart type changes (bar → area etc.) — this plan only re-themes existing charts.
- Storybook / visual regression harness.
