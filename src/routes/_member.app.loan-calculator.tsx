import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/primitives";
import { LoanCalculator } from "@/components/loan-calculator";
import { LoanApplicationDialog } from "@/components/loan-application-dialog";

export const Route = createFileRoute("/_member/app/loan-calculator")({
  head: () => ({
    meta: [
      { title: "Loan calculator — IT-360 CashApp" },
      {
        name: "description",
        content:
          "Estimate your loan instalments, total interest and repayment schedule, then apply with the same figures.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MemberLoanCalculator,
});

function MemberLoanCalculator() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Loan calculator"
        description="Model an instalment plan before you apply. Estimates only — the lending team confirms final terms."
      />
      <LoanCalculator
        applyAction={(r) => (
          <LoanApplicationDialog
            key={`${r.amount}-${r.termMonths}`}
            defaultAmount={r.amount}
            defaultTermMonths={r.termMonths}
            trigger={
              <button className="rounded bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90">
                Apply for this loan
              </button>
            }
          />
        )}
      />
    </div>
  );
}
