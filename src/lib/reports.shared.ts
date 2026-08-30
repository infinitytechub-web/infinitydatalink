/** Report datasets available in the admin reports hub. */
export const REPORT_DATASETS = [
  "savings",
  "loans",
  "repayments",
  "withdrawals",
  "deposits",
  "income",
  "expenses",
  "transactions",
] as const;
export type ReportDataset = (typeof REPORT_DATASETS)[number];

export const DATASET_LABELS: Record<ReportDataset, string> = {
  savings: "Savings accounts",
  loans: "Loans",
  repayments: "Loan repayments",
  withdrawals: "Withdrawals",
  deposits: "Deposits",
  income: "Income",
  expenses: "Expenses",
  transactions: "All transactions",
};

export const DATASET_HINTS: Record<ReportDataset, string> = {
  savings: "Balances, plans and account status per member.",
  loans: "Applications, decisions, disbursements and arrears.",
  repayments: "Instalment schedule with due, paid and outstanding amounts.",
  withdrawals: "Withdrawal requests with approval and payout trail.",
  deposits: "Cleared and pending member deposits by channel.",
  income: "Interest and fee income posted to the ledger.",
  expenses: "Operating expenses by category, vendor and status.",
  transactions: "Complete transaction ledger across every module.",
};

export type ReportColumn = {
  key: string;
  header: string;
  align?: "left" | "right";
  money?: boolean;
};

export type ReportRow = Record<string, string | number>;

export type ReportResult = {
  dataset: ReportDataset;
  columns: ReportColumn[];
  rows: ReportRow[];
  total: number;
  page: number;
  page_size: number;
  /** Aggregate figures for the filtered set, shown above the table. */
  summary: Array<{ label: string; value: number; money?: boolean }>;
};
