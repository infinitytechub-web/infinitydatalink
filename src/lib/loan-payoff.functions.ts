// Early settlement / payoff quote for a loan.
// Read-only and advisory: computes principal, interest due, accrued interest to
// the settlement date, outstanding penalties, and the rebate of future interest.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PayoffLine = { label: string; amount: number; note?: string };

export type PayoffQuote = {
  loan_id: string;
  ref: string;
  product: string;
  status: string;
  settle_on: string;
  interest_rate: number;
  lines: PayoffLine[];
  outstanding_principal: number;
  interest_past_due: number;
  interest_accrued: number;
  penalties_outstanding: number;
  interest_rebate: number;
  total_payoff: number;
  savings_balance: number;
  savings_covers_payoff: boolean;
  shortfall: number;
  installments_remaining: number;
  quoted_at: string;
  disclaimer: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 86_400_000;

function daysBetween(from: string, to: string) {
  const diff = (Date.parse(to) - Date.parse(from)) / DAY;
  return diff > 0 ? Math.floor(diff) : 0;
}

export const getLoanPayoffQuote = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        loan_id: z.string().uuid(),
        settle_on: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD settlement date")
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<PayoffQuote> => {
    const settleOn = data.settle_on ?? new Date().toISOString().slice(0, 10);

    // RLS scopes this read: members see only their own loans, staff see per policy.
    const { data: loan, error } = await context.supabase
      .from("loans")
      .select(
        "id, ref, product, status, user_id, interest_rate, outstanding_principal, penalty_accrued, penalty_paid, disbursed_at, first_payment_at",
      )
      .eq("id", data.loan_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!loan) throw new Error("Loan not found or not visible to you");
    if (!["active", "approved"].includes(String((loan as any).status))) {
      throw new Error("Settlement quotes are only available for active loans");
    }

    const { data: schedule, error: sErr } = await context.supabase
      .from("loan_repayments")
      .select("id, installment_no, due_date, principal_due, interest_due, total_due, paid_amount, status")
      .eq("loan_id", data.loan_id)
      .order("installment_no", { ascending: true });
    if (sErr) throw new Error(sErr.message);

    const rows = (schedule ?? []) as any[];
    const unpaid = rows.filter((r) => String(r.status) !== "paid");

    // Interest already due but unpaid (installments on or before the settle date).
    let interestPastDue = 0;
    let futureInterest = 0;
    for (const r of unpaid) {
      const interest = Number(r.interest_due ?? 0);
      const paid = Number(r.paid_amount ?? 0);
      const total = Number(r.total_due ?? 0);
      const outstandingShare = total > 0 ? Math.max(0, 1 - paid / total) : 1;
      if (String(r.due_date) <= settleOn) interestPastDue += interest * outstandingShare;
      else futureInterest += interest * outstandingShare;
    }

    // Accrued interest from the last elapsed due date (or disbursement) to settlement.
    const elapsedDates = rows
      .map((r) => String(r.due_date))
      .filter((d) => d <= settleOn)
      .sort();
    const accrualFrom =
      elapsedDates.at(-1) ??
      String((loan as any).disbursed_at ?? "").slice(0, 10) ??
      settleOn;
    const principal = Number((loan as any).outstanding_principal ?? 0);
    const rate = Number((loan as any).interest_rate ?? 0);
    const accrualDays = accrualFrom ? daysBetween(accrualFrom, settleOn) : 0;
    const interestAccrued = (principal * (rate / 100) * accrualDays) / 365;

    const penalties = Math.max(
      0,
      Number((loan as any).penalty_accrued ?? 0) - Number((loan as any).penalty_paid ?? 0),
    );

    const total = principal + interestPastDue + interestAccrued + penalties;

    // Member savings position (own accounts under RLS; staff per policy).
    const { data: accounts } = await context.supabase
      .from("savings_accounts")
      .select("balance")
      .eq("user_id", (loan as any).user_id);
    const savings = (accounts ?? []).reduce((sum: number, a: any) => sum + Number(a.balance ?? 0), 0);

    return {
      loan_id: String((loan as any).id),
      ref: String((loan as any).ref),
      product: String((loan as any).product),
      status: String((loan as any).status),
      settle_on: settleOn,
      interest_rate: rate,
      lines: [
        { label: "Outstanding principal", amount: round2(principal) },
        { label: "Interest past due", amount: round2(interestPastDue), note: "Unpaid interest on elapsed installments" },
        {
          label: "Interest accrued to settlement",
          amount: round2(interestAccrued),
          note: `${accrualDays} day(s) at ${rate}% p.a. since ${accrualFrom || "disbursement"}`,
        },
        { label: "Outstanding late fees", amount: round2(penalties) },
        {
          label: "Future interest rebated",
          amount: -round2(futureInterest),
          note: "Interest on installments after the settlement date is waived",
        },
      ],
      outstanding_principal: round2(principal),
      interest_past_due: round2(interestPastDue),
      interest_accrued: round2(interestAccrued),
      penalties_outstanding: round2(penalties),
      interest_rebate: round2(futureInterest),
      total_payoff: round2(total),
      savings_balance: round2(savings),
      savings_covers_payoff: savings >= total,
      shortfall: round2(Math.max(0, total - savings)),
      installments_remaining: unpaid.length,
      quoted_at: new Date().toISOString(),
      disclaimer:
        "Indicative quote. The final settlement figure is confirmed by the finance office on the day payment is received.",
    };
  });
