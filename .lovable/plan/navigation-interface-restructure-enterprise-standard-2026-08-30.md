# Navigation & Interface Restructure (Enterprise Standard)

Goal: reorganize both portals into a standards-aligned information architecture, gate every admin destination behind role capabilities, and normalize layout/typography/spacing/responsiveness — without changing business logic or removing any existing page.

## Current state (verified)

- `src/routes/_admin.admin.tsx` declares ~60 sidebar links across 6 groups. Only 5 of them carry a `cap` gate, so a teller, support officer, or auditor currently sees links to Super Admins, Roles & Permissions, Security Centre, Branding, Settings, Balance Management, Runtime Logs, Vault, and every finance page. Routes still enforce access server-side, but the menu advertises restricted areas and produces dead ends.
- `src/routes/_member.app.tsx` puts 16 unrelated destinations in one flat "Member Portal" group, mixing daily actions (savings, transfers) with rare ones (register organization, verification status).
- `PortalShell` already supports capability filtering (`NavItem.cap`), drops empty groups, has a mobile drawer, collapsible rail, and Escape handling — the mechanism exists but is barely used.
- The capability model (`src/lib/permissions.ts`) already covers kyc, members, entities, savings, loans, payments, approvals, reports, security, settings, documents, users, notifications, teller, support, files.

## 1. Admin navigation: role-scoped, three levels deep

Restructure into standard fintech back-office domains, each item gated by a capability:

```text
Overview        Dashboard, Operations, Analytics, Live users
Membership      User approvals, Individuals (KYC), Groups, Departments, Institutions
Savings         Accounts, Withdrawal approvals, Plans, Fixed deposits, Holds,
                Group pots, Interest runs, Recurring, Reconciliation
Lending         Loan book, Products, Arrears, Workouts, Settlements,
                Provisioning, Calculator
Finance         Dashboard, Summary, Contributions, Income, Expenses,
                Expense ledger, Transfers, Balance management, FX, Investments
Front office    Teller mode, Payments, Payment configuration, Support queue
Reporting       Reports, Report exports, Audit & activity, Transfer audit,
                Activity timeline, Compliance approval trail
Records         Document management, Member files, KYC vault, Relationship types
Governance      Admin console, Change approvals (+ queue, SLA, history),
                Snapshots, Roles & permissions, Super admins (+ history)
Platform        Security centre (+ firewall, sessions, uploads, alerts),
                Runtime logs, Log recycle bin, Scheduled jobs,
                Integration health, Branding, Settings, Notification delivery
```

Rules applied:
- Every item gets an explicit `cap` (e.g. `security.view`, `users.manage`, `settings.manage`, `reports.view`, `savings.approve`). Nothing is left ungated except the Overview dashboard.
- Super admin keeps full visibility (already handled in `PortalShell`).
- Sub-pages that belong to a parent (security sub-pages, change-approval sub-pages, super-admin history, savings sub-modules) move out of the sidebar into an in-page section tab bar on the parent route, so the rail stays scannable.
- Breadcrumb map (`CRUMBS`) is updated to match, including the entries currently missing.

## 2. Member navigation: task-based groups

```text
Overview     Dashboard
Save         My savings, Goals, Fixed deposits, Group & susu, Statements
Borrow       My loans, Repayments, Guarantees, Loan calculator
Money        Transactions, Transfers, Payments, Withdrawals
Records      Reports & statements, My documents
Account      Profile & KYC, Verification status, Register organization
Support      Notifications, Alert settings, Help centre
```

The KYC gate list stays exactly as-is; items blocked by an incomplete KYC render disabled with a "Complete verification" hint instead of silently failing.

## 3. Shared shell polish (no logic change)

- Grouped rail with sticky group labels, active-trail highlighting, and a proper `<nav>`/`<ul>` structure with `aria-current="page"`.
- Add an in-rail nav filter box (client-side, filters visible items only) since both portals are link-dense.
- Collapsed rail shows icon + tooltip with accessible name; every icon-only control gets `aria-label`.
- Single `<main>` in the shell (verify no route declares its own), skip-to-content link, focus-visible rings from tokens.
- Headers/tables/cards: apply the responsive grid pattern (`grid-cols-[minmax(0,1fr)_auto]` → `sm:flex`, `min-w-0`, `truncate`, `shrink-0`) to `PageHeader`, `SectionCard` action rows, and `KPIStat` grids, so no header clips on mobile.
- Wide admin tables get a horizontal scroll container plus a mobile card fallback for the top-level list pages (members, loans, savings, withdrawals, audit).
- Tap targets on mobile at least 44x44; only semantic tokens for color (no `text-white`/hex in components).

## 4. Data-exposure review

- Sweep every admin route's page header/KPI strip for values a lower role should not see (member national IDs, contact details, balances, security telemetry) and wrap those blocks in the same capability check that gates the nav item, so a direct URL visit shows a permission notice instead of partial data.
- Member routes: confirm no admin-only field leaks into member-facing cards.
- No RLS, policy, or server-function change is planned; this is a UI-visibility layer on top of existing server enforcement. Anything found to be enforced only in the UI is reported back rather than silently patched.

## Technical notes

- Files touched: `src/routes/_admin.admin.tsx`, `src/routes/_member.app.tsx`, `src/components/portal-shell.tsx`, `src/components/portal-shell.types.ts` (add `children` for sub-tabs), `src/components/primitives.tsx` (header/table responsiveness), plus small per-route header edits where a section tab bar replaces sidebar links.
- No route files are renamed, moved, or deleted — every existing URL keeps working, so no redirects or broken links.
- Verification: typecheck + build, then Playwright passes over admin and member portals at 390px, 820px, and 1440px, plus a signed-in check with a non-privileged staff role to confirm restricted groups are absent from the rail.
