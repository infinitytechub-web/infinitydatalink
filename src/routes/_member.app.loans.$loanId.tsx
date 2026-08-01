import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { EmptyState, KPIStat, Money, PageHeader, SectionCard, StatusPill } from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { getMyLoanDetail, submitLoanRepayment } from "@/lib/member-data.functions";
import { getLoanPayoffQuote } from "@/lib/loan-payoff.functions";

export const Route = createFileRoute("/_member/app/loans/$loanId")({
  component: MemberLoanDetail,
});

const detailQuery = (loan_id: string) =>
  queryOptions({
    queryKey: ["member", "loans", "detail", loan_id],
    queryFn: () => getMyLoanDetail({ data: { loan_id } }),
  });

function MemberLoanDetail() {
  const { loanId } = Route.useParams();
  return (
    <>
      <div className="mb-2 text-[10px] uppercase tracking-widest text-emerald-deep/60">
        <Link to="/app/loans" className="hover:underline">← Back to my loans</Link>
      </div>
      <PageHeader
        eyebrow="Member portal"
        title="Loan detail"
        description="Repayment schedule, outstanding balance, and payment history."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Body loanId={loanId} />
      </Suspense>
    </>
  );
}

function Body({ loanId }: { loanId: string }) {
  const { data: loan } = useSuspenseQuery(detailQuery(loanId));
  const paid = loan.schedule.filter((r) => r.status === "paid").length;
  const nextDue = loan.schedule.find((r) => r.status !== "paid") ?? null;

  return (
    <>
      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat label="Principal" value={<Money amount={loan.amount} />} />
        <KPIStat label="Outstanding" value={<Money amount={loan.outstanding_principal} />} accent />
        <KPIStat label="Monthly payment" value={loan.monthly_payment != null ? <Money amount={loan.monthly_payment} /> : "—"} />
        <KPIStat label="Paid installments" value={`${paid} / ${loan.term_months}`} hint={nextDue ? `Next due ${nextDue.due_date}` : "All installments paid"} />
      </section>

      <SectionCard title={`${loan.ref} · ${loan.product}`} action={<StatusPill status={loan.status} />}>
        <div className="grid gap-6 p-6 md:grid-cols-2 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-emerald-deep/40">Terms</div>
            <div>{loan.term_months} months · {loan.interest_rate}% p.a.</div>
            <div className="text-[11px] text-emerald-deep/50">
              First due {loan.first_payment_at ?? "—"} · Matures {loan.maturity_at ?? "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-emerald-deep/40">Timeline</div>
            <div className="text-[11px] text-emerald-deep/70">
              Applied {new Date(loan.created_at).toLocaleDateString()}
              {loan.decided_at ? ` · Decided ${new Date(loan.decided_at).toLocaleDateString()}` : ""}
              {loan.disbursed_at ? ` · Disbursed ${new Date(loan.disbursed_at).toLocaleDateString()}` : ""}
            </div>
          </div>
          {loan.purpose && (
            <div className="md:col-span-2">
              <div className="text-[10px] uppercase tracking-widest text-emerald-deep/40">Purpose</div>
              <div className="text-emerald-deep/80">{loan.purpose}</div>
            </div>
          )}
          {loan.decision_note && (
            <div className="md:col-span-2">
              <div className="text-[10px] uppercase tracking-widest text-emerald-deep/40">Officer note</div>
              <div className="text-emerald-deep/80">{loan.decision_note}</div>
            </div>
          )}
        </div>
      </SectionCard>

      {loan.status === "active" && (
        <RepayCard
          loanId={loan.id}
          loanRef={loan.ref}
          outstanding={loan.outstanding_principal}
          suggested={loan.monthly_payment ?? 0}
        />
      )}
      {loan.status === "active" && <PayoffCard loanId={loan.id} />}
      {loan.status === "approved" && (
        <SectionCard title="Awaiting disbursement">
          <div className="p-6 text-sm text-emerald-deep/70">
            Your loan has been approved. Repayment options unlock once finance disburses the funds.
          </div>
        </SectionCard>
      )}
      {loan.status === "pending" && (
        <SectionCard title="Application under review">
          <div className="p-6 text-sm text-emerald-deep/70">
            A loan officer is reviewing your application. You will be notified of the decision.
          </div>
        </SectionCard>
      )}
      {loan.status === "rejected" && (
        <SectionCard title="Application declined">
          <div className="p-6 text-sm text-emerald-deep/70">
            This application was declined{loan.decision_note ? `: ${loan.decision_note}` : "."}
          </div>
        </SectionCard>
      )}
      {loan.status === "closed" && (
        <SectionCard title="Loan closed">
          <div className="p-6 text-sm text-emerald-deep/70">This loan has been fully repaid. Thank you.</div>
        </SectionCard>
      )}

      <SectionCard title="Repayment schedule">
        {loan.schedule.length === 0 ? (
          <div className="p-6"><EmptyState title="No schedule yet" hint="A schedule is generated when your loan is disbursed." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
                  <th className="px-6 py-3 font-medium">#</th>
                  <th className="px-6 py-3 font-medium">Due date</th>
                  <th className="px-6 py-3 text-right font-medium">Principal</th>
                  <th className="px-6 py-3 text-right font-medium">Interest</th>
                  <th className="px-6 py-3 text-right font-medium">Total due</th>
                  <th className="px-6 py-3 text-right font-medium">Paid</th>
                  <th className="px-6 py-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-deep/5">
                {loan.schedule.map((r) => (
                  <tr key={r.id}>
                    <td className="tabular px-6 py-3 text-sm">{r.installment_no}</td>
                    <td className="tabular px-6 py-3 text-sm">{r.due_date}</td>
                    <td className="px-6 py-3 text-right"><Money amount={r.principal_due} /></td>
                    <td className="px-6 py-3 text-right"><Money amount={r.interest_due} /></td>
                    <td className="px-6 py-3 text-right"><Money amount={r.total_due} /></td>
                    <td className="px-6 py-3 text-right"><Money amount={r.paid_amount} /></td>
                    <td className="px-6 py-3 text-right"><StatusPill status={r.status as any} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}

function PayoffCard({ loanId }: { loanId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [settleOn, setSettleOn] = useState(today);
  const quote = useQuery({
    queryKey: ["member", "loans", "payoff", loanId, settleOn],
    queryFn: () => getLoanPayoffQuote({ data: { loan_id: loanId, settle_on: settleOn } }),
  });

  return (
    <SectionCard
      title="Early settlement quote"
      action={
        <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/60">
          Settle on
          <input
            type="date"
            value={settleOn}
            min={today}
            onChange={(e) => setSettleOn(e.target.value || today)}
            className="rounded border border-emerald-deep/15 bg-card px-2 py-1 text-xs font-normal normal-case tracking-normal outline-none focus:border-emerald-mid"
          />
        </label>
      }
    >
      {quote.isPending ? (
        <div className="p-6"><Skeleton className="h-32 w-full" /></div>
      ) : quote.isError ? (
        <div className="p-6 text-sm text-emerald-deep/70">
          Settlement quote unavailable: {(quote.error as Error).message}
        </div>
      ) : quote.data ? (
        <div className="grid gap-6 p-6 md:grid-cols-2">
          <div className="space-y-2 text-sm">
            {quote.data.lines.map((line) => (
              <div key={line.label} className="flex items-start justify-between gap-4 border-b border-emerald-deep/5 pb-2">
                <div>
                  <div className="text-emerald-deep/80">{line.label}</div>
                  {line.note && <div className="text-[11px] text-emerald-deep/45">{line.note}</div>}
                </div>
                <Money amount={line.amount} signed={line.amount < 0} />
              </div>
            ))}
            <div className="flex items-center justify-between pt-1 text-base font-bold">
              <span>Total payoff</span>
              <Money amount={quote.data.total_payoff} />
            </div>
          </div>
          <div className="space-y-3 rounded-lg bg-cream/60 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-emerald-deep/60">Savings balance</span>
              <Money amount={quote.data.savings_balance} />
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-deep/60">
                {quote.data.savings_covers_payoff ? "Surplus after settlement" : "Shortfall to fund"}
              </span>
              <Money
                amount={
                  quote.data.savings_covers_payoff
                    ? quote.data.savings_balance - quote.data.total_payoff
                    : quote.data.shortfall
                }
              />
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-deep/60">Installments remaining</span>
              <span>{quote.data.installments_remaining}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-deep/60">Interest saved by settling</span>
              <Money amount={quote.data.interest_rebate} />
            </div>
            <p className="text-[11px] leading-relaxed text-emerald-deep/50">{quote.data.disclaimer}</p>
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}

function RepayCard({ loanId, loanRef, outstanding, suggested }: { loanId: string; loanRef: string; outstanding: number; suggested: number }) {
  const qc = useQueryClient();
  const submit = useServerFn(submitLoanRepayment);
  const [amount, setAmount] = useState<string>(suggested ? suggested.toFixed(2) : "");
  const [channel, setChannel] = useState("bank_transfer");
  const [note, setNote] = useState("");
  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed > 0;
  const mutation = useMutation({
    mutationFn: () => submit({ data: { loan_id: loanId, amount: parsed, channel, note: note.trim() || undefined } }),
    onSuccess: (r) => {
      toast.success("Payment submitted", {
        description: `${r.ref} for ${loanRef} is pending finance reconciliation.`,
      });
      setNote("");
      qc.invalidateQueries({ queryKey: ["member", "loans"] });
      qc.invalidateQueries({ queryKey: ["member", "transactions"] });
    },
    onError: (e: Error) => toast.error("Could not submit payment", { description: e.message }),
  });

  return (
    <SectionCard
      title="Make a repayment"
      action={<span className="text-[11px] text-emerald-deep/50">Outstanding <Money amount={outstanding} /></span>}
    >
      <div className="grid gap-3 p-6 md:grid-cols-[160px_200px_1fr_auto] md:items-end">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-deep/60">Amount (GH₵)</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm outline-none focus:border-emerald-mid"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-deep/60">Payment channel</span>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm outline-none focus:border-emerald-mid"
          >
            <option value="bank_transfer">Bank transfer</option>
            <option value="mobile_money">Mobile money</option>
            <option value="salary_deduction">Salary deduction</option>
            <option value="cash">Cash / branch</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-deep/60">Reference / note (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="MoMo txn ID, teller receipt, etc."
            className="rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm outline-none focus:border-emerald-mid"
          />
        </label>
        <button
          onClick={() => mutation.mutate()}
          disabled={!valid || mutation.isPending}
          className="h-10 rounded bg-emerald-deep px-4 text-xs font-bold uppercase tracking-widest text-cream hover:bg-emerald-mid disabled:opacity-50"
        >
          {mutation.isPending ? "Submitting…" : "Submit payment"}
        </button>
      </div>
      <p className="border-t border-emerald-deep/5 px-6 py-3 text-[11px] text-emerald-deep/50">
        Payments show as pending until a finance officer reconciles the transfer. Your outstanding balance updates once cleared.
      </p>
    </SectionCard>
  );
}
