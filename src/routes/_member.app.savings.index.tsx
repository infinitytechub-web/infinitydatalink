import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import {
  useSuspenseQuery,
  queryOptions,
  useMutation,
  useQueryClient,
  useQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PiggyBank, Plus, TrendingUp, Zap } from "lucide-react";
import {
  EmptyState,
  KPIStat,
  Money,
  PageHeader,
  SectionCard,
  StatusPill,
} from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  listMyAccounts,
  submitContribution,
  type SavingsAccount,
} from "@/lib/savings.functions";
import { getMyTransactions } from "@/lib/member-data.functions";

const accountsQuery = queryOptions({
  queryKey: ["member", "savings", "accounts"],
  queryFn: () => listMyAccounts(),
  staleTime: 15_000,
});

const recentTxnsQuery = queryOptions({
  queryKey: ["member", "savings", "recent"],
  queryFn: () => getMyTransactions({ data: { page: 1, pageSize: 25 } }),
  staleTime: 15_000,
});

export const Route = createFileRoute("/_member/app/savings/")({
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(accountsQuery);
    context.queryClient.prefetchQuery(recentTxnsQuery);
  },
  component: SavingsPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Failed to load savings: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm text-emerald-deep/70">Not found.</div>,
});

function SavingsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Member portal"
        title="My Savings"
        description="Track balances, goal progress and contributions across every plan you're enrolled in."
        action={
          <Link
            to="/app/savings/enroll"
            className="inline-flex items-center gap-2 rounded bg-emerald-deep px-4 py-2 text-xs font-semibold uppercase tracking-widest text-cream hover:bg-emerald-mid"
          >
            <Plus className="h-4 w-4" /> Enroll in plan
          </Link>
        }
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <Body />
      </Suspense>
    </>
  );
}

function Body() {
  const { data: accounts } = useSuspenseQuery(accountsQuery);
  const recent = useQuery(recentTxnsQuery);
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  const active = accounts.filter((a) => a.status === "active");
  const recentRows = recent.data && "rows" in recent.data ? recent.data.rows : [];
  const clearedDeposits = recentRows.filter(
    (t) => t.kind === "deposit" && t.status === "cleared",
  );
  const lifetime = clearedDeposits.reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const pendingDeposits = recentRows.filter(
    (t) => t.kind === "deposit" && t.status === "pending",
  );

  return (
    <div className="space-y-6">
      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat label="Total balance" value={<Money amount={total} />} hint={`${active.length} active plan(s)`} />
        <KPIStat
          label="Lifetime contributions"
          value={<Money amount={lifetime} />}
          hint={`${clearedDeposits.length} cleared`}
        />
        <KPIStat
          label="Pending contributions"
          value={<span className="tabular">{pendingDeposits.length}</span>}
          hint="Awaiting settlement"
          accent
        />
        <KPIStat
          label="With savings goal"
          value={<span className="tabular">{active.filter((a) => a.goal_amount).length}</span>}
        />
      </section>

      {accounts.length === 0 ? (
        <SectionCard title="Get started">
          <div className="p-6">
            <EmptyState title="No savings plans yet" hint="Pick a plan to start contributing and building interest." />
            <div className="mt-4">
              <Link
                to="/app/savings/enroll"
                className="inline-flex items-center gap-2 rounded bg-emerald-deep px-4 py-2 text-xs font-semibold uppercase tracking-widest text-cream hover:bg-emerald-mid"
              >
                <Plus className="h-4 w-4" /> Browse plans
              </Link>
            </div>
          </div>
        </SectionCard>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {accounts.map((a) => (
              <AccountCard key={a.id} a={a} />
            ))}
          </div>

          <SectionCard title="Contribution history">
            {recent.isLoading ? (
              <div className="p-6"><Skeleton className="h-40 w-full" /></div>
            ) : clearedDeposits.length === 0 && pendingDeposits.length === 0 ? (
              <div className="p-6"><EmptyState title="No contributions yet" hint="Use Quick deposit on any account to get started." /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
                      <th className="px-6 py-3 font-medium">Date</th>
                      <th className="px-6 py-3 font-medium">Ref</th>
                      <th className="px-6 py-3 font-medium">Channel</th>
                      <th className="px-6 py-3 text-right font-medium">Amount</th>
                      <th className="px-6 py-3 text-right font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-deep/5">
                    {[...pendingDeposits, ...clearedDeposits]
                      .slice(0, 15)
                      .map((t: any) => (
                        <tr key={t.id}>
                          <td className="px-6 py-3 text-[11px] text-emerald-deep/60">
                            {new Date(t.created_at).toLocaleString()}
                          </td>
                          <td className="px-6 py-3 font-mono text-[11px] text-emerald-deep/70">{t.ref}</td>
                          <td className="px-6 py-3 text-emerald-deep/60">{t.channel ?? "—"}</td>
                          <td className="px-6 py-3 text-right"><Money amount={Number(t.amount)} /></td>
                          <td className="px-6 py-3 text-right"><StatusPill status={t.status} /></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}

function AccountCard({ a }: { a: SavingsAccount }) {
  return (
    <div className="group rounded-lg border border-emerald-deep/10 bg-card p-5 transition hover:border-emerald-mid/40 hover:shadow-sm">
      <Link
        to="/app/savings/$accountId"
        params={{ accountId: a.id }}
        className="block"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/40">
              <PiggyBank className="h-3.5 w-3.5" /> {a.plan_schedule}
            </div>
            <div className="mt-1 text-lg font-semibold text-emerald-deep">
              {a.nickname || a.plan_name}
            </div>
            {a.nickname ? <div className="text-[11px] text-emerald-deep/50">{a.plan_name}</div> : null}
          </div>
          <StatusPill status={a.status === "active" ? "active" : "closed"} />
        </div>
        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-emerald-deep/40">Balance</div>
            <div className="text-2xl font-semibold tabular text-emerald-deep">
              <Money amount={a.balance} />
            </div>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-emerald-mid">
            <TrendingUp className="h-3.5 w-3.5" /> {a.plan_interest_rate}% p.a.
          </div>
        </div>
        {a.goal_amount ? (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-emerald-deep/40">
              <span>Goal progress</span>
              <span>{a.progress_pct ?? 0}%</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-emerald-deep/10">
              <div
                className="h-1.5 rounded-full bg-emerald-mid transition-all"
                style={{ width: `${a.progress_pct ?? 0}%` }}
              />
            </div>
            <div className="mt-1 text-[11px] text-emerald-deep/50">
              <Money amount={a.balance} /> of <Money amount={a.goal_amount} />
              {a.goal_target_date ? ` · by ${new Date(a.goal_target_date).toLocaleDateString()}` : ""}
            </div>
          </div>
        ) : null}
      </Link>
      {a.status === "active" ? (
        <div className="mt-4 flex items-center gap-2 border-t border-emerald-deep/5 pt-4">
          <QuickDepositButton accountId={a.id} accountLabel={a.nickname || a.plan_name} />
          <Link
            to="/app/savings/$accountId"
            params={{ accountId: a.id }}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            View activity
          </Link>
        </div>
      ) : null}
    </div>
  );
}

const QUICK_AMOUNTS = [50, 100, 250, 500];

function QuickDepositButton({ accountId, accountLabel }: { accountId: string; accountLabel: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [channel, setChannel] = useState("mobile_money");
  const [note, setNote] = useState("");
  const qc = useQueryClient();
  const router = useRouter();
  const call = useServerFn(submitContribution);
  const mut = useMutation({
    mutationFn: () =>
      call({ data: { account_id: accountId, amount: Number(amount), channel, note: note || null } }),
    onSuccess: async () => {
      toast.success("Contribution submitted — pending finance approval.");
      setOpen(false);
      setAmount("");
      setNote("");
      await qc.invalidateQueries({ queryKey: ["member", "savings"] });
      router.invalidate();
    },
    onError: (e: Error) => toast.error(mapErr(e.message)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        size="sm"
        className="gap-1 bg-emerald-deep text-cream hover:bg-emerald-mid"
        onClick={() => setOpen(true)}
      >
        <Zap className="h-3.5 w-3.5" /> Quick deposit
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quick deposit — {accountLabel}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!amount || Number(amount) <= 0) return toast.error("Enter a valid amount");
            mut.mutate();
          }}
        >
          <div>
            <Label className="mb-2 block">Quick amounts</Label>
            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmount(String(v))}
                  className={
                    "rounded-md border px-3 py-1.5 text-xs font-medium transition " +
                    (Number(amount) === v
                      ? "border-emerald-mid bg-emerald-mid/10 text-emerald-deep"
                      : "border-border bg-background hover:bg-muted")
                  }
                >
                  <Money amount={v} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="qd-amt">Amount</Label>
            <Input
              id="qd-amt"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="qd-ch">Channel</Label>
            <select
              id="qd-ch"
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
            <Label htmlFor="qd-note">Note (optional)</Label>
            <Textarea id="qd-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={mut.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending ? "Submitting…" : "Submit deposit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function mapErr(raw: string): string {
  const map: Record<string, string> = {
    kyc_not_approved: "Complete KYC verification before moving money.",
    account_closed: "This account is closed.",
    amount_below_minimum: "Amount is below the plan's minimum contribution.",
    invalid_amount: "Enter a valid amount greater than zero.",
  };
  return map[raw] ?? `Contribution failed: ${raw}`;
}
