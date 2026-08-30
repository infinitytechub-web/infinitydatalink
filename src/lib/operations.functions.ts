import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/permissions";

/**
 * Operations control board.
 *
 * One aggregated read for the duty officer: work queues with the age of the
 * oldest item (for SLA breach highlighting), money in motion today, the newest
 * audit activity and system-health tiles. Gated on `approvals.view`; the counts
 * are read with the privileged client because the board must show totals the
 * caller may not be able to read row-by-row.
 */

export type QueueTile = {
  key: string;
  label: string;
  count: number;
  /** Age of the oldest waiting item, in hours. */
  oldest_hours: number | null;
  sla_hours: number;
  link: string;
};

export type MoneyTile = { key: string; label: string; amount: number; count: number };

export type ActivityRow = {
  id: string;
  action: string;
  actor: string;
  actor_role: string | null;
  target: string | null;
  created_at: string;
};

export type HealthTile = {
  key: string;
  label: string;
  value: string;
  detail: string | null;
  status: "ok" | "warn" | "bad";
  link: string | null;
};

export type OperationsBoard = {
  generated_at: string;
  queues: QueueTile[];
  money: MoneyTile[];
  activity: ActivityRow[];
  health: HealthTile[];
};

function hoursSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return ms > 0 ? Math.round((ms / 3_600_000) * 10) / 10 : 0;
}

export const getOperationsBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OperationsBoard> => {
    await assertPermission(context.supabase, context.userId, "approvals", "view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb: any = supabaseAdmin;

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const dayStart = startOfDay.toISOString();

    /** count + oldest created_at for a pending queue */
    async function queue(
      table: string,
      filter: (q: any) => any,
      opts: { key: string; label: string; sla_hours: number; link: string; column?: string },
    ): Promise<QueueTile> {
      const col = opts.column ?? "created_at";
      const [{ count }, { data: oldest }] = await Promise.all([
        filter(sb.from(table).select("id", { count: "exact", head: true })),
        filter(sb.from(table).select(col)).order(col, { ascending: true }).limit(1),
      ]);
      return {
        key: opts.key,
        label: opts.label,
        count: count ?? 0,
        oldest_hours: hoursSince((oldest?.[0] as any)?.[col] ?? null),
        sla_hours: opts.sla_hours,
        link: opts.link,
      };
    }

    const queues = await Promise.all([
      queue("profiles", (q) => q.eq("status", "pending"), {
        key: "approvals",
        label: "Membership approvals",
        sla_hours: 24,
        link: "/admin/approvals",
      }),
      queue("profiles", (q) => q.eq("kyc", "pending").not("kyc_submitted_at", "is", null), {
        key: "kyc",
        label: "KYC reviews",
        sla_hours: 48,
        link: "/admin/members",
        column: "kyc_submitted_at",
      }),
      queue("savings_withdrawal_requests", (q) => q.eq("status", "pending"), {
        key: "withdrawals",
        label: "Withdrawal requests",
        sla_hours: 12,
        link: "/admin/savings/withdrawals",
      }),
      queue("loans", (q) => q.eq("status", "pending"), {
        key: "loans",
        label: "Loan applications",
        sla_hours: 48,
        link: "/admin/loans",
      }),
      queue("loan_settlement_requests", (q) => q.eq("status", "pending"), {
        key: "settlements",
        label: "Early settlements",
        sla_hours: 24,
        link: "/admin/loan-settlements",
      }),
      queue("loan_restructures", (q) => q.eq("status", "pending"), {
        key: "restructures",
        label: "Loan workouts",
        sla_hours: 48,
        link: "/admin/loan-workouts",
      }),
      queue("settings_change_requests", (q) => q.eq("status", "pending"), {
        key: "changes",
        label: "Staged setting changes",
        sla_hours: 24,
        link: "/admin/change-approvals",
      }),
    ]);

    // ---- money in motion (today, UTC) ----
    const { data: txns } = await sb
      .from("transactions")
      .select("kind, amount, status")
      .gte("created_at", dayStart)
      .limit(5000);
    const sumBy = (kinds: string[]) => {
      const rows = (txns ?? []).filter((t: any) => kinds.includes(t.kind) && t.status !== "failed");
      return {
        amount: rows.reduce((s: number, t: any) => s + Number(t.amount ?? 0), 0),
        count: rows.length,
      };
    };
    const deposits = sumBy(["deposit", "transfer_in"]);
    const withdrawals = sumBy(["withdrawal", "transfer_out"]);
    const repayments = sumBy(["loan_repayment"]);
    const disbursed = sumBy(["loan_disbursement"]);

    const { data: tills } = await sb
      .from("teller_sessions")
      .select("opening_float, expected_close")
      .eq("status", "open")
      .limit(200);
    const cashPosition = (tills ?? []).reduce(
      (s: number, t: any) => s + Number(t.expected_close ?? t.opening_float ?? 0),
      0,
    );

    const money: MoneyTile[] = [
      { key: "deposits", label: "Deposits today", amount: deposits.amount, count: deposits.count },
      {
        key: "withdrawals",
        label: "Withdrawals today",
        amount: withdrawals.amount,
        count: withdrawals.count,
      },
      {
        key: "repayments",
        label: "Repayments today",
        amount: repayments.amount,
        count: repayments.count,
      },
      {
        key: "disbursed",
        label: "Disbursed today",
        amount: disbursed.amount,
        count: disbursed.count,
      },
      {
        key: "till",
        label: "Open teller tills",
        amount: cashPosition,
        count: (tills ?? []).length,
      },
    ];

    // ---- activity feed ----
    const { data: audit } = await sb
      .from("audit_log")
      .select("id, action, actor_email, actor_role, target, created_at")
      .order("created_at", { ascending: false })
      .limit(12);
    const activity: ActivityRow[] = (audit ?? []).map((a: any) => ({
      id: a.id,
      action: a.action,
      actor: a.actor_email ?? "system",
      actor_role: a.actor_role ?? null,
      target: a.target ?? null,
      created_at: a.created_at,
    }));

    // ---- health ----
    const since24h = new Date(Date.now() - 86_400_000).toISOString();
    const [
      { count: failedRecurring },
      { count: failedOutbox },
      { count: runtimeErrors },
      { count: online },
      { data: lastRuns },
    ] = await Promise.all([
      sb
        .from("savings_recurring_contributions")
        .select("id", { count: "exact", head: true })
        .eq("last_run_status", "failed"),
      sb
        .from("notification_outbox")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed"),
      sb
        .from("runtime_error_logs")
        .select("id", { count: "exact", head: true })
        .gte("occurred_at", since24h)
        .in("severity", ["error", "fatal"]),
      sb
        .from("presence_sessions")
        .select("token", { count: "exact", head: true })
        .gte("created_at", new Date(Date.now() - 120_000).toISOString()),
      sb
        .from("cron_job_runs")
        .select("job, status, finished_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const newestRun = (lastRuns ?? [])[0] as any;
    const failedRun = (lastRuns ?? []).find((r: any) => r.status === "failed") as any;

    const health: HealthTile[] = [
      {
        key: "recurring",
        label: "Failed recurring contributions",
        value: String(failedRecurring ?? 0),
        detail:
          (failedRecurring ?? 0) > 0 ? "Needs a retry or member contact" : "All schedules healthy",
        status: (failedRecurring ?? 0) > 0 ? "warn" : "ok",
        link: "/admin/savings",
      },
      {
        key: "outbox",
        label: "Failed notifications",
        value: String(failedOutbox ?? 0),
        detail: (failedOutbox ?? 0) > 0 ? "Resend from the delivery page" : "Queue is clear",
        status: (failedOutbox ?? 0) > 0 ? "warn" : "ok",
        link: "/admin/notifications",
      },
      {
        key: "runtime",
        label: "Runtime errors (24h)",
        value: String(runtimeErrors ?? 0),
        detail: (runtimeErrors ?? 0) > 0 ? "Review the error log" : "No errors reported",
        status: (runtimeErrors ?? 0) > 5 ? "bad" : (runtimeErrors ?? 0) > 0 ? "warn" : "ok",
        link: "/admin/logs",
      },
      {
        key: "jobs",
        label: "Scheduled jobs",
        value: failedRun ? "Attention" : "Healthy",
        detail: newestRun ? `Last: ${newestRun.job} · ${newestRun.status}` : "No runs recorded yet",
        status: failedRun ? "bad" : "ok",
        link: "/admin/health",
      },
      {
        key: "online",
        label: "Users online now",
        value: String(online ?? 0),
        detail: "Live presence in the last 2 minutes",
        status: "ok",
        link: "/admin/live-users",
      },
    ];

    return { generated_at: new Date().toISOString(), queues, money, activity, health };
  });
