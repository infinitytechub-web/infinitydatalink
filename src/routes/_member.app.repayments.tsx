import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense, useEffect, useState } from "react";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import {
  getMyRepaymentDashboard,
  type RepaymentDashboard,
} from "@/lib/member-repayments.functions";
import { LoanRepaymentDialog } from "@/components/loan-repayment-dialog";

export const Route = createFileRoute("/_member/app/repayments")({
  head: () => ({
    meta: [{ title: "Loan repayments — IT-360 CashApp" }, { name: "robots", content: "noindex" }],
  }),
  component: RepaymentsPage,
});

const dashboardQuery = queryOptions({
  queryKey: ["member", "repayment-dashboard"],
  queryFn: () => getMyRepaymentDashboard(),
});

function fmtDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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
  const qc = useQueryClient();
  // Live updates: RLS limits these events to the member's own schedule and transactions.
  useEffect(() => {
    const refresh = () => qc.invalidateQueries({ queryKey: dashboardQuery.queryKey });
    const channel = supabase
      .channel(`repayments-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "loan_repayments" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, refresh)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);
  const { totals, loans, ledger, upcoming, history } = data;

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
          hint={
            totals.pendingSubmitted > 0
              ? `${formatMoney(totals.pendingSubmitted)} awaiting confirmation`
              : `${formatMoney(totals.repaidTotal)} repaid in total`
          }
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
                <Link
                  to="/app/loans"
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
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
                  <th className="px-6 py-3 text-right font-medium">Pay</th>
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
                    <td className="px-6 py-3">
                      <StatusPill status={loan.status} />
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums">
                      <Money amount={loan.outstanding_principal} />
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums">
                      {loan.monthly_payment == null ? "—" : formatMoney(loan.monthly_payment)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-muted-foreground">
                      {loan.installments_paid}/{loan.installments_total || "—"}
                    </td>
                    <td className="px-6 py-3 text-right text-muted-foreground">
                      {fmtDate(loan.next_due_date)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums">
                      {loan.arrears > 0 ? (
                        <span className="font-medium text-destructive">
                          {formatMoney(loan.arrears)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {loan.pending_submitted > 0 ? (
                        <p className="text-[11px] text-muted-foreground">
                          {formatMoney(loan.pending_submitted)} awaiting confirmation
                        </p>
                      ) : null}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {loan.payable ? (
                        <LoanRepaymentDialog
                          loanId={loan.id}
                          loanRef={loan.ref}
                          suggestedAmount={loan.next_due_amount}
                          maxAmount={Math.max(0, loan.balance_due - loan.pending_submitted)}
                          triggerLabel="Pay"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
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
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
              >
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
                  <span className="text-sm font-semibold tabular-nums">
                    {formatMoney(item.remaining)}
                  </span>
                  <LoanRepaymentDialog
                    loanId={item.loan_id}
                    loanRef={item.loan_ref}
                    suggestedAmount={item.remaining}
                    maxAmount={item.remaining}
                    triggerLabel="Pay"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <LedgerSection ledger={ledger} loans={loans} />



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
                    <td className="px-6 py-3">
                      <StatusPill status={row.status as "cleared" | "pending" | "failed"} />
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums">
                      <Money amount={row.amount} />
                    </td>
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

function LedgerSection({
  ledger,
  loans,
}: {
  ledger: RepaymentDashboard["ledger"];
  loans: RepaymentDashboard["loans"];
}) {
  const [loanId, setLoanId] = useState<string>("all");
  const rows = loanId === "all" ? ledger : ledger.filter((r) => r.loan_id === loanId);
  const totalDue = rows.reduce((s, r) => s + r.total_due, 0);
  const totalPaid = rows.reduce((s, r) => s + r.paid_amount, 0);
  const totalRemaining = rows.reduce((s, r) => s + r.remaining, 0);

  return (
    <SectionCard
      title="Repayment ledger"
      action={
        loans.length > 1 ? (
          <select
            aria-label="Filter ledger by loan"
            value={loanId}
            onChange={(event) => setLoanId(event.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          >
            <option value="all">All loans</option>
            {loans.map((loan) => (
              <option key={loan.id} value={loan.id}>
                {loan.ref}
              </option>
            ))}
          </select>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <div className="p-6">
          <EmptyState
            title="No schedule yet"
            hint="A repayment schedule is created once your loan is disbursed."
            icon={<CalendarClock className="size-5" aria-hidden="true" />}
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-6 py-3 font-medium">#</th>
                <th className="px-6 py-3 font-medium">Loan</th>
                <th className="px-6 py-3 font-medium">Due date</th>
                <th className="px-6 py-3 text-right font-medium">Amount due</th>
                <th className="px-6 py-3 text-right font-medium">Paid</th>
                <th className="px-6 py-3 text-right font-medium">Remaining</th>
                <th className="px-6 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30">
                  <td className="px-6 py-3 tabular-nums text-muted-foreground">
                    {row.installment_no}
                  </td>
                  <td className="px-6 py-3">{row.loan_ref}</td>
                  <td className="px-6 py-3 text-muted-foreground">{fmtDate(row.due_date)}</td>
                  <td className="px-6 py-3 text-right tabular-nums">
                    {formatMoney(row.total_due)}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums">
                    {formatMoney(row.paid_amount)}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums">
                    {formatMoney(row.remaining)}
                  </td>
                  <td className="px-6 py-3">
                    {row.remaining <= 0.005 ? (
                      <StatusPill status="cleared" />
                    ) : row.overdue ? (
                      <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-destructive">
                        Overdue
                      </span>
                    ) : (
                      <StatusPill status="pending" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border bg-muted/30 text-xs font-semibold">
              <tr>
                <td className="px-6 py-3" colSpan={3}>
                  Totals
                </td>
                <td className="px-6 py-3 text-right tabular-nums">{formatMoney(totalDue)}</td>
                <td className="px-6 py-3 text-right tabular-nums">{formatMoney(totalPaid)}</td>
                <td className="px-6 py-3 text-right tabular-nums">{formatMoney(totalRemaining)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
