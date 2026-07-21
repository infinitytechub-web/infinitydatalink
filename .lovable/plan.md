# Enterprise UI Redesign — IT-360 CashApp

Scope: presentation-layer only. No changes to server functions, RLS, RPCs, routing, or business logic. All existing routes, filters, exports, and RBAC gates remain intact.

## 1. Typography

- Load **Inter** (primary) and **Plus Jakarta Sans** (secondary/display) via `<link>` in `src/routes/__root.tsx` head (Tailwind v4 rule: no `@import` URL in styles.css).
- Define in `@theme` in `src/styles.css`:
  - `--font-sans: "Inter"` — body, tables, forms, nav
  - `--font-display: "Plus Jakarta Sans"` — dashboard titles, KPI numbers, section headings
  - `--font-mono` retained for numeric ledger columns
- Type scale (rem): `text-xs .75 / sm .875 / base 1 / lg 1.125 / xl 1.25 / 2xl 1.5 / 3xl 1.875 / 4xl 2.25`, tightened tracking on display (`-0.02em`), relaxed leading on body (1.55).
- Apply hierarchy consistently: page H1 = display 2xl-3xl; card titles = sans sm/uppercase tracking; KPI values = display 3xl tabular-nums; table cells = sans sm; buttons = sans sm 500.

## 2. Color system (design tokens)

Rewrite tokens in `src/styles.css` — replace current teal palette with the requested enterprise palette, keep OKLCH for accuracy, keep `@theme inline` mapping so shadcn classes (`bg-primary`, `text-foreground`, etc.) resolve.

Light mode:
- `--primary` Deep Royal Blue #1E3A8A
- `--secondary` Emerald #059669
- `--accent` Gold #D4AF37
- `--success` #059669, `--warning` #D97706, `--destructive` #DC2626, `--info` #0284C7
- `--background` #F8FAFC, `--card` #FFFFFF, `--muted` #F1F5F9
- `--foreground` #0F172A (charcoal), `--muted-foreground` #475569
- `--border` #E2E8F0, `--ring` primary/40

Dark mode (`.dark`): navy surfaces (#0B1220 bg, #111A2E card), primary lifted to #3B5BDB for contrast, foreground #E2E8F0, borders #1E293B. All pairs verified against WCAG AA.

Add semantic gradients as tokens: `--gradient-primary`, `--gradient-emerald`, `--gradient-gold`, `--gradient-surface` for KPI cards and headers.

Elevation tokens: `--shadow-xs/sm/md/lg` using primary-tinted rgba for soft enterprise shadows.
Radius tokens: `--radius: 12px` (cards), keep shadcn `--radius-sm/md/lg/xl` derived from it (10–16px range).

Replace/retire the existing `theme-tokens.ts` overrides that hard-code teal so the new palette isn't overwritten at runtime; branding settings continue to override via CSS vars.

## 3. Sidebar (`src/components/portal-shell.tsx`)

- Premium gradient rail (`--gradient-surface`) with 1px right border, subtle inner highlight.
- Section dividers with uppercase micro-labels (tracking 0.08em, muted-foreground).
- Menu items: 10px radius, 40px height, icon 18px in a tinted 28px tile, label Inter 500.
- Active state: primary/10 background, primary left indicator bar (3px), primary-foreground text, soft primary shadow.
- Hover: background muted, translate-x-0.5 200ms.
- Collapsed mode preserved; icon tiles remain visible with tooltips.
- Brand block at top uses display font for app name + tagline from branding settings.

## 4. Cards & widgets

Introduce a small primitive set in `src/components/primitives.tsx` (already present — refine, don't duplicate):
- `StatCard` — KPI card with icon tile, label (uppercase micro), display value (tabular-nums), delta chip (success/danger), optional sparkline slot. Subtle gradient border via `bg-clip-padding` + gradient underlay.
- `SectionCard` — white/dark card, 12–14px radius, `--shadow-sm`, 1px border, 20–24px padding.
- `GlassCard` — reserved for hero/summary areas only (backdrop-blur, translucent).
- `StatusBadge` — pill, 9 semantic variants, uppercase 11px 600.
- `ProgressBar` — thin (6px), rounded, gradient fill.

All existing dashboard/report/finance/entity pages consume these — no per-page ad-hoc card styles.

## 5. Buttons

Extend shadcn Button variants in `src/components/ui/button.tsx`:
- `default` primary gradient + shadow-sm, hover lift (translateY -1px, shadow-md), active press.
- `secondary` emerald tint, `outline` border + hover fill, `ghost`, `destructive`, new `premium` (gold gradient for CTAs).
- Sizes: `sm/default/lg/icon` normalized (36 / 40 / 44 px), 10px radius, loading spinner slot, disabled 50% opacity + no-events.

## 6. Forms

- Inputs (`ui/input`, `ui/textarea`, `ui/select`): 40px height, 10px radius, 1px border, focus ring 2px primary/40, subtle inner shadow.
- Floating label pattern via a small `FloatingField` wrapper used on auth + wizards (existing forms keep block labels but adopt new spacing).
- Validation: inline helper text, danger token for errors, success check on validated fields.
- Date pickers, checkboxes, radios: shadcn primitives restyled with new tokens — no custom widgets.

## 7. Tables

Enhance the existing table controls component:
- Sticky header with subtle gradient, uppercase micro labels, sortable caret.
- Zebra rows via `--muted/40` on even rows, hover `--muted/70`.
- Row height 48px, numeric columns tabular-nums, right-aligned.
- Pagination bar: page size select + range text + prev/next, consistent across all admin/member tables.
- Toolbar slot for search, filters, export buttons (already exist — restyled).

## 8. Charts (recharts)

- Central chart theme helper reading CSS vars so charts adopt light/dark automatically.
- Grid lines: `--border` at 40% opacity, axis text muted-foreground 11px.
- Series colors: primary, emerald, gold, info, warning — no rainbow.
- Tooltips use `SectionCard` styling.
- Applied across admin analytics, reports, contributions, health dashboards.

## 9. Animations

- Standard tokens: `--ease-out: cubic-bezier(.16,1,.3,1)`, durations 150/200/300ms.
- Utilities kept minimal: `hover-lift`, `fade-in`, `scale-in`, existing `animate-*` retained.
- Respect `useReducedMotion` — already wired; extend to new hover transforms.
- Skeletons use shimmer already in place; restyled to new tokens.

## 10. Responsiveness

- Audit breakpoints: sidebar collapses <lg, KPI grid `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`, tables gain horizontal scroll wrapper + card view on <sm for member pages.
- Apply the `grid-cols-[minmax(0,1fr)_auto]` + `min-w-0` + `shrink-0` pattern to every page header with actions.

## 11. Pages touched (presentation only)

Admin: dashboard, analytics, reports (P&L, contributions, income/expenses), loans, savings, transactions, entities, KYC, audit (general + transfers), super-admins + history, roles, recurring, health, branding.
Member: app shell, dashboard, savings, loans, transactions, profile/KYC.
Auth: login (dual-panel), refined spacing, new button/input styles, biometric button restyled.

## 12. Out of scope

- No changes to server functions, migrations, RLS, RPCs, routing structure, exports, or business rules.
- No new features; branding settings continue to override tokens at runtime.
- No new dependencies beyond the two Google Font links.

## Technical notes

- Tailwind v4: all tokens in `@theme` / `@theme inline`; fonts via `<link>` in root head; no `tailwind.config.js`.
- shadcn primitives kept; variants extended via CVA.
- Dark mode already class-based via `.dark` — palette re-tuned for both modes.
- `theme-tokens.ts` runtime override is aligned to the new palette so branding customization doesn't regress the redesign.
- Verification: build passes, Playwright smoke on `/auth`, `/admin`, `/app`, and key admin subpages (dashboard, loans, audit, health, branding) with screenshots at desktop (1280) + mobile (390) widths.

## Rollout order

1. Tokens + fonts (`styles.css`, `__root.tsx`, `theme-tokens.ts`)
2. Primitives (Button, Input, Card, Badge, primitives.tsx)
3. Sidebar + portal shell
4. Admin dashboard + charts theming
5. Admin sub-pages (tables, forms, reports)
6. Member portal
7. Auth page
8. Responsive audit + screenshot verification
