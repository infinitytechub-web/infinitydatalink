/** Datasets a member may run against their own records. */
export const MEMBER_REPORT_DATASETS = [
  "savings",
  "loans",
  "repayments",
  "withdrawals",
  "receipts",
  "transactions",
] as const;
export type MemberReportDataset = (typeof MEMBER_REPORT_DATASETS)[number];

export const MEMBER_DATASET_LABELS: Record<MemberReportDataset, string> = {
  savings: "Savings accounts",
  loans: "My loans",
  repayments: "Repayment schedule",
  withdrawals: "Withdrawals",
  receipts: "Payment receipts",
  transactions: "Transaction history",
};

export const MEMBER_DATASET_HINTS: Record<MemberReportDataset, string> = {
  savings: "Every savings account you hold, with plan, balance and status.",
  loans: "Your loan applications, decisions, disbursements and outstanding balances.",
  repayments: "Instalments due, paid and outstanding across your loans.",
  withdrawals: "Withdrawal requests with the approval and payout trail.",
  receipts: "Receipts issued for payments you have made.",
  transactions: "Your complete transaction ledger across every module.",
};

export type MemberReportColumn = {
  key: string;
  header: string;
  align?: "left" | "right";
  money?: boolean;
};

export type MemberReportRow = Record<string, string | number>;

export type MemberReportResult = {
  dataset: MemberReportDataset;
  columns: MemberReportColumn[];
  rows: MemberReportRow[];
  total: number;
  page: number;
  page_size: number;
  summary: Array<{ label: string; value: number; money?: boolean }>;
};
