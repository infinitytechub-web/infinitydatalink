# Payment Gateway & Ghana Mobile Number Validation

## What already exists (verified)

- `payment_providers`, `payment_intents`, `payment_receipts`, `payment_webhook_events` tables with permission-scoped access rules.
- Admin provider configuration screen at `/admin/payment-config` with sandbox/live mode, two-person approval, credential readiness checks and a signed self-test.
- Signature-verified webhook endpoint at `/api/public/hooks/payments/$provider` with replay journalling.

## What is missing (this build)

1. No way for a member or teller to actually start a payment (no intent creation service, no payment method picker).
2. No mobile-money number validation anywhere — phone fields are free text up to 40 characters, no network detection.
3. No receipt issuance, no idempotency protection, no refund/cancel/reconciliation surface for intents.
4. Provider catalogue does not express the required rails (MTN MoMo, Telecel Cash, AirtelTigo/AT Money, bank, Visa, Mastercard, cash).

## 1. Centralised Ghana mobile validation

New `src/lib/gh-phone.ts` (shared, client + server):

- Normalise input (strip spaces, dashes, `+233` / `233` / leading `0` handling) to a canonical 10-digit local form.
- Accept exactly 10 digits starting `0`, reject anything shorter or longer.
- Prefix → network map: MTN (024, 025, 053, 054, 055, 059), Telecel (020, 050), AirtelTigo/AT (026, 027, 056, 057), Glo (023). Unknown prefix = rejected as unsupported.
- Exports: `normalizeGhPhone`, `detectNetwork`, `ghPhoneSchema` (Zod), `formatGhPhone`.

New `src/components/phone-field.tsx`: a controlled input that live-formats, shows the detected network as a badge (or a clear error), and blocks submit while invalid.

Applied to every phone capture point: registration/auth (`src/routes/auth.tsx`), KYC (`_member.app.kyc.tsx`), member profile and next-of-kin (`_member.app.profile.tsx`, `biodata-fields.tsx`), entity registration wizard, admin member edit, teller, support ticket contact, notification preferences phone, and the new payment forms. Server side, the same `ghPhoneSchema` replaces the loose `z.string().max(40)` validators in the corresponding server functions so the rule cannot be bypassed.

Unit tests in `src/lib/__tests__/gh-phone.test.ts` covering each network prefix, 9/11-digit rejection, `+233` and spaced input.

## 2. Payment method + provider catalogue

Extend `src/lib/payment-providers.ts` with a rail catalogue:

- `momo_mtn`, `momo_telecel`, `momo_at`, `bank_transfer`, `card_visa`, `card_mastercard`, `cash`.
- Each rail declares: required fields (momo → validated phone + network match, card → provider-hosted checkout only, cash → teller-captured), whether it needs a provider connection, and whether it can settle offline.
- Rails map to configured providers by capability, so an admin adding Paystack/Hubtel/MTN credentials later lights up the matching rails with no code change. Rails with no configured provider render as "Awaiting provider configuration (sandbox)".

## 3. Payment service layer

New `src/lib/payments.server.ts` + `src/lib/payments.functions.ts`:

- `createPaymentIntent` (member or staff): validates amount, purpose (contribution, savings deposit, loan repayment, fee), rail, and — for MoMo — a valid 10-digit number whose detected network matches the chosen rail. Generates a unique reference `IW-<yyyymmdd>-<base32 random>` and stores an idempotency key so a repeated submit returns the existing intent instead of a second charge.
- Real provider calls only: if the rail's provider has no credentials, the intent is created as `requires_configuration` and the UI says so. Nothing is ever marked succeeded without a verified provider callback.
- `getMyPayments`, `getPaymentIntent`, `getAdminPayments` (filters: status, rail, member, date range, pagination).
- `cancelPaymentIntent` (owner or `payments.manage`, only while pending) and `requestRefund` (staff, `payments.manage`, records a refund request row and audit entry — executed once a provider supports it).
- `confirmCashPayment` / `confirmBankTransfer`: teller-only, `payments.manage` + step-up, records who confirmed, mandatory note. These are the only rails that can be settled without a webhook.
- Receipt issuance on settlement: sequential `receipt_no`, receipt view + printable download.
- Every state change writes an audit entry through the existing `writeAudit` helper.

Card handling: no PAN, CVV or PIN ever enters our code or database — cards go to the provider's hosted checkout, and we persist only the provider reference, last4/brand if the provider returns them, and status.

## 4. Database changes

One migration adding, to `payment_intents`: `rail`, `payer_phone` (canonical 10-digit), `payer_network`, `idempotency_key` (unique per member+purpose+amount window), `settled_at`, `settled_by`, `cancel_reason`; plus a `payment_refunds` table (intent, amount, reason, status, requested_by, approved_by) with grants and permission-scoped access rules, and a `payment_receipts.receipt_no` sequence function. Status set becomes: `requires_configuration`, `pending`, `processing`, `succeeded`, `failed`, `cancelled`, `reversed`.

## 5. UI

- `/app/payments` — rebuilt: rail picker with live MoMo validation and network badge, amount + purpose, submit → pending intent with reference, status timeline, receipt download, and my payment history.
- `/admin/payments` — intents table with filters, status timeline, reconciliation tab (provider-confirmed vs unconfirmed), cash/bank confirmation, cancel and refund-request actions, CSV export.
- `/admin/payment-config` — add the rail-to-provider mapping panel showing each rail's status (Live / Sandbox / Awaiting credentials).
- `/admin/teller` — payment capture uses the same validated phone field and intent service.

## Verification

Playwright run against the preview: submit 9-digit, 11-digit and unsupported-prefix numbers (all rejected before submit), a valid MTN and Telecel number (network badge shown), create an intent and confirm the reference is unique and the status is `requires_configuration` while no credentials exist, confirm a cash payment as a teller and check the receipt renders, confirm a member cannot see another member's intent, and re-check the existing savings/loans/KYC flows still pass.
