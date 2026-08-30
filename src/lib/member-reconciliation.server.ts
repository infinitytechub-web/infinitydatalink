/**
 * Member-scoped reconciliation engine.
 *
 * Recomputes pending vs cleared positions from the member's own ledger and
 * flags mismatches between the ledger and the records that should have
 * produced entries in it. Every query is filtered to the caller's id on top
 * of RLS.
 */
import type { MemberReconIssue, MemberReconResult } from "@/lib/member-reconciliation.shared";

/** Signed contribution of each cleared ledger kind to a savings balance. */
const SIGN: Record<string, number> = {
  deposit: 1,
  interest: 1,
  transfer_in: 1,
  loan_disbursement: 1,
  withdrawal: -1,
  transfer_out: -1,
  fee: -1,
  loan_repayment: -1,
  expense: -1,
};

const num = (v: unknown) => Number(v ?? 0);
const day = (v: unknown) => (v ? String(v).slice(0, 10) : "—");
const round = (v: number) => Math.round(v * 100) / 100;

export async function buildMemberReconciliation(
  sb: any,
  uid: string,
  input: { date_from: string; date_to: string; stale_days: number; tolerance: number },
): Promise<MemberReconResult> {
  const fromIso = `${input.date_from}T00:00:00.000Z`;
  const toIso = `${input.date_to}T23:59:59.999Z`;

  const [txnRes, allTxnRes, wdRes, acctRes, loanRes] = await Promise.all([
    sb
      .from("transactions")
      .select("id, ref, kind, amount, status, note, created_at")
      .eq("user_id", uid)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .limit(2000),
    sb
      .from("transactions")
      .select("id, ref, kind, amount, status, savings_account_id, created_at")
      .eq("user_id", uid)
      .limit(5000),
    sb
      .from("savings_withdrawal_requests")
      .select("id, ref, amount, status, created_at, paid_at")
      .eq("user_id", uid)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .limit(1000),
    sb.from("savings_accounts").select("id, nickname, balance, status").eq("user_id", uid),
    sb.from("loans").select("id, ref").eq("user_id", uid),
  ]);
  for (const r of [txnRes, allTxnRes, wdRes, acctRes, loanRes]) {
    if (r.error) throw new Error(r.error.message);
  }

  const periodTxns = (txnRes.data ?? []) as any[];
  const allTxns = (allTxnRes.data ?? []) as any[];
  const withdrawals = (wdRes.data ?? []) as any[];
  const accounts = (acctRes.data ?? []) as any[];
  const loans = (loanRes.data ?? []) as any[];
  const loanRef = new Map(loans.map((l) => [l.id, l.ref as string | null]));

  // Receipts for the member, resolved through their payment intents.
  const receiptsRes = await sb
    .from("payment_receipts")
    .select(
      "id, receipt_no, amount_minor, issued_at, payment_intents!inner(reference, member_id, status)",
    )
    .eq("payment_intents.member_id", uid)
    .gte("issued_at", fromIso)
    .lte("issued_at", toIso)
    .limit(1000);
  if (receiptsRes.error) throw new Error(receiptsRes.error.message);
  const receipts = (receiptsRes.data ?? []) as any[];

  // Repayment instalments across the member's loans.
  let repayments: any[] = [];
  if (loans.length > 0) {
    const repayRes = await sb
      .from("loan_repayments")
      .select("id, loan_id, installment_no, due_date, total_due, paid_amount, status")
      .in(
        "loan_id",
        loans.map((l) => l.id),
      )
      .gte("due_date", input.date_from)
      .lte("due_date", input.date_to)
      .limit(2000);
    if (repayRes.error) throw new Error(repayRes.error.message);
    repayments = (repayRes.data ?? []) as any[];
  }

  let clearedCount = 0;
  let clearedTotal = 0;
  let pendingCount = 0;
  let pendingTotal = 0;
  let failedCount = 0;
  let failedTotal = 0;
  const issues: MemberReconIssue[] = [];
  const staleCutoff = Date.now() - input.stale_days * 24 * 3600 * 1000;

  for (const t of periodTxns) {
    const amount = num(t.amount);
    if (t.status === "cleared") {
      clearedCount += 1;
      clearedTotal += amount;
    } else if (t.status === "pending") {
      pendingCount += 1;
      pendingTotal += amount;
      if (new Date(t.created_at).getTime() < staleCutoff) {
        issues.push({
          key: `pending:${t.id}`,
          issue: "stale_pending",
          detail: `Pending for more than ${input.stale_days} day(s) — ${String(t.kind).replace(/_/g, " ")}`,
          reference: t.ref ?? String(t.id).slice(0, 8),
          amount,
          occurred_on: day(t.created_at),
          dataset: "transactions",
          record_id: t.id,
        });
      }
    } else {
      failedCount += 1;
      failedTotal += amount;
      issues.push({
        key: `failed:${t.id}`,
        issue: "failed_item",
        detail: "Transaction failed and was not posted to your balance",
        reference: t.ref ?? String(t.id).slice(0, 8),
        amount,
        occurred_on: day(t.created_at),
        dataset: "transactions",
        record_id: t.id,
      });
    }
  }

  // Paid withdrawals must have a matching cleared withdrawal entry in the ledger.
  const clearedWithdrawalAmounts = allTxns
    .filter((t) => t.status === "cleared" && (t.kind === "withdrawal" || t.kind === "transfer_out"))
    .map((t) => Math.abs(num(t.amount)));
  for (const w of withdrawals) {
    if (w.status !== "paid") continue;
    const amount = num(w.amount);
    const idx = clearedWithdrawalAmounts.findIndex((a) => Math.abs(a - amount) <= input.tolerance);
    if (idx === -1) {
      issues.push({
        key: `withdrawal:${w.id}`,
        issue: "withdrawal_unposted",
        detail: "Marked paid but no cleared withdrawal of this amount appears in your ledger",
        reference: w.ref ?? String(w.id).slice(0, 8),
        amount,
        occurred_on: day(w.paid_at ?? w.created_at),
        dataset: "withdrawals",
        record_id: w.id,
      });
    } else {
      clearedWithdrawalAmounts.splice(idx, 1);
    }
  }

  // Receipts must correspond to a cleared inbound entry.
  const clearedInbound = allTxns
    .filter((t) => t.status === "cleared" && num(t.amount) > 0)
    .map((t) => num(t.amount));
  for (const r of receipts) {
    const amount = round(num(r.amount_minor) / 100);
    const idx = clearedInbound.findIndex((a) => Math.abs(a - amount) <= input.tolerance);
    if (idx === -1) {
      issues.push({
        key: `receipt:${r.id}`,
        issue: "receipt_unposted",
        detail: "Receipt issued but no cleared payment of this amount appears in your ledger",
        reference: r.receipt_no ?? r.payment_intents?.reference ?? String(r.id).slice(0, 8),
        amount,
        occurred_on: day(r.issued_at),
        dataset: "receipts",
        record_id: r.id,
      });
    } else {
      clearedInbound.splice(idx, 1);
    }
  }

  // Paid instalments must be backed by cleared loan repayment entries.
  const clearedRepayTotal = allTxns
    .filter((t) => t.status === "cleared" && t.kind === "loan_repayment")
    .reduce((s, t) => s + Math.abs(num(t.amount)), 0);
  const paidInstalmentTotal = repayments.reduce((s, p) => s + num(p.paid_amount), 0);
  if (paidInstalmentTotal - clearedRepayTotal > Math.max(input.tolerance, 0.01)) {
    const worst = repayments
      .filter((p) => num(p.paid_amount) > 0)
      .sort((a, b) => num(b.paid_amount) - num(a.paid_amount))[0];
    if (worst) {
      issues.push({
        key: `repayment:${worst.id}`,
        issue: "repayment_unposted",
        detail: `Instalments show ${round(paidInstalmentTotal)} paid but only ${round(
          clearedRepayTotal,
        )} is posted in the ledger`,
        reference: `${loanRef.get(worst.loan_id) ?? String(worst.loan_id).slice(0, 8)} · #${num(
          worst.installment_no,
        )}`,
        amount: round(paidInstalmentTotal - clearedRepayTotal),
        occurred_on: day(worst.due_date),
        dataset: "repayments",
        record_id: worst.id,
      });
    }
  }

  // Recorded savings balances vs. balances recomputed from cleared movements.
  let netDrift = 0;
  for (const a of accounts) {
    const computed = allTxns
      .filter((t) => t.savings_account_id === a.id && t.status === "cleared")
      .reduce((s, t) => s + (SIGN[t.kind] ?? 0) * num(t.amount), 0);
    const delta = round(num(a.balance) - computed);
    netDrift += delta;
    if (Math.abs(delta) > Math.max(input.tolerance, 0.01)) {
      issues.push({
        key: `account:${a.id}`,
        issue: "balance_drift",
        detail: `Recorded balance ${round(num(a.balance))} vs ledger ${round(computed)}`,
        reference: a.nickname ?? String(a.id).slice(0, 8),
        amount: delta,
        occurred_on: day(new Date().toISOString()),
        dataset: "savings",
        record_id: a.id,
      });
    }
  }

  issues.sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount));

  return {
    generated_at: new Date().toISOString(),
    period: { from: input.date_from, to: input.date_to },
    cleared_count: clearedCount,
    cleared_total: round(clearedTotal),
    pending_count: pendingCount,
    pending_total: round(pendingTotal),
    failed_count: failedCount,
    failed_total: round(failedTotal),
    net_drift: round(netDrift),
    issues: issues.slice(0, 200),
  };
}
