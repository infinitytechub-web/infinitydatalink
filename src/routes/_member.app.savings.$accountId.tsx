import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { useSuspenseQuery, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDownRight, ArrowUpRight, PiggyBank } from "lucide-react";
import { Money, PageHeader, SectionCard, StatusPill } from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  getMyAccountDetail,
  submitContribution,
  submitWithdrawal,
  type SavingsTxn,
} from "@/lib/savings.functions";
import { formatMoney } from "@/lib/org-config";

const detailQuery = (id: string) =>
  queryOptions({
    queryKey: ["member", "savings", "account", id],
    queryFn: () => getMyAccountDetail({ data: { id } }),
    staleTime: 10_000,
  });

export const Route = createFileRoute("/_member/app/savings/$accountId")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(detailQuery(params.accountId)),
  component: AccountPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Failed to load account: {error.message}</div>
  ),
  notFoundComponent: () => (
    <div className="p-6 text-sm text-emerald-deep/70">
      Account not found.{" "}
      <Link to="/app/savings" className="underline">Back to savings</Link>
    </div>
  ),
});

function AccountPage() {
  const { accountId } = Route.useParams();
  return (
    <>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Body accountId={accountId} />
      </Suspense>
    </>
  );
}

function Body({ accountId }: { accountId: string }) {
  const { data } = useSuspenseQuery(detailQuery(accountId));
  const a = data.account;
  return (
    <>
      <PageHeader
        eyebrow="Savings account"
        title={a.nickname || a.plan_name}
        description={`${a.plan_name} · ${a.plan_schedule} · ${a.plan_interest_rate}% p.a.`}
        actions={
          <div className="flex gap-2">
            <ContributionDialog accountId={a.id} />
            <WithdrawalDialog accountId={a.id} balance={a.balance} />
          </div>
        }
      />
      <div className="space-y-6">
        <SectionCard title="Overview">
          <div className="grid gap-6 p-6 md:grid-cols-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-emerald-deep/40">Current balance</div>
              <div className="mt-1 text-3xl font-semibold tabular text-emerald-deep">
                <Money amount={a.balance} />
              </div>
              <div className="mt-2">
                <StatusPill status={a.status === "active" ? "active" : "closed"} />
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-emerald-deep/40">Goal</div>
              {a.goal_amount ? (
                <>
                  <div className="mt-1 text-lg font-semibold text-emerald-deep tabular">
                    <Money amount={a.goal_amount} />
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-emerald-deep/10">
                    <div className="h-2 rounded-full bg-emerald-mid" style={{ width: `${a.progress_pct ?? 0}%` }} />
                  </div>
                  <div className="mt-1 text-[11px] text-emerald-deep/50">
                    {a.progress_pct ?? 0}% funded
                    {a.goal_target_date ? ` · target ${new Date(a.goal_target_date).toLocaleDateString()}` : ""}
                  </div>
                </>
              ) : (
                <div className="mt-1 text-sm text-emerald-deep/60">No goal set.</div>
              )}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-emerald-deep/40">Opened</div>
              <div className="mt-1 text-sm text-emerald-deep/80">{new Date(a.created_at).toLocaleDateString()}</div>
              <div className="mt-3 flex items-center gap-2 text-[11px] text-emerald-deep/60">
                <PiggyBank className="h-3.5 w-3.5" /> {a.plan_schedule} contributions
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Recent activity">
          {data.transactions.length === 0 ? (
            <div className="p-6 text-sm text-emerald-deep/60">No transactions yet — add your first contribution to get going.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
                  <th className="px-6 py-3 font-medium">Ref</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium">Channel</th>
                  <th className="px-6 py-3 text-right font-medium">Amount</th>
                  <th className="px-6 py-3 text-right font-medium">Status</th>
                  <th className="px-6 py-3 text-right font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-deep/5">
                {data.transactions.map((t) => (
                  <TxnRow key={t.id} t={t} />
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      </div>
    </>
  );
}

function TxnRow({ t }: { t: SavingsTxn }) {
  const isDeposit = t.kind === "deposit";
  const Icon = isDeposit ? ArrowDownRight : ArrowUpRight;
  return (
    <tr>
      <td className="px-6 py-3 font-mono text-[11px] text-emerald-deep/70">{t.ref}</td>
      <td className="px-6 py-3">
        <div className="flex items-center gap-2 text-sm capitalize">
          <Icon className={`h-3.5 w-3.5 ${isDeposit ? "text-emerald-mid" : "text-gold"}`} />
          {t.kind}
        </div>
      </td>
      <td className="px-6 py-3 text-sm text-emerald-deep/60">{t.channel ?? "—"}</td>
      <td className="px-6 py-3 text-right"><Money amount={t.amount} signed={!isDeposit} /></td>
      <td className="px-6 py-3 text-right"><StatusPill status={t.status} /></td>
      <td className="px-6 py-3 text-right text-[11px] text-emerald-deep/50">
        {new Date(t.created_at).toLocaleString()}
      </td>
    </tr>
  );
}

function ContributionDialog({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [channel, setChannel] = useState("mobile_money");
  const [note, setNote] = useState("");
  const qc = useQueryClient();
  const router = useRouter();
  const call = useServerFn(submitContribution);
  const mut = useMutation({
    mutationFn: () => call({ data: { account_id: accountId, amount: Number(amount), channel, note: note || null } }),
    onSuccess: async () => {
      toast.success("Contribution submitted — pending finance approval.");
      setOpen(false);
      setAmount("");
      setNote("");
      await qc.invalidateQueries({ queryKey: ["member", "savings"] });
      router.invalidate();
    },
    onError: (e: Error) => toast.error(errMsg(e.message, "Contribution failed")),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-emerald-deep text-cream hover:bg-emerald-mid">Add contribution</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add contribution</DialogTitle></DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!amount || Number(amount) <= 0) return toast.error("Enter a valid amount");
            mut.mutate();
          }}
        >
          <div>
            <Label htmlFor="c-amt">Amount</Label>
            <Input id="c-amt" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="c-ch">Channel</Label>
            <select
              id="c-ch"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option value="mobile_money">Mobile money</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
            </select>
          </div>
          <div>
            <Label htmlFor="c-note">Note (optional)</Label>
            <Textarea id="c-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={mut.isPending}>{mut.isPending ? "Submitting…" : "Submit"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function WithdrawalDialog({ accountId, balance }: { accountId: string; balance: number }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [channel, setChannel] = useState("mobile_money");
  const [note, setNote] = useState("");
  const qc = useQueryClient();
  const router = useRouter();
  const call = useServerFn(submitWithdrawal);
  const mut = useMutation({
    mutationFn: () => call({ data: { account_id: accountId, amount: Number(amount), channel, note: note || null } }),
    onSuccess: async () => {
      toast.success("Withdrawal requested — pending finance approval.");
      setOpen(false);
      setAmount("");
      setNote("");
      await qc.invalidateQueries({ queryKey: ["member", "savings"] });
      router.invalidate();
    },
    onError: (e: Error) => toast.error(errMsg(e.message, "Withdrawal failed")),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Request withdrawal</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Request withdrawal</DialogTitle></DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(amount);
            if (!amount || n <= 0) return toast.error("Enter a valid amount");
            if (n > balance) return toast.error(`Available balance is ${formatMoney(balance)}`);
            mut.mutate();
          }}
        >
          <div className="rounded border border-emerald-deep/10 bg-cream/40 p-3 text-[11px] text-emerald-deep/70">
            Available balance: <span className="font-semibold tabular"><Money amount={balance} /></span>
          </div>
          <div>
            <Label htmlFor="w-amt">Amount</Label>
            <Input id="w-amt" type="number" min="0" max={balance} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="w-ch">Payout channel</Label>
            <select
              id="w-ch"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option value="mobile_money">Mobile money</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="cash">Cash pickup</option>
            </select>
          </div>
          <div>
            <Label htmlFor="w-note">Reason (optional)</Label>
            <Textarea id="w-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={mut.isPending}>{mut.isPending ? "Submitting…" : "Submit request"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function errMsg(raw: string, fallback: string): string {
  const map: Record<string, string> = {
    kyc_not_approved: "Complete KYC verification before moving money.",
    account_closed: "This account is closed.",
    insufficient_balance: "Requested amount exceeds your available balance.",
    amount_below_minimum: "Amount is below the plan's minimum contribution.",
    invalid_amount: "Enter a valid amount greater than zero.",
  };
  return map[raw] ?? `${fallback}: ${raw}`;
}
