import { useMemo, useState } from "react";
import { Calculator, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KPIStat, SectionCard } from "@/components/primitives";
import { computeLoanEstimate, FREQUENCIES, type RepaymentFrequency } from "@/lib/loan-schedule";
import { formatMoney } from "@/lib/org-config";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export type CalculatorResult = {
  amount: number;
  annualRatePercent: number;
  termMonths: number;
  frequency: RepaymentFrequency;
  startDate: string;
  installment: number;
  totalInterest: number;
  totalRepayment: number;
};

/**
 * Shared loan calculator surface used by both portals. All maths is pure and
 * client-side; `onApply` lets the member portal hand the figures to the loan
 * application workflow without re-entering them.
 */
export function LoanCalculator({
  defaultRate = 24,
  applyAction,
  onResultChange,
}: {
  defaultRate?: number;
  /** Rendered under the summary — e.g. an "Apply for this loan" button. */
  applyAction?: (result: CalculatorResult) => React.ReactNode;
  onResultChange?: (result: CalculatorResult) => void;
}) {
  const [amount, setAmount] = useState("5000");
  const [rate, setRate] = useState(String(defaultRate));
  const [term, setTerm] = useState("12");
  const [frequency, setFrequency] = useState<RepaymentFrequency>("monthly");
  const [startDate, setStartDate] = useState(todayISO());

  const amountNum = Number(amount) || 0;
  const rateNum = Number(rate) || 0;
  const termNum = Math.max(1, Number(term) || 1);

  const estimate = useMemo(
    () =>
      computeLoanEstimate({
        amount: amountNum,
        annualRatePercent: rateNum,
        termMonths: termNum,
        frequency,
        startDate,
      }),
    [amountNum, rateNum, termNum, frequency, startDate],
  );

  const result: CalculatorResult = {
    amount: amountNum,
    annualRatePercent: rateNum,
    termMonths: termNum,
    frequency,
    startDate,
    installment: estimate.installment,
    totalInterest: estimate.totalInterest,
    totalRepayment: estimate.totalRepayment,
  };
  onResultChange?.(result);

  return (
    <div className="space-y-6">
      <SectionCard title="Loan inputs" description="Adjust the figures to model a repayment plan.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="calc-amount">Loan amount</Label>
            <Input
              id="calc-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="calc-rate">Interest rate (% per year)</Label>
            <Input id="calc-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="calc-term">Duration (months)</Label>
            <Input id="calc-term" inputMode="numeric" value={term} onChange={(e) => setTerm(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Repayment frequency</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as RepaymentFrequency)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="calc-start">Start date</Label>
            <Input
              id="calc-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value || todayISO())}
            />
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPIStat label="Instalment" value={formatMoney(estimate.installment)} tone="royal" hint={`${estimate.periods} payments`} />
        <KPIStat label="Total interest" value={formatMoney(estimate.totalInterest)} tone="gold" />
        <KPIStat label="Total repayment" value={formatMoney(estimate.totalRepayment)} tone="teal" />
        <KPIStat label="Principal" value={formatMoney(amountNum)} tone="forest" />
      </div>

      <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          These figures are estimates only. Final instalments, fees and due dates are confirmed by the lending
          team when your application is assessed and disbursed.
        </span>
      </p>

      {applyAction ? <div className="flex flex-wrap gap-3">{applyAction(result)}</div> : null}

      <SectionCard
        title="Repayment schedule"
        description="Estimated due dates, split between interest and principal."
      >
        <div className="max-h-[28rem] overflow-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/70 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Due date</th>
                <th className="px-3 py-2 text-right">Payment</th>
                <th className="px-3 py-2 text-right">Principal</th>
                <th className="px-3 py-2 text-right">Interest</th>
                <th className="px-3 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {estimate.schedule.map((row) => (
                <tr key={row.period} className="border-t border-border/70 tabular-nums">
                  <td className="px-3 py-2">{row.period}</td>
                  <td className="px-3 py-2">{row.dueDate}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(row.payment)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(row.principal)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(row.interest)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(row.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Calculator className="size-4" aria-hidden />
        <span>Annuity method — equal instalments with interest charged on the reducing balance.</span>
      </div>
    </div>
  );
}
