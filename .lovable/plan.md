## Goal

Elevate the Groups / Departments / Institutions surface from a generic form + list into a polished, guided registration flow and a rich admin detail workspace with documents, timeline, and audit context.

## Scope

Frontend + a small amount of server-function/storage plumbing already scaffolded (`entity_documents` table + `entity-documents` bucket exist). No new DB tables.

---

## Part 1 — Multi-step registration wizard

Replace both:
- `src/routes/_member.app.entities.register.tsx` (member self-serve)
- New `src/routes/_admin.admin.entities.register.tsx` (admin-initiated) linked from the entities index "Register new" button

with a shared wizard component `src/components/entity-registration-wizard.tsx`:

Steps:
1. **Type** — visual card picker for Group / Department / Institution with per-type description of required fields.
2. **Basics** — name, registration_no, tax_id (required for institution), parent institution picker (required for department, calls new `listInstitutions` server fn).
3. **Contact & location** — email, phone, region, physical address, digital address (Ghana Post GPS format hint).
4. **Documents** — drag-drop uploader for registration certificate, tax certificate, mandate letter (Institution/Department require registration cert; Group optional). Uses new `uploadEntityDocument` server fn writing to `entity-documents` bucket + `entity_documents` row.
5. **Review & submit** — summary of every field + doc list, terms checkbox, submit.

UX details:
- Step indicator with completed/current/upcoming states from theme tokens.
- Per-step Zod validation; Next disabled until valid; Back preserves state.
- Auto-save draft to `sessionStorage` keyed by user + type.
- On submit: call existing `registerEntity`, then upload queued docs against the returned id, then navigate to detail page (admin) or `/app` with success toast (member).

## Part 2 — Admin entity detail overhaul

Rework `src/routes/_admin.admin.entities.$entityId.tsx` into a two-column workspace:

Header:
- Eyebrow (type + registration no), title, status pill, "Copy entity ID" button, primary action button (Approve / Suspend / Reactivate) driven by current status.
- Approve/Suspend now open a proper Radix Dialog (not `window.prompt`) with textarea, character counter, and confirm/cancel — replaces the current inline prompt.

Tabs (URL-driven via `?tab=`):
1. **Overview** — registration details grid (existing content), plus a right-column "Compliance snapshot" card: KYC status, days since submission, reviewer, last decision note.
2. **Members** — existing roster; add search box, role filter, and CSV export via existing `exports.ts`; add-member form gains inline profile lookup preview (shows name/member_no when a valid `member_no` is typed).
3. **Documents** — list rows from `entity_documents` with type badge, uploaded by, uploaded at, and a "View" button that fetches a short-lived signed URL from a new `getEntityDocumentUrl` server fn. Upload widget re-uses the wizard's dropzone.
4. **Timeline** — chronological feed built from `audit_log` entries whose `meta ->> 'entity_id' = id` (new `listEntityTimeline` server fn). Icons + tone per event kind (registered, approved, suspended, member_added, document_uploaded).

Loading/empty/error: `SectionCardSkeleton`, `EmptyState`, `ErrorState` for every tab.

## Part 3 — Entities index polish

`src/routes/_admin.admin.entities.index.tsx`:
- Replace native `<select>` filter with a proper filter bar: text search (name / registration_no), type pills (already present), status filter, and results-per-page.
- Server-side pagination via `page`/`pageSize` in URL search; `listEntities` gets `page`, `pageSize`, `q` params.
- Row hover reveals quick actions (Review, Copy ID).
- "Register new" button in header opens the admin wizard route.
- Sidebar `Membership Management` entries (Groups / Departments / Institutions) already deep-link with `?type=…`; keep as-is.

## Part 4 — Server functions (small additions)

`src/lib/admin-entities.functions.ts`:
- Extend `listEntities` input with `q`, `page`, `pageSize`; return `{ rows, total }`.
- `listInstitutions()` — lightweight `{id, name}` list for wizard's parent picker.
- `uploadEntityDocument({ entity_id, doc_type, filename, contentBase64 })` — decodes, uploads to `entity-documents/{entity_id}/…` via admin client, inserts `entity_documents` row.
- `listEntityDocuments({ entity_id })` and `getEntityDocumentUrl({ id })` — signed URL (5 min).
- `listEntityTimeline({ entity_id, limit })` — reads `audit_log` filtered by meta.

All use `requireSupabaseAuth` + existing staff/reviewer guards; `registerEntity` and `uploadEntityDocument` also allow the entity's owner to call them for member self-serve.

## Technical notes

- All new UI pulls colors/tones from `src/lib/theme-tokens.ts`; no ad-hoc Tailwind color scales.
- Wizard is a controlled component; parent route decides `mode: "member" | "admin"` for terminal navigation.
- Dropzone uses native `<input type="file">` with drag-over styling — no new deps.
- Signed URLs are generated per-click, never stored.
- Route naming stays TanStack dot-convention (`_admin.admin.entities.register.tsx`).
- No changes to existing enums or RLS; `entity_documents` policies already cover staff + owners.

## Build order

1. Server-fn additions (list/upload/timeline/url).
2. Shared wizard component + admin & member wizard routes.
3. Admin detail overhaul (dialogs, tabs, documents, timeline).
4. Entities index filter bar + pagination.
5. Typecheck; Playwright smoke of member registration → admin approve flow; screenshot verify.
