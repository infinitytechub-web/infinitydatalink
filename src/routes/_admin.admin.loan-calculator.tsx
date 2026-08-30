import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/primitives";
import { LoanCalculator } from "@/components/loan-calculator";

export const Route = createFileRoute("/_admin/admin/loan-calculator")({
  head: () => ({
    meta: [
      { title: "Loan calculator — IT-360 CashApp Admin" },
      {
        name: "description",
        content: "Model instalments, interest and amortisation schedules for member loan enquiries.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLoanCalculator,
});

function AdminLoanCalculator() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Loan calculator"
        description="Quote instalments and amortisation schedules for member enquiries. Results are estimates."
      />
      <LoanCalculator />
    </div>
  );
}
