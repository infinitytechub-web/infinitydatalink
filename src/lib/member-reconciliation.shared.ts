/** Shared types for the member reconciliation view. */

export type ReconIssueKind =
  | "stale_pending"
  | "withdrawal_unposted"
  | "receipt_unposted"
  | "repayment_unposted"
  | "balance_drift"
  | "failed_item";

export const RECON_ISSUE_LABELS: Record<ReconIssueKind, string> = {
  stale_pending: "Pending too long",
  withdrawal_unposted: "Paid withdrawal not in ledger",
  receipt_unposted: "Receipt without cleared payment",
  repayment_unposted: "Repayment not posted to ledger",
  balance_drift: "Balance does not match ledger",
  failed_item: "Failed transaction",
};

/** Datasets a reconciliation row can drill into. */
export type ReconRecordDataset = "transactions" | "withdrawals" | "receipts" | "repayments" | "savings";

export type MemberReconIssue = {
  key: string;
  issue: ReconIssueKind;
  detail: string;
  reference: string;
  amount: number;
  occurred_on: string;
  dataset: ReconRecordDataset;
  record_id: string;
};

export type MemberReconResult = {
  generated_at: string;
  period: { from: string; to: string };
  cleared_count: number;
  cleared_total: number;
  pending_count: number;
  pending_total: number;
  failed_count: number;
  failed_total: number;
  net_drift: number;
  issues: MemberReconIssue[];
};
