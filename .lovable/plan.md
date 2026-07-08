## Scope for this iteration

Frontend only, mock data, no backend. Sets up the design system, dual-login shell, and every module as a navigable page — so subsequent iterations can wire real logic module-by-module.

## Design system

Install `@fontsource/libre-baskerville`, `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`. Register `@theme` tokens in `src/styles.css`:

- Colors: `--color-emerald-deep #064e3b`, `--color-emerald-mid #0d7a5f`, `--color-gold #c9a84c`, `--color-cream #f5f0e0`, plus semantic mappings (`--color-background`, `--color-foreground`, `--color-primary`, `--color-accent`, etc.) so shadcn components inherit the theme.
- Fonts: `--font-serif` Libre Baskerville, `--font-sans` IBM Plex Sans, `--font-mono` IBM Plex Mono.
- Dark mode variables (deep-emerald canvas variant of the palette).
- Update `__root.tsx` head with real title/description/OG for "Infinity Wealth App".

## Auth surface (mocked)

`src/routes/auth.tsx` — split-screen landing:

```text
┌───────────────────────┬───────────────────────┐
│   Member Sign In      │   Administrator       │
│   (left, cream)       │   (right, emerald)    │
│  email / password     │  email / password     │
│  password strength    │  2FA code field       │
│  remember me · reset  │  device attestation   │
└───────────────────────┴───────────────────────┘
```

Client-only zod validation, password strength meter, "remember me", lockout counter after 3 fails (localStorage), forgot-password + reset-password stub routes. A `useAuth` context stores `{ role: 'member'|'admin'|null }` in memory; login writes it and routes to `/app` or `/admin`.

## Route architecture

```text
src/routes/
  __root.tsx                       — shell (SEO, providers)
  index.tsx                        — public landing → CTA to /auth
  auth.tsx                         — dual login
  auth.forgot.tsx / auth.reset.tsx
  _member/route.tsx                — gate (redirect to /auth if !member)
  _member/app.tsx                  — member layout (sidebar + topbar)
  _member/app.index.tsx            — dashboard (matches selected prototype)
  _member/app.savings.tsx
  _member/app.loans.tsx
  _member/app.transactions.tsx
  _member/app.payments.tsx
  _member/app.profile.tsx
  _admin/route.tsx                 — gate (redirect to /auth if !admin)
  _admin/admin.tsx                 — admin layout (sidebar + topbar)
  _admin/admin.index.tsx           — admin analytics dashboard
  _admin/admin.members.tsx
  _admin/admin.savings.tsx
  _admin/admin.loans.tsx
  _admin/admin.payments.tsx
  _admin/admin.security.tsx
  _admin/admin.audit.tsx
  _admin/admin.settings.tsx
```

Each module page ships with realistic mock data, filter/search UI, and an empty-state pattern — no real CRUD yet. A shared `DataTable`, `KPIStat`, `SectionCard`, `StatusPill`, and `MoneyValue` (tabular IBM Plex Mono) power every module for visual consistency.

## Member dashboard (built to match the selected prototype exactly)

- Fixed left sidebar (emerald deep, gold accent, grouped nav: Member Portal / Support), member badge at bottom.
- Sticky top bar: breadcrumbs left; search pill + gold status dot + "New Transaction" CTA right.
- KPI row (3 cards): Total Net Worth, Active Loan Balance, Savings Goal (gold-outlined progress).
- Two-column grid: recent transactions list (avatar + label + REF + amount, mono figures, green/red signs) and Quick Actions grid (Deposit / Withdraw / Transfer / Apply Loan — one primary emerald, one gold).
- Right column: AI Wealth Insight (deep-emerald panel with serif quote + gold CTA), Account Security card, Membership Asset placeholder.

Composition, densities, and gold-accent placements match the prototype 1:1.

## Admin dashboard

Same sidebar/topbar shell, different nav groups (Financial, Membership, Savings, Loans, Payments, Security, Audit, Settings). Analytics KPI row + a mock chart placeholder + Live Activity table + Approvals queue. Reuses the same primitives.

## Multi-country config

`src/lib/org-config.ts` exports an `OrgConfig` (currency symbol/code, locale, ID label + regex, region list, MoMo providers). Ship two presets — Ghana (₵ GHS, Ghana Card, MTN/Vodafone/AirtelTigo, Ghana regions) and a generic international default. All money rendering, ID fields, and region pickers read from this config. Currently swap via `localStorage`; wiring to backend/org settings is a later step.

## PWA

Manifest-only home-screen support per the PWA skill: `public/manifest.webmanifest` (name, short_name, theme_color `#064e3b`, background `#f5f0e0`, display `standalone`, icons), matching head links in `__root.tsx`. Generate a wordmark icon set (192 / 512 / apple-touch). No service worker (offline was not requested).

## Deferred (call out to the user)

Not included this iteration — each is a natural follow-up:

- Real backend (Lovable Cloud): auth, sessions, RLS, RBAC, tables, audit logs, storage.
- Actual CRUD, workflows, approvals, notifications, print/PDF/Excel/CSV export.
- AI Business Intelligence (Lovable AI Gateway), file scanning, security telemetry.
- Payment integrations (MoMo, cards, bank transfers).
- Email/SMS delivery, 2FA verification, biometric login.
- Offline mode / full PWA caching.

## Success criteria

- App builds clean, no placeholder page remains, `/`, `/auth`, `/app`, `/admin` all reachable.
- Dual login gates the two portals via router `_member` / `_admin` layouts.
- Member dashboard visually matches the selected prototype.
- Every module listed in the brief has a landing route with mock UI and consistent primitives.
- Installable on mobile via manifest.