import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, Unlock } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { useStepUp } from "@/components/step-up-dialog";
import {
  adminListHolds,
  adminSearchSavingsAccounts,
  placeSavingsHold,
  releaseSavingsHold,
  type SavingsHold,
} from "@/lib/savings-modules.functions";

type HoldFilter = "active" | "released" | "all";

const holdsQuery = (status: HoldFilter) =>
  queryOptions({
    queryKey: ["admin", "holds", status],
    queryFn: () => adminListHolds({ data: { status, page: 1, page_size: 50 } }),
    staleTime: 15_000,
  });

export const Route = createFileRoute("/_admin/admin/savings/holds")({
  head: () => ({
    meta: [
      { title: "Savings holds — IT-360 CashApp" },
      {
        name: "description",
        content:
          "Place and release collateral or legal holds that reduce a member's withdrawable savings balance.",
      },
      { property: "og:title", content: "Savings holds — IT-360 CashApp" },
      {
        property: "og:description",
        content: "Collateral and legal holds on member savings balances.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(holdsQuery("active")),
  component: HoldsPage,
  errorComponent: ({ error }) => (
    <div className="p-6">
      <ErrorState title="Holds unavailable" message={(error as Error).message} />
    </div>
  ),
});

function HoldsPage() {
  const [status, setStatus] = useState<HoldFilter>("active");
  const [placing, setPlacing] = useState(false);
  const stepUp = useStepUp();

  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Savings holds"
        description="Encumber member savings as loan collateral or under legal instruction. Held funds cannot be withdrawn."
        action={
          <div className="flex items-center gap-2">
            <select
              aria-label="Filter holds by status"
              className="h-9 rounded-md border border-border bg-background px-3 text-xs"
              value={status}
              onChange={(e) => setStatus(e.target.value as HoldFilter)}
            >
              <option value="active">Active</option>
              <option value="released">Released</option>
              <option value="all">All</option>
            </select>
            <Button size="sm" onClick={() => setPlacing(true)}>
              <Lock className="mr-1 h-3.5 w-3.5" /> Place hold
            </Button>
          </div>
        }
      />
      <Suspense fallback={<SectionCardSkeleton title="Holds" rows={6} cols={6} />}>
        <Body status={status} stepUp={stepUp} />
      </Suspense>
      {placing && <PlaceHoldDialog stepUp={stepUp} onClose={() => setPlacing(false)} />}
      {stepUp.dialog}
    </>
  );
}

function Body({ status, stepUp }: { status: HoldFilter; stepUp: ReturnType<typeof useStepUp> }) {
  const { data } = useSuspenseQuery(holdsQuery(status));
  const [releasing, setReleasing] = useState<SavingsHold | null>(null);

  return (
    <div className="space-y-6">
      <section className="grid gap-6 md:grid-cols-3">
        <KPIStat
          label="Total held"
          value={<Money amount={data.held_total} />}
          accent
          hint="Across active holds"
        />
        <KPIStat label="Holds shown" value={<span className="tabular">{data.rows.length}</span>} />
        <KPIStat label="Total records" value={<span className="tabular">{data.total}</span>} />
      </section>

      <SectionCard title="Holds">
        {data.rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No holds"
              hint="Place a hold to encumber a member's savings balance."
            />
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-6 py-3 font-medium">Member</th>
                <th className="px-6 py-3 font-medium">Account</th>
                <th className="px-6 py-3 text-right font-medium">Amount</th>
                <th className="px-6 py-3 font-medium">Reason</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((h) => (
                <tr key={h.id} className="border-b border-border/60 text-sm">
                  <td className="px-6 py-3">
                    <div className="font-medium text-foreground">{h.member_name ?? "Member"}</div>
                    <div className="text-xs text-muted-foreground">{h.member_no ?? "—"}</div>
                  </td>
                  <td className="px-6 py-3 text-xs">{h.account_label}</td>
                  <td className="px-6 py-3 text-right tabular">
                    <Money amount={h.amount} />
                  </td>
                  <td className="px-6 py-3 text-xs text-muted-foreground">{h.reason}</td>
                  <td className="px-6 py-3 text-xs">
                    {h.status === "active" ? (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">
                        active
                      </span>
                    ) : (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                        released
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {h.status === "active" && (
                      <Button size="sm" variant="outline" onClick={() => setReleasing(h)}>
                        <Unlock className="mr-1 h-3.5 w-3.5" /> Release
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {releasing && (
        <ReleaseDialog hold={releasing} stepUp={stepUp} onClose={() => setReleasing(null)} />
      )}
    </div>
  );
}

function PlaceHoldDialog({
  stepUp,
  onClose,
}: {
  stepUp: ReturnType<typeof useStepUp>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const { data: accounts = [] } = useQuery({
    queryKey: ["admin", "hold-accounts", term],
    queryFn: () => adminSearchSavingsAccounts({ data: { q: term } }),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const token = await stepUp.ensure("place a savings hold");
      return placeSavingsHold({
        data: {
          account_id: accountId,
          amount: Number(amount),
          reason,
          loan_id: null,
          step_up_token: token,
        },
      });
    },
    onSuccess: () => {
      toast.success("Hold placed");
      qc.invalidateQueries({ queryKey: ["admin", "holds"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Place savings hold</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="hold-search">Find member account</Label>
            <Input
              id="hold-search"
              placeholder="Name or member number"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
            <select
              aria-label="Savings account"
              className="mt-2 h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">Select an account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.member_name ?? "Member"} ({a.member_no ?? "—"}) · {a.label} ·{" "}
                  {a.balance.toFixed(2)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hold-amount">Amount to hold</Label>
            <Input
              id="hold-amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hold-reason">Reason (required)</Label>
            <Textarea
              id="hold-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={
              mutation.isPending || !accountId || Number(amount) <= 0 || reason.trim().length < 5
            }
          >
            {mutation.isPending ? "Placing…" : "Place hold"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReleaseDialog({
  hold,
  stepUp,
  onClose,
}: {
  hold: SavingsHold;
  stepUp: ReturnType<typeof useStepUp>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      const token = await stepUp.ensure("release a savings hold");
      return releaseSavingsHold({ data: { id: hold.id, reason, step_up_token: token } });
    },
    onSuccess: () => {
      toast.success("Hold released");
      qc.invalidateQueries({ queryKey: ["admin", "holds"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Release hold</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Releasing returns {hold.amount.toFixed(2)} to {hold.member_name ?? "the member"}'s
          withdrawable balance.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="release-reason">Reason (required)</Label>
          <Textarea
            id="release-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || reason.trim().length < 5}
          >
            {mutation.isPending ? "Releasing…" : "Release hold"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
