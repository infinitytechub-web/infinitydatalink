# Next module: Support Centre (ticketing)

The roadmap's remaining Phase 4 gap is the Support Centre. Today `/app/support` is a static FAQ page with no ticketing, and there is no support table or admin queue. This module makes support a real, auditable workflow for members and staff.

## What members get

- Raise a ticket from Help Centre: category (savings, loans, payments, KYC, account, other), subject, description, priority, optional file attachment reference.
- "My tickets" list with status (open, in progress, awaiting member, resolved, closed), last update time, and unread reply badge.
- Ticket thread view: post replies, see staff responses, close their own ticket, reopen within 7 days.
- In-app notification whenever staff reply or change status.
- FAQ section stays, above the ticket form.

## What staff get

- New admin page `/admin/support` — queue of all tickets with filters (status, category, priority, assignee, date range, member search), sorting and pagination.
- Ticket detail: member context (name, member number, KYC state, balances snapshot links), full thread, internal notes hidden from the member.
- Actions: assign to self or another support officer, change priority, change status, reply, resolve with a mandatory ≥10-char resolution note.
- SLA colouring: first-response and resolution age against configurable targets.
- CSV export of the filtered queue.
- Every state change writes an audit entry.

## Access rules

- Members: only their own tickets and non-internal messages.
- `support_officer`, `manager`, `admin`, `super_admin`: full queue and internal notes (existing `support.*` capabilities already seeded).
- `auditor`: read-only.

## Technical notes

- Migration: `support_tickets` (member, subject, category, priority, status, assignee, first_response_at, resolved_at, resolution_note, sla fields) and `support_messages` (ticket, author, body, `is_internal`, attachment path). Both with GRANTs, RLS, and an `updated_at` trigger. Ticket reference generated as `TKT-<seq>`.
- `src/lib/support.functions.ts` — member fns (`listMyTickets`, `createTicket`, `getMyTicket`, `replyToTicket`, `closeMyTicket`) and staff fns (`adminListTickets`, `adminGetTicket`, `adminReplyTicket`, `adminUpdateTicket`, `adminExportTickets`) behind `requireSupabaseAuth` + `assertPermission('support', ...)`.
- Notifications through the existing `notifyUser` fan-out; audit through `writeAudit`.
- Reuse `TableControls` for pagination/sorting, `PageHeader`/`SectionCard`/`KPIStat` primitives, and existing attachment handling from `files.shared.ts`.
- Wire `/admin/support` into the admin sidebar and breadcrumbs; extend the member Help Centre route rather than adding a new one.
- Update `roadmap.md` to mark the Support Centre complete.
