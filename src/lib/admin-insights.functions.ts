import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertAdminRole,
  bucketKeyOf,
  bucketRange,
  num,
  pct,
  resolveScopeUserIds,
  scoped,
  NO_MATCH_UUID,
  type Granularity,
} from "@/lib/admin-insights.server";

export type SavingsBucket = {
  bucket: string;
  deposits: number;
  withdrawals: number;
  net: number;
  cumulative: number;
};

export type WithdrawalBucket = {
  bucket: string;
  requested: number;
  approved: number;
  paid: number;
  rejected: number;
  cancelled: number;
  amount: number;
};

export type LoanBucket = {
  bucket: string;
  disbursed: number;
  repaid: number;
  applications: number;
};

export type CancellationBucket = {
  bucket: string;
  total: number;
  cancelled: number;
  admin_cancelled: number;
  member_cancelled: number;
  rate: number;
};

export type MixRow = { label: string; value: number };

export type AdminInsights = {
  from: string;
  to: string;
  granularity: Granularity;
  savings: {
    series: SavingsBucket[];
    opening_balance: number;
    closing_balance: number;
    deposits_total: number;
    withdrawals_total: number;
    growth_rate: number;
  };
  withdrawals: {
    series: WithdrawalBucket[];
    status_mix: MixRow[];
    channel_mix: MixRow[];
    requested_total: number;
    paid_total: number;
    approval_rate: number;
    avg_decision_hours: number;
  };
  loans: {
    series: LoanBucket[];
    status_mix: MixRow[];
    product_mix: MixRow[];
    disbursed_total: number;
    repaid_total: number;
    outstanding_principal: number;
    on_time_rate: number;
    overdue_installments: number;
  };
  cancellations: {
    series: CancellationBucket[];
    reason_mix: MixRow[];
    total_requests: number;
    total_cancelled: number;
    cancellation_rate: number;
    admin_share: number;
  };
};

const InputSchema = z.object({
  from: z.string(),
  to: z.string(),
  granularity: z.enum(["day", "week", "month"]).default("day"),
  /** Organisation scope: "all" (institution-wide) or an entity id. */
  entity: z.string().default("all"),
});

export const getAdminInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }): Promise<AdminInsights> => {
    await assertAdminRole(context.supabase, context.userId);
    const sb = context.supabase;
    const g = data.granularity as Granularity;
    const fromDate = new Date(`${data.from}T00:00:00Z`);
    const toDate = new Date(`${data.to}T00:00:00Z`);
    const fromISO = fromDate.toISOString();
    const toISO = new Date(toDate.getTime() + 24 * 3600 * 1000 - 1).toISOString();

    // Organisation scope → member ids, applied to every user-keyed fact table.
    const scopeIds = await resolveScopeUserIds(sb, data.entity);
    let scopedLoanIds: string[] | null = null;
    if (scopeIds) {
      const { data: loanRows } = await scoped(sb.from("loans").select("id"), scopeIds);
      scopedLoanIds = (loanRows ?? []).map((r: any) => String(r.id));
    }

    const [txRes, priorTxRes, wdRes, loansRes, repayRes] = await Promise.all([
      scoped(
        sb
          .from("transactions")
          .select("amount, kind, created_at")
          .eq("status", "cleared")
          .gte("created_at", fromISO)
          .lte("created_at", toISO),
        scopeIds,
      ),
      scoped(
        sb
          .from("transactions")
          .select("amount, kind")
          .eq("status", "cleared")
          .lt("created_at", fromISO),
        scopeIds,
      ),
      scoped(
        sb
          .from("savings_withdrawal_requests")
          .select(
            "amount, channel, status, reason, cancellation_reason, cancelled_by_role, created_at, approved_at, rejected_at, paid_at, cancelled_at",
          )
          .gte("created_at", fromISO)
          .lte("created_at", toISO),
        scopeIds,
      ),
      scoped(
        sb
          .from("loans")
          .select(
            "amount, product, status, outstanding_principal, created_at, disbursed_at, decided_at",
          )
          .gte("created_at", fromISO)
          .lte("created_at", toISO),
        scopeIds,
      ),
      (() => {
        const q = sb
          .from("loan_repayments")
          .select("total_due, paid_amount, due_date, paid_at, status")
          .gte("due_date", data.from)
          .lte("due_date", data.to);
        return scopedLoanIds
          ? q.in("loan_id", scopedLoanIds.length ? scopedLoanIds : [NO_MATCH_UUID])
          : q;
      })(),
    ]);

    const buckets = bucketRange(fromDate, toDate, g);
    const idx = new Set(buckets);
    const keyFor = (iso: string) => {
      const k = bucketKeyOf(iso, g);
      return idx.has(k) ? k : null;
    };

    /* ---------------- savings growth ---------------- */
    const savingsMap = new Map<string, SavingsBucket>(
      buckets.map((b) => [b, { bucket: b, deposits: 0, withdrawals: 0, net: 0, cumulative: 0 }]),
    );
    for (const t of txRes.data ?? []) {
      const k = keyFor((t as any).created_at);
      if (!k) continue;
      const row = savingsMap.get(k)!;
      const amt = num((t as any).amount);
      if ((t as any).kind === "deposit" || (t as any).kind === "interest") row.deposits += amt;
      else if ((t as any).kind === "withdrawal") row.withdrawals += amt;
    }
    let opening = 0;
    for (const t of priorTxRes.data ?? []) {
      const amt = num((t as any).amount);
      if ((t as any).kind === "deposit" || (t as any).kind === "interest") opening += amt;
      else if ((t as any).kind === "withdrawal") opening -= amt;
    }
    let running = opening;
    const savingsSeries = buckets.map((b) => {
      const row = savingsMap.get(b)!;
      row.net = row.deposits - row.withdrawals;
      running += row.net;
      row.cumulative = running;
      return row;
    });
    const depositsTotal = savingsSeries.reduce((s, r) => s + r.deposits, 0);
    const withdrawalsTotal = savingsSeries.reduce((s, r) => s + r.withdrawals, 0);

    /* ---------------- withdrawal trends ---------------- */
    const wdMap = new Map<string, WithdrawalBucket>(
      buckets.map((b) => [
        b,
        { bucket: b, requested: 0, approved: 0, paid: 0, rejected: 0, cancelled: 0, amount: 0 },
      ]),
    );
    const statusMix = new Map<string, number>();
    const channelMix = new Map<string, number>();
    const cancelMap = new Map<string, CancellationBucket>(
      buckets.map((b) => [
        b,
        { bucket: b, total: 0, cancelled: 0, admin_cancelled: 0, member_cancelled: 0, rate: 0 },
      ]),
    );
    const reasonMix = new Map<string, number>();
    let decisionHours = 0;
    let decisionCount = 0;
    let paidTotal = 0;
    let approvedCount = 0;
    let decidedCount = 0;

    const wdRows = wdRes.data ?? [];
    for (const w of wdRows as any[]) {
      const k = keyFor(w.created_at);
      const amt = num(w.amount);
      statusMix.set(w.status, (statusMix.get(w.status) ?? 0) + 1);
      channelMix.set(w.channel ?? "unknown", (channelMix.get(w.channel ?? "unknown") ?? 0) + 1);
      if (w.paid_at) paidTotal += amt;
      if (w.approved_at || w.rejected_at) {
        decidedCount += 1;
        if (w.approved_at) approvedCount += 1;
        const decidedAt = new Date(w.approved_at ?? w.rejected_at).getTime();
        decisionHours += (decidedAt - new Date(w.created_at).getTime()) / 3_600_000;
        decisionCount += 1;
      }
      if (!k) continue;
      const row = wdMap.get(k)!;
      row.requested += 1;
      row.amount += amt;
      if (w.approved_at) row.approved += 1;
      if (w.paid_at) row.paid += 1;
      if (w.rejected_at) row.rejected += 1;
      if (w.cancelled_at) row.cancelled += 1;

      const c = cancelMap.get(k)!;
      c.total += 1;
      if (w.cancelled_at) {
        c.cancelled += 1;
        if ((w.cancelled_by_role ?? "member") === "member") c.member_cancelled += 1;
        else c.admin_cancelled += 1;
        const reason = String(w.cancellation_reason ?? "Unspecified").trim() || "Unspecified";
        reasonMix.set(reason, (reasonMix.get(reason) ?? 0) + 1);
      }
    }
    const cancelSeries = buckets.map((b) => {
      const row = cancelMap.get(b)!;
      row.rate = Math.round(pct(row.cancelled, row.total) * 1000) / 10;
      return row;
    });
    const totalCancelled = cancelSeries.reduce((s, r) => s + r.cancelled, 0);
    const adminCancelled = cancelSeries.reduce((s, r) => s + r.admin_cancelled, 0);

    /* ---------------- loan performance ---------------- */
    const loanMap = new Map<string, LoanBucket>(
      buckets.map((b) => [b, { bucket: b, disbursed: 0, repaid: 0, applications: 0 }]),
    );
    const loanStatus = new Map<string, number>();
    const loanProduct = new Map<string, number>();
    let outstanding = 0;
    for (const l of (loansRes.data ?? []) as any[]) {
      loanStatus.set(l.status, (loanStatus.get(l.status) ?? 0) + 1);
      loanProduct.set(
        l.product ?? "Unknown",
        (loanProduct.get(l.product ?? "Unknown") ?? 0) + num(l.amount),
      );
      outstanding += num(l.outstanding_principal);
      const applyKey = keyFor(l.created_at);
      if (applyKey) loanMap.get(applyKey)!.applications += 1;
      const when = l.disbursed_at ?? l.decided_at;
      if (when && ["approved", "active", "closed"].includes(l.status)) {
        const k = keyFor(when);
        if (k) loanMap.get(k)!.disbursed += num(l.amount);
      }
    }
    let onTime = 0;
    let dueSettled = 0;
    let overdue = 0;
    const today = new Date().toISOString().slice(0, 10);
    for (const r of (repayRes.data ?? []) as any[]) {
      const paid = num(r.paid_amount);
      if (paid > 0 && r.paid_at) {
        const k = keyFor(r.paid_at);
        if (k) loanMap.get(k)!.repaid += paid;
        dueSettled += 1;
        if (new Date(r.paid_at).toISOString().slice(0, 10) <= String(r.due_date)) onTime += 1;
      } else if (String(r.due_date) < today && paid < num(r.total_due)) {
        overdue += 1;
      }
    }
    const loanSeries = buckets.map((b) => loanMap.get(b)!);

    const toMix = (m: Map<string, number>, limit = 8): MixRow[] =>
      Array.from(m.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, limit);

    return {
      from: data.from,
      to: data.to,
      granularity: g,
      savings: {
        series: savingsSeries,
        opening_balance: opening,
        closing_balance: running,
        deposits_total: depositsTotal,
        withdrawals_total: withdrawalsTotal,
        growth_rate: opening === 0 ? 0 : (running - opening) / Math.abs(opening),
      },
      withdrawals: {
        series: buckets.map((b) => wdMap.get(b)!),
        status_mix: toMix(statusMix),
        channel_mix: toMix(channelMix),
        requested_total: wdRows.reduce((s: number, w: any) => s + num(w.amount), 0),
        paid_total: paidTotal,
        approval_rate: pct(approvedCount, decidedCount),
        avg_decision_hours: decisionCount === 0 ? 0 : decisionHours / decisionCount,
      },
      loans: {
        series: loanSeries,
        status_mix: toMix(loanStatus),
        product_mix: toMix(loanProduct),
        disbursed_total: loanSeries.reduce((s, r) => s + r.disbursed, 0),
        repaid_total: loanSeries.reduce((s, r) => s + r.repaid, 0),
        outstanding_principal: outstanding,
        on_time_rate: pct(onTime, dueSettled),
        overdue_installments: overdue,
      },
      cancellations: {
        series: cancelSeries,
        reason_mix: toMix(reasonMix, 6),
        total_requests: wdRows.length,
        total_cancelled: totalCancelled,
        cancellation_rate: pct(totalCancelled, wdRows.length),
        admin_share: pct(adminCancelled, totalCancelled),
      },
    };
  });
