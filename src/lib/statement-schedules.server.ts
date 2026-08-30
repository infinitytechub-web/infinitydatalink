/**
 * Scheduled statement generation and delivery.
 *
 * The processor is bounded (fixed batch per run), single-flight (database
 * lease), and idempotent (a unique statement_runs row per schedule + period).
 * Delivery goes through the member notification fan-out, so email/SMS respect
 * the member's notification preferences and the existing outbox dispatcher.
 */
import { notifyUser } from "@/lib/notify.server";
import { FREQUENCY_DAYS, type StatementFrequency } from "@/lib/statement-schedules.shared";
import { MEMBER_DATASET_LABELS, type MemberReportDataset } from "@/lib/member-reports.shared";

const BATCH = 25;
const MAX_FAILURES = 5;
const num = (v: unknown) => Number(v ?? 0);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function nextRunAt(frequency: StatementFrequency, from = new Date()): string {
  const next = new Date(from.getTime());
  if (frequency === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  else if (frequency === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
  else next.setUTCMonth(next.getUTCMonth() + 3);
  next.setUTCHours(6, 0, 0, 0);
  return next.toISOString();
}

export type StatementSummary = {
  rows: number;
  lines: Array<{ label: string; value: string }>;
};

/** Period totals for one dataset, scoped to a single member. */
export async function summariseStatement(
  sb: any,
  uid: string,
  dataset: MemberReportDataset,
  from: string,
  to: string,
): Promise<StatementSummary> {
  const fromIso = `${from}T00:00:00.000Z`;
  const toIso = `${to}T23:59:59.999Z`;
  const money = (v: number) => v.toFixed(2);

  if (dataset === "savings") {
    const { data, error } = await sb
      .from("savings_accounts")
      .select("id, balance, status")
      .eq("user_id", uid);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    return {
      rows: rows.length,
      lines: [
        { label: "Accounts", value: String(rows.length) },
        { label: "Total balance", value: money(rows.reduce((s, a) => s + num(a.balance), 0)) },
        {
          label: "Active accounts",
          value: String(rows.filter((a) => a.status === "active").length),
        },
      ],
    };
  }

  if (dataset === "loans") {
    const { data, error } = await sb
      .from("loans")
      .select("id, amount, outstanding_principal, status")
      .eq("user_id", uid);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    return {
      rows: rows.length,
      lines: [
        { label: "Loans", value: String(rows.length) },
        { label: "Borrowed", value: money(rows.reduce((s, l) => s + num(l.amount), 0)) },
        {
          label: "Outstanding",
          value: money(rows.reduce((s, l) => s + num(l.outstanding_principal), 0)),
        },
      ],
    };
  }

  if (dataset === "repayments") {
    const { data: loans, error: loanErr } = await sb.from("loans").select("id").eq("user_id", uid);
    if (loanErr) throw new Error(loanErr.message);
    const ids = ((loans ?? []) as any[]).map((l) => l.id);
    if (ids.length === 0) return { rows: 0, lines: [{ label: "Instalments", value: "0" }] };
    const { data, error } = await sb
      .from("loan_repayments")
      .select("id, total_due, paid_amount, status")
      .in("loan_id", ids)
      .gte("due_date", from)
      .lte("due_date", to);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    return {
      rows: rows.length,
      lines: [
        { label: "Instalments", value: String(rows.length) },
        { label: "Due", value: money(rows.reduce((s, p) => s + num(p.total_due), 0)) },
        { label: "Paid", value: money(rows.reduce((s, p) => s + num(p.paid_amount), 0)) },
      ],
    };
  }

  if (dataset === "withdrawals") {
    const { data, error } = await sb
      .from("savings_withdrawal_requests")
      .select("id, amount, status")
      .eq("user_id", uid)
      .gte("created_at", fromIso)
      .lte("created_at", toIso);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    return {
      rows: rows.length,
      lines: [
        { label: "Requests", value: String(rows.length) },
        { label: "Requested value", value: money(rows.reduce((s, w) => s + num(w.amount), 0)) },
        {
          label: "Paid out",
          value: money(
            rows.filter((w) => w.status === "paid").reduce((s, w) => s + num(w.amount), 0),
          ),
        },
      ],
    };
  }

  if (dataset === "receipts") {
    const { data, error } = await sb
      .from("payment_receipts")
      .select("id, amount_minor, payment_intents!inner(member_id)")
      .eq("payment_intents.member_id", uid)
      .gte("issued_at", fromIso)
      .lte("issued_at", toIso);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    return {
      rows: rows.length,
      lines: [
        { label: "Receipts", value: String(rows.length) },
        {
          label: "Total paid",
          value: money(rows.reduce((s, r) => s + num(r.amount_minor) / 100, 0)),
        },
      ],
    };
  }

  const { data, error } = await sb
    .from("transactions")
    .select("id, amount, status")
    .eq("user_id", uid)
    .gte("created_at", fromIso)
    .lte("created_at", toIso);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];
  return {
    rows: rows.length,
    lines: [
      { label: "Transactions", value: String(rows.length) },
      { label: "Value", value: money(rows.reduce((s, t) => s + num(t.amount), 0)) },
      { label: "Cleared", value: String(rows.filter((t) => t.status === "cleared").length) },
      { label: "Pending", value: String(rows.filter((t) => t.status === "pending").length) },
    ],
  };
}

export type ScheduleRow = {
  id: string;
  user_id: string;
  dataset: MemberReportDataset;
  frequency: StatementFrequency;
  email: boolean;
  sms: boolean;
  failure_count: number;
};

/** Generates and delivers one statement. Records the run for idempotency. */
export async function deliverStatement(
  admin: any,
  schedule: ScheduleRow,
): Promise<{ status: "sent" | "skipped" | "failed"; rows: number; error?: string }> {
  const periodDays = FREQUENCY_DAYS[schedule.frequency];
  const end = new Date();
  const start = new Date(end.getTime() - periodDays * 24 * 3600 * 1000);
  const period_start = iso(start);
  const period_end = iso(end);

  const existing = await admin
    .from("statement_runs")
    .select("id")
    .eq("schedule_id", schedule.id)
    .eq("period_start", period_start)
    .eq("period_end", period_end)
    .maybeSingle();
  if (existing.data) return { status: "skipped", rows: 0 };

  try {
    const summary = await summariseStatement(
      admin,
      schedule.user_id,
      schedule.dataset,
      period_start,
      period_end,
    );
    const label = MEMBER_DATASET_LABELS[schedule.dataset];
    const bodyLines = summary.lines.map((l) => `${l.label}: ${l.value}`).join(" · ");
    const channels: Array<"email" | "sms"> = [];
    if (schedule.email) channels.push("email");
    if (schedule.sms) channels.push("sms");

    const result = await notifyUser({
      userId: schedule.user_id,
      category: "statement.scheduled",
      title: `${label} statement · ${period_start} → ${period_end}`,
      body: `${summary.rows} record(s). ${bodyLines}. Open your reports hub for the full statement and downloads.`,
      link: `/app/reports?dataset=${schedule.dataset}&from=${period_start}&to=${period_end}`,
      meta: { dataset: schedule.dataset, period_start, period_end, rows: summary.rows },
      dedupeKey: `statement:${schedule.id}:${period_start}:${period_end}`,
      channels: channels.length > 0 ? ["in_app", ...channels] : ["in_app"],
    });

    await admin.from("statement_runs").insert({
      schedule_id: schedule.id,
      user_id: schedule.user_id,
      period_start,
      period_end,
      row_count: summary.rows,
      channels: result.delivered,
      status: result.ok ? "sent" : "failed",
      error: result.error ?? null,
    });

    if (!result.ok) return { status: "failed", rows: summary.rows, error: result.error };
    return { status: "sent", rows: summary.rows };
  } catch (err: any) {
    const message = err?.message ?? String(err);
    await admin.from("statement_runs").insert({
      schedule_id: schedule.id,
      user_id: schedule.user_id,
      period_start,
      period_end,
      row_count: 0,
      channels: [],
      status: "failed",
      error: message,
    });
    return { status: "failed", rows: 0, error: message };
  }
}

export type ProcessResult = {
  claimed: boolean;
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  paused: number;
};

/** Processes every schedule that is due, up to the batch cap. */
export async function processDueStatementSchedules(): Promise<ProcessResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;

  const lease = await admin.rpc("claim_statement_job_lease", { _minutes: 10 });
  if (lease.error) throw new Error(lease.error.message);
  if (lease.data !== true) {
    return { claimed: false, processed: 0, sent: 0, failed: 0, skipped: 0, paused: 0 };
  }

  const out: ProcessResult = {
    claimed: true,
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    paused: 0,
  };
  try {
    const { data, error } = await admin
      .from("statement_schedules")
      .select("id, user_id, dataset, frequency, email, sms, failure_count")
      .eq("active", true)
      .lte("next_run_at", new Date().toISOString())
      .order("next_run_at", { ascending: true })
      .limit(BATCH);
    if (error) throw new Error(error.message);

    for (const schedule of (data ?? []) as ScheduleRow[]) {
      out.processed += 1;
      const result = await deliverStatement(admin, schedule);
      if (result.status === "sent") out.sent += 1;
      else if (result.status === "skipped") out.skipped += 1;
      else out.failed += 1;

      const failures = result.status === "failed" ? (schedule.failure_count ?? 0) + 1 : 0;
      const pause = failures >= MAX_FAILURES;
      if (pause) out.paused += 1;

      await admin
        .from("statement_schedules")
        .update({
          last_run_at: new Date().toISOString(),
          last_status: result.status,
          last_error: result.error ?? null,
          failure_count: failures,
          active: !pause,
          next_run_at: nextRunAt(schedule.frequency),
        })
        .eq("id", schedule.id);
    }
  } finally {
    await admin.rpc("release_statement_job_lease");
  }
  return out;
}
