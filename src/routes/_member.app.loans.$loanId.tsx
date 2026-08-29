import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { EmptyState, KPIStat, Money, PageHeader, SectionCard, StatusPill } from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { getMyLoanDetail, submitLoanRepayment } from "@/lib/member-data.functions";
import { getLoanPayoffQuote } from "@/lib/loan-payoff.functions";
import {
  cancelSettlementRequest,
  listMySettlementRequests,
  requestLoanSettlement,
} from "@/lib/loan-settlements.functions";

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
      <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
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
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Terms</div>
            <div>{loan.term_months} months · {loan.interest_rate}% p.a.</div>
            <div className="text-[11px] text-muted-foreground">
              First due {loan.first_payment_at ?? "—"} · Matures {loan.maturity_at ?? "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Timeline</div>
            <div className="text-[11px] text-muted-foreground">
              Applied {new Date(loan.created_at).toLocaleDateString()}
              {loan.decided_at ? ` · Decided ${new Date(loan.decided_at).toLocaleDateString()}` : ""}
              {loan.disbursed_at ? ` · Disbursed ${new Date(loan.disbursed_at).toLocaleDateString()}` : ""}
            </div>
          </div>
          {loan.purpose && (
            <div className="md:col-span-2">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Purpose</div>
              <div className="text-muted-foreground">{loan.purpose}</div>
            </div>
          )}
          {loan.decision_note && (
            <div className="md:col-span-2">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Officer note</div>
              <div className="text-muted-foreground">{loan.decision_note}</div>
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
          <div className="p-6 text-sm text-muted-foreground">
            Your loan has been approved. Repayment options unlock once finance disburses the funds.
          </div>
        </SectionCard>
      )}
      {loan.status === "pending" && (
        <SectionCard title="Application under review">
          <div className="p-6 text-sm text-muted-foreground">
            A loan officer is reviewing your application. You will be notified of the decision.
          </div>
        </SectionCard>
      )}
      {loan.status === "rejected" && (
        <SectionCard title="Application declined">
          <div className="p-6 text-sm text-muted-foreground">
            This application was declined{loan.decision_note ? `: ${loan.decision_note}` : "."}
          </div>
        </SectionCard>
      )}
      {loan.status === "closed" && (
        <SectionCard title="Loan closed">
          <div className="p-6 text-sm text-muted-foreground">This loan has been fully repaid. Thank you.</div>
        </SectionCard>
      )}

      <SectionCard title="Repayment schedule">
        {loan.schedule.length === 0 ? (
          <div className="p-6"><EmptyState title="No schedule yet" hint="A schedule is generated when your loan is disbursed." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
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
  const [memberNote, setMemberNote] = useState("");
  const qc = useQueryClient();
  const quote = useQuery({
    queryKey: ["member", "loans", "payoff", loanId, settleOn],
    queryFn: () => getLoanPayoffQuote({ data: { loan_id: loanId, settle_on: settleOn } }),
  });
  const requests = useQuery({
    queryKey: ["member", "loans", "settlement-requests", loanId],
    queryFn: () => listMySettlementRequests({ data: { loan_id: loanId } }),
  });
  const submitRequest = useServerFn(requestLoanSettlement);
  const cancelRequest = useServerFn(cancelSettlementRequest);
  const pendingRequest = (requests.data ?? []).find((r) => r.status === "pending");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["member", "loans", "settlement-requests", loanId] });
  };

  const request = useMutation({
    mutationFn: () =>
      submitRequest({
        data: { loan_id: loanId, settle_on: settleOn, note: memberNote.trim() || undefined },
      }),
    onSuccess: () => {
      toast.success("Settlement request submitted", {
        description: "A finance officer will review it and you will be notified of the decision.",
      });
      setMemberNote("");
      invalidate();
    },
    onError: (e: Error) => toast.error("Could not submit request", { description: e.message }),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelRequest({ data: { request_id: id } }),
    onSuccess: () => {
      toast.success("Settlement request withdrawn");
      invalidate();
    },
    onError: (e: Error) => toast.error("Could not withdraw request", { description: e.message }),
  });


  return (
    <SectionCard
      title="Early settlement quote"
      action={
        <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
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
        <div className="p-6 text-sm text-muted-foreground">
          Settlement quote unavailable: {(quote.error as Error).message}
        </div>
      ) : quote.data ? (
        <div className="grid gap-6 p-6 md:grid-cols-2">
          <div className="space-y-2 text-sm">
            {quote.data.lines.map((line) => (
              <div key={line.label} className="flex items-start justify-between gap-4 border-b border-emerald-deep/5 pb-2">
                <div>
                  <div className="text-muted-foreground">{line.label}</div>
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
              <span className="text-muted-foreground">Savings balance</span>
              <Money amount={quote.data.savings_balance} />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
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
              <span className="text-muted-foreground">Installments remaining</span>
              <span>{quote.data.installments_remaining}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Interest saved by settling</span>
              <Money amount={quote.data.interest_rebate} />
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{quote.data.disclaimer}</p>
          </div>
        </div>
      ) : null}

      {quote.data && (
        <div className="border-t border-emerald-deep/10 p-6">
          {pendingRequest ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-cream/60 p-4 text-sm">
              <div>
                <div className="font-semibold text-emerald-deep">Settlement request awaiting approval</div>
                <div className="text-[11px] text-muted-foreground">
                  <Money amount={pendingRequest.quoted_total} /> to settle on {pendingRequest.settle_on} · submitted{" "}
                  {new Date(pendingRequest.requested_at).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={() => cancel.mutate(pendingRequest.id)}
                disabled={cancel.isPending}
                className="h-9 rounded border border-emerald-deep/20 px-4 text-[11px] font-bold uppercase tracking-widest text-emerald-deep hover:bg-emerald-deep/5 disabled:opacity-50"
              >
                {cancel.isPending ? "Withdrawing…" : "Withdraw request"}
              </button>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Request early settlement — note to finance (optional)
                </span>
                <input
                  value={memberNote}
                  onChange={(e) => setMemberNote(e.target.value)}
                  placeholder="e.g. settling from my savings on payday"
                  className="rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm outline-none focus:border-emerald-mid"
                />
              </label>
              <button
                onClick={() => request.mutate()}
                disabled={request.isPending}
                className="h-10 rounded bg-emerald-deep px-4 text-xs font-bold uppercase tracking-widest text-cream hover:bg-emerald-mid disabled:opacity-50"
              >
                {request.isPending ? "Submitting…" : "Request settlement"}
              </button>
              <p className="text-[11px] text-muted-foreground md:col-span-2">
                Submitting sends the quoted figure for {settleOn} to the finance office for approval. You will be
                notified once it is approved or declined.
              </p>
            </div>
          )}

          {(requests.data ?? []).filter((r) => r.status !== "pending").length > 0 && (
            <div className="mt-5 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Previous settlement requests
              </div>
              {(requests.data ?? [])
                .filter((r) => r.status !== "pending")
                .map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <StatusPill status={r.status === "approved" ? "approved" : "rejected"} />
                    <span>{r.status}</span>
                    <span>·</span>
                    <span>
                      <Money amount={r.quoted_total} /> for {r.settle_on}
                    </span>
                    {r.decision_note && <span className="text-muted-foreground">“{r.decision_note}”</span>}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
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
      action={<span className="text-[11px] text-muted-foreground">Outstanding <Money amount={outstanding} /></span>}
    >
      <div className="grid gap-3 p-6 md:grid-cols-[160px_200px_1fr_auto] md:items-end">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Amount (GH₵)</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm outline-none focus:border-emerald-mid"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Payment channel</span>
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
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Reference / note (optional)</span>
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
      <p className="border-t border-emerald-deep/5 px-6 py-3 text-[11px] text-muted-foreground">
        Payments show as pending until a finance officer reconciles the transfer. Your outstanding balance updates once cleared.
      </p>
    </SectionCard>
  );
}
