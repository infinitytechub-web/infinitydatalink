/**
 * Pure loan amortisation maths shared by the loan calculator (member + admin)
 * and by any server-side estimate. Kept dependency-free so it can be unit
 * tested and imported from both client and server code.
 */
export type RepaymentFrequency = "monthly" | "biweekly" | "weekly" | "quarterly";

export const FREQUENCIES: Array<{ value: RepaymentFrequency; label: string; perYear: number; days: number }> = [
  { value: "weekly", label: "Weekly", perYear: 52, days: 7 },
  { value: "biweekly", label: "Bi-weekly", perYear: 26, days: 14 },
  { value: "monthly", label: "Monthly", perYear: 12, days: 30 },
  { value: "quarterly", label: "Quarterly", perYear: 4, days: 91 },
];

export function frequencyMeta(f: RepaymentFrequency) {
  return FREQUENCIES.find((x) => x.value === f) ?? FREQUENCIES[2]!;
}

export type ScheduleRow = {
  period: number;
  dueDate: string;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
};

export type LoanEstimate = {
  installment: number;
  periods: number;
  totalInterest: number;
  totalRepayment: number;
  effectivePeriodicRate: number;
  schedule: ScheduleRow[];
};

export type LoanEstimateInput = {
  /** Principal advanced to the borrower. */
  amount: number;
  /** Nominal annual interest rate, in percent (e.g. 24 for 24%/yr). */
  annualRatePercent: number;
  /** Loan duration in months. */
  termMonths: number;
  frequency: RepaymentFrequency;
  /** ISO date (yyyy-mm-dd) the loan starts; first instalment falls one period later. */
  startDate: string;
};

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function addPeriod(date: Date, frequency: RepaymentFrequency, index: number): Date {
  const d = new Date(date.getTime());
  if (frequency === "monthly") {
    d.setUTCMonth(d.getUTCMonth() + index);
    return d;
  }
  if (frequency === "quarterly") {
    d.setUTCMonth(d.getUTCMonth() + index * 3);
    return d;
  }
  const days = frequency === "weekly" ? 7 : 14;
  d.setUTCDate(d.getUTCDate() + days * index);
  return d;
}

export function periodsFor(termMonths: number, frequency: RepaymentFrequency): number {
  const perYear = frequencyMeta(frequency).perYear;
  return Math.max(1, Math.round((termMonths / 12) * perYear));
}

/**
 * Standard annuity (equal-instalment) amortisation. Rounding differences are
 * absorbed by the final instalment so the closing balance is exactly zero.
 */
export function computeLoanEstimate(input: LoanEstimateInput): LoanEstimate {
  const amount = Math.max(0, Number(input.amount) || 0);
  const annual = Math.max(0, Number(input.annualRatePercent) || 0) / 100;
  const periods = periodsFor(Math.max(1, Number(input.termMonths) || 1), input.frequency);
  const perYear = frequencyMeta(input.frequency).perYear;
  const rate = annual / perYear;

  const rawInstallment =
    rate === 0 ? amount / periods : (amount * rate) / (1 - Math.pow(1 + rate, -periods));
  const installment = round2(rawInstallment);

  const start = new Date(`${input.startDate}T00:00:00.000Z`);
  const validStart = Number.isFinite(start.getTime()) ? start : new Date();

  const schedule: ScheduleRow[] = [];
  let balance = amount;
  let totalInterest = 0;
  let totalRepayment = 0;

  for (let i = 1; i <= periods; i += 1) {
    const interest = round2(balance * rate);
    let principal = round2(installment - interest);
    let payment = installment;
    if (i === periods || principal >= balance) {
      principal = round2(balance);
      payment = round2(principal + interest);
    }
    balance = round2(balance - principal);
    totalInterest = round2(totalInterest + interest);
    totalRepayment = round2(totalRepayment + payment);
    schedule.push({
      period: i,
      dueDate: addPeriod(validStart, input.frequency, i).toISOString().slice(0, 10),
      payment,
      principal,
      interest,
      balance: Math.max(0, balance),
    });
    if (balance <= 0) break;
  }

  return {
    installment,
    periods: schedule.length,
    totalInterest,
    totalRepayment,
    effectivePeriodicRate: rate,
    schedule,
  };
}
