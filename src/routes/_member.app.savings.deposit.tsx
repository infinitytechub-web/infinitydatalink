import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Suspense, useMemo, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, BadgeCheck, Banknote, CheckCircle2, Receipt, Wallet } from "lucide-react";
import { EmptyState, Money, PageHeader, SectionCard, StatusPill } from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  listMyAccounts,
  submitContribution,
  type DepositReceipt,
  type SavingsAccount,
} from "@/lib/savings.functions";

const SearchSchema = z.object({
  account: z.string().max(64).optional().catch(undefined),
});

const accountsQuery = queryOptions({
  queryKey: ["member", "savings", "accounts"],
  queryFn: () => listMyAccounts(),
  staleTime: 15_000,
});

export const Route = createFileRoute("/_member/app/savings/deposit")({
  head: () => ({
    meta: [
      { title: "Top up savings — IT-360 CashApp" },
      {
        name: "description",
        content:
          "Fund a savings account by mobile money, bank transfer, card, or cash. Every top-up is posted to your transaction ledger.",
      },
      { property: "og:title", content: "Top up savings — IT-360 CashApp" },
      {
        property: "og:description",
        content: "Deposit into any savings plan and track the ledger entry instantly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s) => SearchSchema.parse(s),
  loader: ({ context }) => context.queryClient.ensureQueryData(accountsQuery),
  component: DepositPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Failed to load deposit flow: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm text-muted-foreground">Not found.</div>,
});

function DepositPage() {
  return (
    <>
      <PageHeader
        eyebrow="Member portal"
        title="Top up savings"
        description="Fund any active savings plan. Deposits post to your ledger immediately and clear once finance confirms the payment."
        action={
          <Link
            to="/app/savings"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" /> Back to savings
          </Link>
        }
      />
      <Suspense fallback={<Skeleton className="m-6 h-72" />}>
        <Body />
      </Suspense>
    </>
  );
}

const CHANNELS = [
  { value: "mobile_money", label: "Mobile money", hint: "MoMo / wallet push" },
  { value: "bank_transfer", label: "Bank transfer", hint: "Direct bank credit" },
  { value: "card", label: "Card", hint: "Debit or credit card" },
  { value: "cash", label: "Cash", hint: "Paid at a branch desk" },
];

const PRESETS = [50, 100, 250, 500, 1000];

function Body() {
  const { data: accounts } = useSuspenseQuery(accountsQuery);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const qc = useQueryClient();

  const active = useMemo(() => accounts.filter((a) => a.status === "active"), [accounts]);
  const [accountId, setAccountId] = useState<string>(() => search.account ?? active[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [channel, setChannel] = useState("mobile_money");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [step, setStep] = useState<"form" | "review">("form");
  const [receipt, setReceipt] = useState<DepositReceipt | null>(null);

  const account = active.find((a) => a.id === accountId);
  const numeric = Number(amount);
  const min = account?.plan_min_contribution ?? 0;

  const call = useServerFn(submitContribution);
  const mut = useMutation({
    mutationFn: () =>
      call({
        data: {
          account_id: accountId,
          amount: numeric,
          channel,
          note:
            [reference.trim() ? `Ref: ${reference.trim()}` : "", note.trim()]
              .filter(Boolean)
              .join(" · ") || null,
        },
      }),
    onSuccess: async (r) => {
      setReceipt(r);
      setStep("form");
      setAmount("");
      setReference("");
      setNote("");
      toast.success(`Deposit ${r.ref} recorded in your ledger.`);
      await qc.invalidateQueries({ queryKey: ["member", "savings"] });
      await qc.invalidateQueries({ queryKey: ["member", "transactions"] });
      router.invalidate();
    },
    onError: (e: Error) => {
      setStep("form");
      toast.error(mapErr(e.message));
    },
  });

  if (active.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Wallet />}
          title="No active savings account"
          hint="Enrol in a savings plan first, then come back to fund it."
          action={
            <Link
              to="/app/savings/enroll"
              className="rounded bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground"
            >
              Enroll in a plan
            </Link>
          }
        />
      </div>
    );
  }

  const invalid =
    !accountId || !Number.isFinite(numeric) || numeric <= 0 || (min > 0 && numeric < min);

  return (
    <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <SectionCard title={step === "form" ? "Deposit details" : "Review and confirm"}>
        {step === "form" ? (
          <form
            className="space-y-5 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (invalid) {
                toast.error(
                  min > 0 && numeric < min
                    ? `Minimum contribution for this plan is ${min.toFixed(2)}.`
                    : "Enter a valid amount greater than zero.",
                );
                return;
              }
              setStep("review");
            }}
          >
            <div>
              <Label className="mb-2 block">Destination account</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {active.map((a) => (
                  <AccountOption
                    key={a.id}
                    account={a}
                    selected={a.id === accountId}
                    onSelect={() => {
                      setAccountId(a.id);
                      navigate({ search: { account: a.id }, replace: true });
                    }}
                  />
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Amount</Label>
              <div className="mb-2 flex flex-wrap gap-2">
                {PRESETS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAmount(String(v))}
                    className={
                      "rounded-md border px-3 py-1.5 text-xs font-medium transition " +
                      (Number(amount) === v
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background hover:bg-muted")
                    }
                  >
                    <Money amount={v} />
                  </button>
                ))}
              </div>
              <Input
                id="dep-amount"
                type="number"
                inputMode="decimal"
                min={min || 0.01}
                step="0.01"
                max="10000000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
                aria-describedby="dep-amount-hint"
              />
              <p id="dep-amount-hint" className="mt-1 text-[11px] text-muted-foreground">
                {min > 0 ? (
                  <>
                    Minimum contribution for this plan: <Money amount={min} />.
                  </>
                ) : (
                  "Enter any amount greater than zero."
                )}
              </p>
            </div>

            <div>
              <Label className="mb-2 block">Payment channel</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {CHANNELS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    aria-pressed={channel === c.value}
                    onClick={() => setChannel(c.value)}
                    className={
                      "rounded-lg border p-3 text-left transition " +
                      (channel === c.value
                        ? "border-primary bg-primary/5"
                        : "border-border bg-background hover:bg-muted")
                    }
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Banknote className="h-4 w-4" /> {c.label}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{c.hint}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="dep-ref">Payment reference (optional)</Label>
                <Input
                  id="dep-ref"
                  value={reference}
                  maxLength={60}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="MoMo / bank reference"
                />
              </div>
              <div>
                <Label htmlFor="dep-note">Note (optional)</Label>
                <Textarea
                  id="dep-note"
                  rows={2}
                  maxLength={400}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What is this top-up for?"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Link
                to="/app/savings"
                className="rounded-md border border-border px-4 py-2 text-xs font-medium hover:bg-muted"
              >
                Cancel
              </Link>
              <Button type="submit" disabled={invalid}>
                Review deposit
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4 p-5">
            <dl className="divide-y divide-border rounded-lg border border-border">
              <Row label="Account" value={account ? account.nickname || account.plan_name : "—"} />
              <Row label="Plan" value={account?.plan_name ?? "—"} />
              <Row label="Amount" value={<Money amount={numeric} />} strong />
              <Row
                label="Channel"
                value={CHANNELS.find((c) => c.value === channel)?.label ?? channel}
              />
              <Row label="Reference" value={reference || "—"} />
              <Row label="Note" value={note || "—"} />
              <Row
                label="Balance after clearing"
                value={<Money amount={(account?.balance ?? 0) + numeric} />}
              />
            </dl>
            <p className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              The deposit is written to your transaction ledger straight away with a{" "}
              <strong>pending</strong> status, and moves to <strong>cleared</strong> once finance
              confirms the payment — your balance updates at that point.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setStep("form")} disabled={mut.isPending}>
                Edit details
              </Button>
              <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
                {mut.isPending ? "Recording…" : "Confirm deposit"}
              </Button>
            </div>
          </div>
        )}
      </SectionCard>

      <div className="space-y-6">
        {receipt ? (
          <SectionCard title="Deposit receipt">
            <div className="space-y-3 p-5 text-sm">
              <div className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-semibold">Recorded in ledger</span>
              </div>
              <dl className="divide-y divide-border rounded-lg border border-border">
                <Row
                  label="Reference"
                  value={<span className="font-mono text-xs">{receipt.ref}</span>}
                />
                <Row label="Amount" value={<Money amount={receipt.amount} />} strong />
                <Row
                  label="Status"
                  value={
                    <StatusPill status={receipt.status === "cleared" ? "cleared" : "pending"} />
                  }
                />
                <Row label="Logged" value={new Date(receipt.created_at).toLocaleString()} />
              </dl>
              <div className="flex flex-wrap gap-2">
                <Link
                  to="/app/savings/$accountId"
                  params={{ accountId: receipt.account_id }}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  <Receipt className="h-3.5 w-3.5" /> View account activity
                </Link>
                <Link
                  to="/app/transactions"
                  className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  <BadgeCheck className="h-3.5 w-3.5" /> Open ledger
                </Link>
              </div>
            </div>
          </SectionCard>
        ) : null}

        <SectionCard title="Your accounts">
          <ul className="divide-y divide-border text-sm">
            {active.map((a) => (
              <li key={a.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="font-medium">{a.nickname || a.plan_name}</div>
                  <div className="text-[11px] text-muted-foreground">{a.plan_schedule}</div>
                </div>
                <Money amount={a.balance} />
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}

function AccountOption({
  account,
  selected,
  onSelect,
}: {
  account: SavingsAccount;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={
        "rounded-lg border p-3 text-left transition " +
        (selected ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-muted")
      }
    >
      <div className="text-sm font-medium">{account.nickname || account.plan_name}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">
        Balance <Money amount={account.balance} /> · {account.plan_schedule}
      </div>
    </button>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-3 text-sm">
      <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className={strong ? "font-semibold" : ""}>{value}</dd>
    </div>
  );
}

function mapErr(raw: string): string {
  const map: Record<string, string> = {
    kyc_not_approved: "Complete KYC verification before moving money.",
    account_closed: "This account is closed.",
    account_not_found: "That savings account is not available.",
    amount_below_minimum: "Amount is below the plan's minimum contribution.",
    invalid_amount: "Enter a valid amount greater than zero.",
  };
  return map[raw] ?? `Deposit failed: ${raw}`;
}
