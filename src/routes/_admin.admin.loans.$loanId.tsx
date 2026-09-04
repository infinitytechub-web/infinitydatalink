import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  KPIStat,
  Money,
  PageHeader,
  SectionCard,
  StatusPill,
  EmptyState,
} from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getAdminLoanDetail,
  getLoanScheduleProjection,
  disburseLoan,
  recordLoanRepayment,
  type LoanDetail,
} from "@/lib/admin-loans.functions";

export const Route = createFileRoute("/_admin/admin/loans/$loanId")({
  component: AdminLoanDetail,
});

const detailQuery = (loan_id: string) =>
  queryOptions({
    queryKey: ["admin", "loans", "detail", loan_id],
    queryFn: () => getAdminLoanDetail({ data: { loan_id } }),
  });

function AdminLoanDetail() {
  const { loanId } = Route.useParams();
  return (
    <>
      <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        <Link to="/admin/loans" className="hover:underline">
          ← Loans pipeline
        </Link>
      </div>
      <PageHeader
        eyebrow="Administrator"
        title="Loan detail"
        description="Approve, disburse, and record repayments against the amortization schedule."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <DetailBody loanId={loanId} />
      </Suspense>
    </>
  );
}

function DetailBody({ loanId }: { loanId: string }) {
  const { data: loan } = useSuspenseQuery(detailQuery(loanId));
  const paidCount = loan.schedule.filter((r) => r.status === "paid").length;

  return (
    <>
      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat label="Principal" value={<Money amount={loan.amount} />} />
        <KPIStat label="Outstanding" value={<Money amount={loan.outstanding_principal} />} />
        <KPIStat
          label="Monthly payment"
          value={loan.monthly_payment != null ? <Money amount={loan.monthly_payment} /> : "—"}
        />
        <KPIStat label="Paid installments" value={`${paidCount} / ${loan.term_months}`} />
      </section>

      <SectionCard
        title={`${loan.ref} · ${loan.product}`}
        action={<StatusPill status={loan.status} />}
      >
        <div className="grid gap-6 p-6 md:grid-cols-2 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Member
            </div>
            <div className="font-medium">{loan.member_name ?? "—"}</div>
            <div className="tabular text-[11px] text-muted-foreground">
              {loan.member_no ?? loan.user_id.slice(0, 8)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Terms</div>
            <div>
              {loan.term_months} months · {loan.interest_rate}% p.a.
            </div>
            <div className="text-[11px] text-muted-foreground">
              First due {loan.first_payment_at ?? "—"} · Matures {loan.maturity_at ?? "—"}
            </div>
          </div>
          {loan.purpose && (
            <div className="md:col-span-2">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Purpose
              </div>
              <div className="text-muted-foreground">{loan.purpose}</div>
            </div>
          )}
          {loan.decision_note && (
            <div className="md:col-span-2">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Decision note
              </div>
              <div className="text-muted-foreground">{loan.decision_note}</div>
            </div>
          )}
        </div>
      </SectionCard>

      {loan.status === "approved" && <DisburseCard loanId={loan.id} loanRef={loan.ref} />}
      {loan.status === "active" && (
        <RepaymentCard
          loanId={loan.id}
          outstanding={loan.outstanding_principal}
          monthly={loan.monthly_payment ?? 0}
        />
      )}

      {loan.status === "approved" && (
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <ProjectedSchedule loanId={loan.id} />
        </Suspense>
      )}

      <SectionCard title="Repayment schedule">
        {loan.schedule.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No schedule yet"
              hint="The binding schedule is written at disbursement — the projection above shows the interest-bearing plan."
            />
          </div>
        ) : (
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
                  <td className="px-6 py-3 text-right">
                    <Money amount={r.principal_due} />
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Money amount={r.interest_due} />
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Money amount={r.total_due} />
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Money amount={r.paid_amount} />
                  </td>
                  <td className="px-6 py-3 text-right">
                    <StatusPill status={r.status as any} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </>
  );
}

function DisburseCard({ loanId, loanRef }: { loanId: string; loanRef: string }) {
  const qc = useQueryClient();
  const disburse = useServerFn(disburseLoan);
  const [channel, setChannel] = useState("bank_transfer");
  const [note, setNote] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      disburse({ data: { loan_id: loanId, channel, note: note.trim() || undefined } }),
    onSuccess: () => {
      toast.success("Loan disbursed", {
        description: `Reference ${loanRef} · schedule generated.`,
      });
      qc.invalidateQueries({ queryKey: ["admin", "loans"] });
    },
    onError: (e: Error) => toast.error("Disbursement failed", { description: e.message }),
  });

  return (
    <SectionCard title="Disburse">
      <div className="grid gap-3 p-6 md:grid-cols-[220px_1fr_auto] md:items-end">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Channel
          </span>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm outline-none focus:border-emerald-mid"
          >
            <option value="bank_transfer">Bank transfer</option>
            <option value="mobile_money">Mobile money</option>
            <option value="cheque">Cheque</option>
            <option value="cash">Cash</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Note (optional)
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ref, account, etc."
            className="rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm outline-none focus:border-emerald-mid"
          />
        </label>
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="h-10 rounded bg-emerald-deep px-4 text-xs font-bold uppercase tracking-widest text-cream hover:bg-emerald-mid disabled:opacity-50"
        >
          {mutation.isPending ? "Disbursing…" : "Disburse loan"}
        </button>
      </div>
    </SectionCard>
  );
}

function RepaymentCard({
  loanId,
  outstanding,
  monthly,
}: {
  loanId: string;
  outstanding: number;
  monthly: number;
}) {
  const qc = useQueryClient();
  const record = useServerFn(recordLoanRepayment);
  const [amount, setAmount] = useState<string>(monthly ? monthly.toFixed(2) : "");
  const [channel, setChannel] = useState("bank_transfer");
  const [note, setNote] = useState("");
  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed > 0;
  const mutation = useMutation({
    mutationFn: () =>
      record({
        data: { loan_id: loanId, amount: parsed, channel, note: note.trim() || undefined },
      }),
    onSuccess: (l: any) => {
      toast.success("Repayment recorded", {
        description:
          l?.status === "closed"
            ? "Loan fully repaid — status set to CLOSED."
            : `Outstanding now GH₵ ${Number(l?.outstanding_principal ?? 0).toFixed(2)}.`,
      });
      qc.invalidateQueries({ queryKey: ["admin", "loans"] });
      setNote("");
    },
    onError: (e: Error) => toast.error("Repayment failed", { description: e.message }),
  });

  return (
    <SectionCard
      title="Record repayment"
      action={
        <span className="text-[11px] text-muted-foreground">
          Outstanding <Money amount={outstanding} />
        </span>
      }
    >
      <div className="grid gap-3 p-6 md:grid-cols-[160px_180px_1fr_auto] md:items-end">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Amount (GH₵)
          </span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm outline-none focus:border-emerald-mid"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Channel
          </span>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm outline-none focus:border-emerald-mid"
          >
            <option value="bank_transfer">Bank transfer</option>
            <option value="mobile_money">Mobile money</option>
            <option value="salary_deduction">Salary deduction</option>
            <option value="cash">Cash</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Note (optional)
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Receipt no., remarks…"
            className="rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm outline-none focus:border-emerald-mid"
          />
        </label>
        <button
          onClick={() => mutation.mutate()}
          disabled={!valid || mutation.isPending}
          className="h-10 rounded bg-emerald-deep px-4 text-xs font-bold uppercase tracking-widest text-cream hover:bg-emerald-mid disabled:opacity-50"
        >
          {mutation.isPending ? "Recording…" : "Record payment"}
        </button>
      </div>
    </SectionCard>
  );
}

/** Interest-bearing settlement plan for an approved (not yet disbursed) loan. */
function ProjectedSchedule({ loanId }: { loanId: string }) {
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["admin", "loans", "projection", loanId],
      queryFn: () => getLoanScheduleProjection({ data: { loan_id: loanId } }),
    }),
  );
  return (
    <SectionCard title="Projected repayment schedule (pre-disbursement)">
      <div className="grid gap-6 p-6 md:grid-cols-3 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Monthly instalment
          </div>
          <Money amount={data.installment} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Total interest
          </div>
          <Money amount={data.totalInterest} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Total repayable
          </div>
          <Money amount={data.totalRepayment} />
        </div>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
            <th className="px-6 py-3 font-medium">#</th>
            <th className="px-6 py-3 font-medium">Due date</th>
            <th className="px-6 py-3 text-right font-medium">Principal</th>
            <th className="px-6 py-3 text-right font-medium">Interest</th>
            <th className="px-6 py-3 text-right font-medium">Payment</th>
            <th className="px-6 py-3 text-right font-medium">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-emerald-deep/5">
          {data.schedule.map((r) => (
            <tr key={r.period}>
              <td className="tabular px-6 py-3 text-sm">{r.period}</td>
              <td className="tabular px-6 py-3 text-sm">{r.dueDate}</td>
              <td className="px-6 py-3 text-right">
                <Money amount={r.principal} />
              </td>
              <td className="px-6 py-3 text-right">
                <Money amount={r.interest} />
              </td>
              <td className="px-6 py-3 text-right">
                <Money amount={r.payment} />
              </td>
              <td className="px-6 py-3 text-right">
                <Money amount={r.balance} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionCard>
  );
}
