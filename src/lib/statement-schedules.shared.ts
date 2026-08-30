/** Shared definitions for scheduled member statement delivery. */
import type { MemberReportDataset } from "@/lib/member-reports.shared";

export const STATEMENT_FREQUENCIES = ["weekly", "monthly", "quarterly"] as const;
export type StatementFrequency = (typeof STATEMENT_FREQUENCIES)[number];

export const FREQUENCY_LABELS: Record<StatementFrequency, string> = {
  weekly: "Every week",
  monthly: "Every month",
  quarterly: "Every quarter",
};

/** Number of days each frequency covers, used for the statement period. */
export const FREQUENCY_DAYS: Record<StatementFrequency, number> = {
  weekly: 7,
  monthly: 30,
  quarterly: 91,
};

export type StatementSchedule = {
  id: string;
  dataset: MemberReportDataset;
  frequency: StatementFrequency;
  email: boolean;
  sms: boolean;
  active: boolean;
  next_run_at: string;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
};

export type StatementRun = {
  id: string;
  schedule_id: string;
  period_start: string;
  period_end: string;
  row_count: number;
  channels: string[];
  status: string;
  error: string | null;
  created_at: string;
};
