import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, TimerReset } from "lucide-react";
import {
  EmptyState,
  ErrorState,
  KPIStat,
  Money,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
  StatusPill,
} from "@/components/primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listMyAccounts } from "@/lib/savings.functions";
import {
  breakFixedDeposit,
  listFixedDepositProducts,
  listMyFixedDeposits,
  openFixedDeposit,
  type FixedDeposit,
  type FixedDepositProduct,
} from "@/lib/savings-modules.functions";

const productsQuery = queryOptions({
  queryKey: ["member", "fd", "products"],
  queryFn: () => listFixedDepositProducts(),
  staleTime: 60_000,
});
const depositsQuery = queryOptions({
  queryKey: ["member", "fd", "list"],
  queryFn: () => listMyFixedDeposits(),
  staleTime: 15_000,
});
const accountsQuery = queryOptions({
  queryKey: ["member", "savings", "accounts"],
  queryFn: () => listMyAccounts(),
  staleTime: 15_000,
});

export const Route = createFileRoute("/_member/app/savings/fixed")({
  head: () => ({
    meta: [
      { title: "Fixed deposits — IT-360 CashApp" },
      {
        name: "description",
        content:
          "Lock savings into term deposits with fixed rates, maturity dates and rollover options.",
      },
      { property: "og:title", content: "Fixed deposits — IT-360 CashApp" },
      {
        property: "og:description",
        content: "Term savings with fixed rates and maturity scheduling.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(productsQuery),
      context.queryClient.ensureQueryData(depositsQuery),
    ]),
  component: FixedDepositsPage,
  errorComponent: ({ error }) => (
    <div className="p-6">
      <ErrorState title="Fixed deposits unavailable" message={(error as Error).message} />
    </div>
  ),
});

function FixedDepositsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Member portal"
        title="Fixed deposits"
        description="Lock funds for a fixed term at a guaranteed rate. Breaking early applies a penalty on accrued interest."
        action={
          <Link
            to="/app/savings"
            className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted"
          >
            Back to savings
          </Link>
        }
      />
      <Suspense fallback={<SectionCardSkeleton title="Fixed deposits" rows={4} cols={5} />}>
        <Body />
      </Suspense>
    </>
  );
}

function Body() {
  const { data: products } = useSuspenseQuery(productsQuery);
  const { data: deposits } = useSuspenseQuery(depositsQuery);
  const { data: accounts } = useSuspenseQuery(accountsQuery);
  const [openFor, setOpenFor] = useState<FixedDepositProduct | null>(null);
  const [breakFor, setBreakFor] = useState<FixedDeposit | null>(null);

  const active = deposits.filter((d) => d.status === "active");
  const locked = active.reduce((s, d) => s + d.principal, 0);
  const projected = active.reduce((s, d) => s + d.interest_expected, 0);

  return (
    <div className="space-y-6">
      <section className="grid gap-6 md:grid-cols-3">
        <KPIStat
          label="Locked principal"
          value={<Money amount={locked} />}
          hint={`${active.length} active deposits`}
        />
        <KPIStat label="Projected interest" value={<Money amount={projected} />} accent />
        <KPIStat
          label="Next maturity"
          value={
            <span className="text-base font-semibold">
              {active.length
                ? new Date(
                    active.map((d) => d.maturity_date).sort()[0] as string,
                  ).toLocaleDateString()
                : "—"}
            </span>
          }
        />
      </section>

      <SectionCard title="Available term products">
        <div className="grid gap-4 p-6 md:grid-cols-3">
          {products.map((p) => (
            <div key={p.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">{p.name}</h3>
                <span className="rounded-full bg-emerald-deep/10 px-2 py-0.5 text-xs font-semibold text-emerald-deep">
                  {p.rate_annual}% p.a.
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{p.description}</p>
              <dl className="mt-4 space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <dt>Term</dt>
                  <dd className="tabular text-foreground">{p.term_months} months</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Minimum</dt>
                  <dd className="tabular text-foreground">
                    <Money amount={p.min_amount} />
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Early-break penalty</dt>
                  <dd className="tabular text-foreground">{p.early_break_penalty_pct}%</dd>
                </div>
              </dl>
              <Button
                className="mt-4 w-full"
                size="sm"
                onClick={() => setOpenFor(p)}
                disabled={accounts.length === 0}
              >
                <Lock className="mr-1 h-3.5 w-3.5" /> Open deposit
              </Button>
            </div>
          ))}
          {products.length === 0 && <EmptyState title="No term products available" />}
        </div>
      </SectionCard>

      <SectionCard title="My deposits">
        {deposits.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No fixed deposits yet"
              hint="Choose a term product above to lock in a rate."
            />
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-6 py-3 font-medium">Reference</th>
                <th className="px-6 py-3 font-medium">Product</th>
                <th className="px-6 py-3 text-right font-medium">Principal</th>
                <th className="px-6 py-3 text-right font-medium">Interest</th>
                <th className="px-6 py-3 font-medium">Maturity</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {deposits.map((d) => (
                <tr key={d.id} className="border-b border-border/60 text-sm">
                  <td className="px-6 py-3 font-mono text-xs">{d.ref}</td>
                  <td className="px-6 py-3">{d.product_name}</td>
                  <td className="px-6 py-3 text-right tabular">
                    <Money amount={d.principal} />
                  </td>
                  <td className="px-6 py-3 text-right tabular">
                    <Money amount={d.status === "active" ? d.interest_expected : d.interest_paid} />
                  </td>
                  <td className="px-6 py-3 text-xs">
                    {new Date(d.maturity_date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-3">
                    <StatusPill
                      status={
                        d.status === "active"
                          ? "active"
                          : d.status === "broken"
                            ? "rejected"
                            : d.status === "matured"
                              ? "approved"
                              : "closed"
                      }
                    />
                  </td>
                  <td className="px-6 py-3 text-right">
                    {d.status === "active" && (
                      <Button size="sm" variant="outline" onClick={() => setBreakFor(d)}>
                        <TimerReset className="mr-1 h-3.5 w-3.5" /> Break early
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {openFor && (
        <OpenDialog product={openFor} accounts={accounts} onClose={() => setOpenFor(null)} />
      )}
      {breakFor && <BreakDialog deposit={breakFor} onClose={() => setBreakFor(null)} />}
    </div>
  );
}

function OpenDialog({
  product,
  accounts,
  onClose,
}: {
  product: FixedDepositProduct;
  accounts: Array<{ id: string; nickname: string | null; plan_name: string; balance: number }>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState(String(product.min_amount));
  const [rollover, setRollover] = useState<"none" | "principal" | "principal_interest">("none");

  const mutation = useMutation({
    mutationFn: () =>
      openFixedDeposit({
        data: { account_id: accountId, product_id: product.id, amount: Number(amount), rollover },
      }),
    onSuccess: () => {
      toast.success("Fixed deposit opened");
      qc.invalidateQueries({ queryKey: ["member"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const projected =
    (Number(amount) || 0) * (product.rate_annual / 100) * (product.term_months / 12);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open {product.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fd-account">Fund from account</Label>
            <select
              id="fd-account"
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nickname || a.plan_name} — {a.balance.toFixed(2)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fd-amount">Amount</Label>
            <Input
              id="fd-amount"
              type="number"
              min={product.min_amount}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Minimum {product.min_amount}. Projected interest at maturity: {projected.toFixed(2)}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fd-rollover">At maturity</Label>
            <select
              id="fd-rollover"
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              value={rollover}
              onChange={(e) => setRollover(e.target.value as typeof rollover)}
            >
              <option value="none">Pay out principal + interest</option>
              <option value="principal">Roll over principal, pay interest</option>
              <option value="principal_interest">Roll over principal + interest</option>
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !accountId || Number(amount) < product.min_amount}
          >
            {mutation.isPending ? "Opening…" : "Confirm deposit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BreakDialog({ deposit, onClose }: { deposit: FixedDeposit; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () => breakFixedDeposit({ data: { id: deposit.id, reason } }),
    onSuccess: (r) => {
      toast.success(`Deposit broken — penalty ${r.penalty_amount.toFixed(2)} applied`);
      qc.invalidateQueries({ queryKey: ["member"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Break {deposit.ref} early</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Breaking before {new Date(deposit.maturity_date).toLocaleDateString()} forfeits part of
          the accrued interest. The principal returns to your savings account immediately.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="fd-reason">Reason (required)</Label>
          <Textarea
            id="fd-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Keep deposit
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || reason.trim().length < 5}
          >
            {mutation.isPending ? "Processing…" : "Break deposit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
