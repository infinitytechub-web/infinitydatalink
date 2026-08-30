/**
 * Payment rail catalogue — client-safe.
 *
 * A "rail" is what the payer chooses (MTN MoMo, Visa, cash…). Rails are mapped
 * to configured gateway providers by capability, so an authorised admin can add
 * or switch providers later without any code change: the rail lights up as soon
 * as a provider that supports it has credentials configured.
 */
import type { GhNetwork } from "@/lib/gh-phone";

export const RAILS = [
  "momo_mtn",
  "momo_telecel",
  "momo_at",
  "bank_transfer",
  "card_visa",
  "card_mastercard",
  "cash",
] as const;
export type Rail = (typeof RAILS)[number];

export type RailKind = "mobile_money" | "bank" | "card" | "cash";

export type RailSpec = {
  code: Rail;
  label: string;
  kind: RailKind;
  blurb: string;
  /** Mobile-money rails require a payer number on this network. */
  network?: GhNetwork;
  /** Rails that cannot settle without a verified provider callback. */
  requiresProvider: boolean;
  /** Rails a teller/finance officer may confirm manually (offline settlement). */
  manualSettlement: boolean;
  /** Provider codes (from PROVIDER_TEMPLATES) able to process this rail. */
  providerCodes: string[];
};

export const RAIL_SPECS: RailSpec[] = [
  {
    code: "momo_mtn",
    label: "MTN Mobile Money",
    kind: "mobile_money",
    blurb: "MoMo prompt sent to the payer's MTN number.",
    network: "mtn",
    requiresProvider: true,
    manualSettlement: false,
    providerCodes: ["mtn_momo", "hubtel", "paystack", "flutterwave"],
  },
  {
    code: "momo_telecel",
    label: "Telecel Cash",
    kind: "mobile_money",
    blurb: "Telecel Cash collection (formerly Vodafone Cash).",
    network: "telecel",
    requiresProvider: true,
    manualSettlement: false,
    providerCodes: ["hubtel", "paystack", "flutterwave"],
  },
  {
    code: "momo_at",
    label: "AirtelTigo / AT Money",
    kind: "mobile_money",
    blurb: "AT Money collection prompt.",
    network: "airteltigo",
    requiresProvider: true,
    manualSettlement: false,
    providerCodes: ["hubtel", "paystack", "flutterwave"],
  },
  {
    code: "bank_transfer",
    label: "Bank transfer",
    kind: "bank",
    blurb: "Transfer to the settlement account; reconciled by finance.",
    requiresProvider: false,
    manualSettlement: true,
    providerCodes: ["manual_bank", "paystack", "flutterwave"],
  },
  {
    code: "card_visa",
    label: "Visa",
    kind: "card",
    blurb: "Provider-hosted card checkout. No card data touches this app.",
    requiresProvider: true,
    manualSettlement: false,
    providerCodes: ["paystack", "flutterwave"],
  },
  {
    code: "card_mastercard",
    label: "Mastercard",
    kind: "card",
    blurb: "Provider-hosted card checkout. No card data touches this app.",
    requiresProvider: true,
    manualSettlement: false,
    providerCodes: ["paystack", "flutterwave"],
  },
  {
    code: "cash",
    label: "Cash at branch",
    kind: "cash",
    blurb: "Counted and confirmed by a teller at the counter.",
    requiresProvider: false,
    manualSettlement: true,
    providerCodes: [],
  },
];

export function railSpec(code: string): RailSpec | undefined {
  return RAIL_SPECS.find((r) => r.code === code);
}

export const RAIL_LABELS: Record<string, string> = Object.fromEntries(
  RAIL_SPECS.map((r) => [r.code, r.label]),
);

export const PAYMENT_PURPOSES = [
  "savings_deposit",
  "loan_repayment",
  "contribution",
  "fee",
  "share_purchase",
] as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

export const PURPOSE_LABELS: Record<PaymentPurpose, string> = {
  savings_deposit: "Savings deposit",
  loan_repayment: "Loan repayment",
  contribution: "Contribution",
  fee: "Fee / charge",
  share_purchase: "Share purchase",
};

export const INTENT_STATUSES = [
  "requires_configuration",
  "pending",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
  "reversed",
] as const;
export type IntentStatus = (typeof INTENT_STATUSES)[number];

export const STATUS_LABELS: Record<IntentStatus, string> = {
  requires_configuration: "Awaiting provider setup",
  pending: "Pending",
  processing: "Processing",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
  reversed: "Reversed",
};

/** Rail availability as shown in the UI. */
export type RailAvailability = {
  rail: Rail;
  label: string;
  kind: RailKind;
  blurb: string;
  network: GhNetwork | null;
  /** A configured + enabled provider with credentials exists. */
  live: boolean;
  /** Configured provider(s) exist but only in sandbox mode. */
  sandbox: boolean;
  /** Selectable — either a ready provider, or a manual-settlement rail. */
  selectable: boolean;
  providerCode: string | null;
  statusLabel: string;
  note: string;
};

export function minorToMajor(minor: number): number {
  return minor / 100;
}

export function majorToMinor(major: number): number {
  return Math.round(major * 100);
}
