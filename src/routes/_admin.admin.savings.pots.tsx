import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Banknote } from "lucide-react";
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
import { useStepUp } from "@/components/step-up-dialog";
import { adminListPots, adminPayPotPayout } from "@/lib/savings-modules.functions";

const potsQuery = queryOptions({
  queryKey: ["admin", "pots"],
  queryFn: () => adminListPots(),
  staleTime: 15_000,
});

export const Route = createFileRoute("/_admin/admin/savings/pots")({
  head: () => ({
    meta: [
      { title: "Group savings pots — IT-360 CashApp" },
      {
        name: "description",
        content: "Oversee group and susu savings pots, pooled balances and scheduled payout rotations.",
      },
      { property: "og:title", content: "Group savings pots — IT-360 CashApp" },
      { property: "og:description", content: "Group susu pot balances, cycles and payout releases." },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(potsQuery),
  component: AdminPotsPage,
  errorComponent: ({ error }) => (
    <div className="p-6">
      <ErrorState title="Group pots unavailable" message={error.message} />
    </div>
  ),
});

function AdminPotsPage() {
  const stepUp = useStepUp();
  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Group & susu pots"
        description="Pooled group savings with rotating payouts. Releasing a payout requires re-authentication."
      />
      <Suspense fallback={<SectionCardSkeleton title="Group pots" rows={5} cols={5} />}>
        <Body stepUp={stepUp} />
      </Suspense>
      {stepUp.dialog}
    </>
  );
}

function Body({ stepUp }: { stepUp: ReturnType<typeof useStepUp> }) {
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(potsQuery);

  const pay = useMutation({
    mutationFn: async (payoutId: string) => {
      const token = await stepUp.ensure("release a group pot payout");
      return adminPayPotPayout({ data: { payout_id: payoutId, step_up_token: token } });
    },
    onSuccess: () => {
      toast.success("Payout released");
      qc.invalidateQueries({ queryKey: ["admin", "pots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const scheduled = data.payouts.filter((p) => p.status === "scheduled");

  return (
    <div className="space-y-6">
      <section className="grid gap-6 md:grid-cols-3">
        <KPIStat label="Pooled balance" value={<Money amount={data.pooled} />} />
        <KPIStat label="Active pots" value={<span className="tabular">{data.pots.length}</span>} />
        <KPIStat label="Scheduled payouts" value={<span className="tabular">{scheduled.length}</span>} accent />
      </section>

      <SectionCard title="Pots">
        {data.pots.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No group pots" hint="Create a pot from an approved entity to start susu savings." />
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-6 py-3 font-medium">Pot</th>
                <th className="px-6 py-3 font-medium">Group</th>
                <th className="px-6 py-3 font-medium">Frequency</th>
                <th className="px-6 py-3 text-right font-medium">Members</th>
                <th className="px-6 py-3 text-right font-medium">Cycle</th>
                <th className="px-6 py-3 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.pots.map((p) => (
                <tr key={p.id} className="border-b border-border/60 text-sm">
                  <td className="px-6 py-3 font-medium text-foreground">{p.name}</td>
                  <td className="px-6 py-3 text-xs">{p.entity_name}</td>
                  <td className="px-6 py-3 text-xs capitalize">{p.frequency}</td>
                  <td className="px-6 py-3 text-right tabular">{p.member_count}</td>
                  <td className="px-6 py-3 text-right tabular">{p.current_cycle}</td>
                  <td className="px-6 py-3 text-right tabular">
                    <Money amount={p.balance} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <SectionCard title="Payout rotation">
        {data.payouts.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No payouts scheduled" />
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-6 py-3 font-medium">Pot</th>
                <th className="px-6 py-3 font-medium">Recipient</th>
                <th className="px-6 py-3 text-right font-medium">Cycle</th>
                <th className="px-6 py-3 text-right font-medium">Amount</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.payouts.map((p) => (
                <tr key={p.id} className="border-b border-border/60 text-sm">
                  <td className="px-6 py-3 text-xs">{p.pot_name}</td>
                  <td className="px-6 py-3">{p.member_name ?? "Member"}</td>
                  <td className="px-6 py-3 text-right tabular">{p.cycle}</td>
                  <td className="px-6 py-3 text-right tabular">
                    <Money amount={p.amount} />
                  </td>
                  <td className="px-6 py-3 text-xs capitalize">{p.status}</td>
                  <td className="px-6 py-3 text-right">
                    {p.status === "scheduled" && (
                      <Button size="sm" onClick={() => pay.mutate(p.id)} disabled={pay.isPending}>
                        <Banknote className="mr-1 h-3.5 w-3.5" /> Release
                      </Button>
                    )}
                    {p.status === "paid" && p.paid_at && (
                      <span className="text-xs text-muted-foreground">{new Date(p.paid_at).toLocaleDateString()}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  );
}
