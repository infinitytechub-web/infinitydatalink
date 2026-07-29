import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { CalendarClock, Receipt } from "lucide-react";
import {
  EmptyState,
  KPIStat,
  Money,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
  StatusPill,
} from "@/components/primitives";
import { formatMoney } from "@/lib/org-config";
import { getMyRepaymentDashboard } from "@/lib/member-repayments.functions";

export const Route = createFileRoute("/_member/app/repayments")({
  head: () => ({
    meta: [
      { title: "Loan repayments — IT-360 CashApp" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RepaymentsPage,
});

const dashboardQuery = queryOptions({
  queryKey: ["member", "repayment-dashboard"],
  queryFn: () => getMyRepaymentDashboard(),
});

function fmtDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function RepaymentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Member portal"
        title="Loan repayments"
        description="Track outstanding balances, upcoming installments and every payment you've made."
      />
      <Suspense fallback={<SectionCardSkeleton rows={6} />}>
        <RepaymentsContent />
      </Suspense>
    </div>
  );
}

function RepaymentsContent() {
  const { data } = useSuspenseQuery(dashboardQuery);
  const { totals, loans, upcoming, history } = data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPIStat
          label="Outstanding balance"
          value={formatMoney(totals.outstanding)}
          hint={`${totals.activeLoans} active loan${totals.activeLoans === 1 ? "" : "s"}`}
          accent
        />
        <KPIStat
          label="Next installment"
          value={totals.nextDueAmount == null ? "—" : formatMoney(totals.nextDueAmount)}
          hint={totals.nextDueDate ? `Due ${fmtDate(totals.nextDueDate)}` : "Nothing scheduled"}
          tone="royal"
        />
        <KPIStat
          label="Arrears"
          value={formatMoney(totals.arrears)}
          hint={totals.arrears > 0 ? "Overdue installments" : "No overdue installments"}
          tone={totals.arrears > 0 ? "rose" : "emerald"}
        />
        <KPIStat
          label="Repaid this month"
          value={formatMoney(totals.repaidThisMonth)}
          hint={`${formatMoney(totals.repaidTotal)} repaid in total`}
          tone="emerald"
        />
      </div>

      <SectionCard title="Loan balances">
        {loans.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No disbursed loans yet"
              hint="Once a loan is approved and disbursed, its balance and schedule appear here."
              action={
                <Link to="/app/loans" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                  View loan applications
                </Link>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Loan</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 text-right font-medium">Outstanding</th>
                  <th className="px-6 py-3 text-right font-medium">Monthly</th>
                  <th className="px-6 py-3 text-right font-medium">Progress</th>
                  <th className="px-6 py-3 text-right font-medium">Next due</th>
                  <th className="px-6 py-3 text-right font-medium">Arrears</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loans.map((loan) => (
                  <tr key={loan.id} className="hover:bg-muted/30">
                    <td className="px-6 py-3">
                      <Link
                        to="/app/loans/$loanId"
                        params={{ loanId: loan.id }}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {loan.ref}
                      </Link>
                      <p className="text-xs text-muted-foreground">{loan.product}</p>
                    </td>
                    <td className="px-6 py-3"><StatusPill status={loan.status} /></td>
                    <td className="px-6 py-3 text-right tabular-nums"><Money amount={loan.outstanding_principal} /></td>
                    <td className="px-6 py-3 text-right tabular-nums">
                      {loan.monthly_payment == null ? "—" : formatMoney(loan.monthly_payment)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-muted-foreground">
                      {loan.installments_paid}/{loan.installments_total || "—"}
                    </td>
                    <td className="px-6 py-3 text-right text-muted-foreground">{fmtDate(loan.next_due_date)}</td>
                    <td className="px-6 py-3 text-right tabular-nums">
                      {loan.arrears > 0 ? (
                        <span className="font-medium text-destructive">{formatMoney(loan.arrears)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Upcoming installments" accent="gold">
        {upcoming.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No installments due"
              hint="You're fully up to date on your repayment schedule."
              icon={<CalendarClock className="size-5" aria-hidden="true" />}
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {upcoming.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Installment {item.installment_no} · {item.loan_ref}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Due {fmtDate(item.due_date)}
                    {item.paid_amount > 0 ? ` · ${formatMoney(item.paid_amount)} already paid` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {item.overdue ? (
                    <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-destructive">
                      Overdue
                    </span>
                  ) : null}
                  <span className="text-sm font-semibold tabular-nums">{formatMoney(item.remaining)}</span>
                  <Link
                    to="/app/loans/$loanId"
                    params={{ loanId: item.loan_id }}
                    className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Pay
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Payment history" accent="emerald">
        {history.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No repayments recorded"
              hint="Payments you submit or that staff record will be listed here."
              icon={<Receipt className="size-5" aria-hidden="true" />}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Reference</th>
                  <th className="px-6 py-3 font-medium">Loan</th>
                  <th className="px-6 py-3 font-medium">Channel</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/30">
                    <td className="px-6 py-3 text-muted-foreground">{fmtDate(row.created_at)}</td>
                    <td className="px-6 py-3 font-medium">{row.ref}</td>
                    <td className="px-6 py-3">
                      {row.loan_id ? (
                        <Link
                          to="/app/loans/$loanId"
                          params={{ loanId: row.loan_id }}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {row.loan_ref ?? "View"}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">{row.channel ?? "—"}</td>
                    <td className="px-6 py-3"><StatusPill status={row.status} /></td>
                    <td className="px-6 py-3 text-right tabular-nums"><Money amount={row.amount} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
