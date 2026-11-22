import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { HandCoins, Users } from "lucide-react";
import {
  EmptyState,
  ErrorState,
  KPIStat,
  Money,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
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
import { listMyAccounts } from "@/lib/savings.functions";
import {
  contributeToPot,
  getPotDetail,
  listMyPots,
  type GroupPot,
} from "@/lib/savings-modules.functions";

const potsQuery = queryOptions({
  queryKey: ["member", "pots"],
  queryFn: () => listMyPots(),
  staleTime: 15_000,
});
const accountsQuery = queryOptions({
  queryKey: ["member", "savings", "accounts"],
  queryFn: () => listMyAccounts(),
  staleTime: 15_000,
});

export const Route = createFileRoute("/_member/app/savings/pots")({
  head: () => ({
    meta: [
      { title: "Group & susu savings — IT-360 CashApp" },
      {
        name: "description",
        content:
          "Contribute to shared group savings pots and follow the payout rotation for your group.",
      },
      { property: "og:title", content: "Group & susu savings — IT-360 CashApp" },
      {
        property: "og:description",
        content: "Shared savings pots with contributions and payout rotations.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(potsQuery),
  component: PotsPage,
  errorComponent: ({ error }) => (
    <div className="p-6">
      <ErrorState title="Group savings unavailable" message={(error as Error).message} />
    </div>
  ),
});

function PotsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Member portal"
        title="Group & susu savings"
        description="Shared savings pots for your groups, departments and institutions with rotating payouts."
        action={
          <Link
            to="/app/savings"
            className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted"
          >
            Back to savings
          </Link>
        }
      />
      <Suspense fallback={<SectionCardSkeleton title="Group pots" rows={4} cols={4} />}>
        <Body />
      </Suspense>
    </>
  );
}

function Body() {
  const { data: pots } = useSuspenseQuery(potsQuery);
  const [selected, setSelected] = useState<GroupPot | null>(null);
  const [contributeFor, setContributeFor] = useState<GroupPot | null>(null);

  if (pots.length === 0) {
    return (
      <SectionCard title="Group pots">
        <div className="p-6">
          <EmptyState
            title="You're not in a group pot yet"
            hint="Join or register an organization, then an administrator can add you to a susu pot."
          />
        </div>
      </SectionCard>
    );
  }

  const pooled = pots.reduce((s, p) => s + p.balance, 0);
  const mine = pots.reduce((s, p) => s + p.my_contributed, 0);

  return (
    <div className="space-y-6">
      <section className="grid gap-6 md:grid-cols-3">
        <KPIStat label="Pots joined" value={<span className="tabular">{pots.length}</span>} />
        <KPIStat label="Pooled balance" value={<Money amount={pooled} />} />
        <KPIStat label="My contributions" value={<Money amount={mine} />} accent />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {pots.map((p) => (
          <div key={p.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{p.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {p.entity_name} · cycle {p.current_cycle} · {p.frequency}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                <Users className="h-3 w-3" /> {p.member_count}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Pot balance</dt>
                <dd className="tabular font-semibold text-foreground">
                  <Money amount={p.balance} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Per cycle</dt>
                <dd className="tabular font-semibold text-foreground">
                  <Money amount={p.contribution_amount} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">My total</dt>
                <dd className="tabular font-semibold text-foreground">
                  <Money amount={p.my_contributed} />
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex gap-2">
              <Button size="sm" onClick={() => setContributeFor(p)}>
                <HandCoins className="mr-1 h-3.5 w-3.5" /> Contribute
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelected(p)}>
                Activity
              </Button>
            </div>
          </div>
        ))}
      </div>

      {contributeFor && (
        <ContributeDialog pot={contributeFor} onClose={() => setContributeFor(null)} />
      )}
      {selected && <ActivityDialog pot={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ContributeDialog({ pot, onClose }: { pot: GroupPot; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: accounts = [] } = useQuery(accountsQuery);
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState(String(pot.contribution_amount));
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      contributeToPot({
        data: {
          pot_id: pot.id,
          account_id: accountId || accounts[0]?.id || "",
          amount: Number(amount),
          note: note.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Contribution recorded");
      qc.invalidateQueries({ queryKey: ["member"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contribute to {pot.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pot-account">From savings account</Label>
            <select
              id="pot-account"
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              value={accountId || accounts[0]?.id || ""}
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
            <Label htmlFor="pot-amount">Amount</Label>
            <Input
              id="pot-amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pot-note">Note (optional)</Label>
            <Input id="pot-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || Number(amount) <= 0}
          >
            {mutation.isPending ? "Sending…" : "Contribute"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActivityDialog({ pot, onClose }: { pot: GroupPot; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["member", "pots", pot.id],
    queryFn: () => getPotDetail({ data: { pot_id: pot.id } }),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{pot.name} activity</DialogTitle>
        </DialogHeader>
        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground">Loading activity…</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Payout rotation
              </h4>
              <ul className="space-y-2 text-sm">
                {data.payouts.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between rounded border border-border px-3 py-2"
                  >
                    <span>
                      Cycle {p.cycle} · {p.member_name ?? "Member"}
                    </span>
                    <span className="tabular text-xs">
                      <Money amount={p.amount} /> · {p.status}
                    </span>
                  </li>
                ))}
                {data.payouts.length === 0 && (
                  <li className="text-xs text-muted-foreground">No payouts scheduled.</li>
                )}
              </ul>
            </div>
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Recent contributions
              </h4>
              <ul className="space-y-2 text-sm">
                {data.contributions.slice(0, 10).map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between rounded border border-border px-3 py-2"
                  >
                    <span>{c.member_name ?? "Member"}</span>
                    <span className="tabular text-xs">
                      <Money amount={c.amount} /> · {new Date(c.created_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
                {data.contributions.length === 0 && (
                  <li className="text-xs text-muted-foreground">No contributions yet.</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
