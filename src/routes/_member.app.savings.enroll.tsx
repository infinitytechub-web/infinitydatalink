import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { useSuspenseQuery, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ShieldAlert } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/org-config";
import { enrollInPlan, listAvailablePlans, type SavingsPlan } from "@/lib/savings.functions";

const plansQuery = queryOptions({
  queryKey: ["member", "savings", "available-plans"],
  queryFn: () => listAvailablePlans(),
  staleTime: 15_000,
});

export const Route = createFileRoute("/_member/app/savings/enroll")({
  loader: ({ context }) => context.queryClient.ensureQueryData(plansQuery),
  component: EnrollPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Failed to load plans: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm text-muted-foreground">Not found.</div>,
});

function EnrollPage() {
  return (
    <>
      <PageHeader
        eyebrow="Member portal"
        title="Enroll in a savings plan"
        description="Pick the plan that fits your goal. You can enroll in multiple plans and add a personal target."
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <Body />
      </Suspense>
    </>
  );
}

function Body() {
  const { data: plans } = useSuspenseQuery(plansQuery);
  const [selected, setSelected] = useState<SavingsPlan | null>(null);
  if (plans.length === 0) {
    return (
      <SectionCard title="You're already enrolled">
        <div className="p-6 text-sm text-muted-foreground">
          You're enrolled in every available plan. Manage them from{" "}
          <Link to="/app/savings" className="text-emerald-mid underline">
            My Savings
          </Link>
          .
        </div>
      </SectionCard>
    );
  }
  return (
    <div className="grid gap-6 md:grid-cols-3">
      <div className="md:col-span-2 space-y-3">
        {plans.map((p) => (
          <PlanCard
            key={p.id}
            p={p}
            active={selected?.id === p.id}
            onSelect={() => setSelected(p)}
          />
        ))}
      </div>
      <div>
        <SectionCard title="Enrollment details">
          {selected ? (
            <EnrollForm plan={selected} />
          ) : (
            <div className="p-6 text-sm text-muted-foreground">
              Select a plan on the left to see enrollment options.
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function PlanCard({
  p,
  active,
  onSelect,
}: {
  p: SavingsPlan;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border p-5 text-left transition ${
        active
          ? "border-emerald-mid bg-emerald-mid/5"
          : "border-emerald-deep/10 bg-card hover:border-emerald-mid/40"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {p.schedule} · {p.interest_rate}% p.a.
          </div>
          <div className="mt-1 text-base font-semibold text-emerald-deep">{p.name}</div>
          {p.description ? (
            <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
          ) : null}
        </div>
        {active ? <Check className="h-5 w-5 text-emerald-mid" /> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-muted-foreground">
        <span>
          Min contribution:{" "}
          <span className="tabular font-semibold">{formatMoney(p.min_contribution)}</span>
        </span>
        <span>
          Suggested:{" "}
          <span className="tabular font-semibold">{formatMoney(p.contribution_amount)}</span>
        </span>
        <span>
          Lock: <span className="tabular font-semibold">{p.lock_days}d</span>
        </span>
      </div>
    </button>
  );
}

function EnrollForm({ plan }: { plan: SavingsPlan }) {
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  const call = useServerFn(enrollInPlan);
  const [nickname, setNickname] = useState("");
  const [goalAmount, setGoalAmount] = useState<string>("");
  const [goalDate, setGoalDate] = useState<string>("");

  const mut = useMutation({
    mutationFn: (data: {
      plan_id: string;
      nickname: string | null;
      goal_amount: number | null;
      goal_target_date: string | null;
    }) => call({ data }),
    onSuccess: async (res) => {
      toast.success("Enrolled — start your first contribution.");
      await qc.invalidateQueries({ queryKey: ["member", "savings"] });
      router.invalidate();
      navigate({ to: "/app/savings/$accountId", params: { accountId: res.id } });
    },
    onError: (err: Error) => {
      if (err.message === "kyc_not_approved") {
        toast.error("Complete KYC verification before enrolling.");
      } else {
        toast.error(`Enrollment failed: ${err.message}`);
      }
    },
  });

  return (
    <form
      className="space-y-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        const g = goalAmount.trim() ? Number(goalAmount) : null;
        mut.mutate({
          plan_id: plan.id,
          nickname: nickname.trim() || null,
          goal_amount: g && g > 0 ? g : null,
          goal_target_date: goalDate || null,
        });
      }}
    >
      <div className="rounded border border-emerald-deep/10 bg-cream/40 p-3 text-sm">
        <div className="font-semibold text-emerald-deep">{plan.name}</div>
        <div className="text-[11px] text-muted-foreground">
          {plan.schedule} · {plan.interest_rate}% p.a. · min {formatMoney(plan.min_contribution)}
        </div>
      </div>
      <div>
        <Label htmlFor="nickname">Nickname (optional)</Label>
        <Input
          id="nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="e.g. School fees fund"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="goal_amount">Goal amount</Label>
          <Input
            id="goal_amount"
            type="number"
            inputMode="decimal"
            min="0"
            step="1"
            value={goalAmount}
            onChange={(e) => setGoalAmount(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="goal_date">Target date</Label>
          <Input
            id="goal_date"
            type="date"
            value={goalDate}
            onChange={(e) => setGoalDate(e.target.value)}
          />
        </div>
      </div>
      <Button type="submit" disabled={mut.isPending} className="w-full">
        {mut.isPending ? "Enrolling…" : "Confirm enrollment"}
      </Button>
      {mut.error && (mut.error as Error).message === "kyc_not_approved" ? (
        <div className="flex items-start gap-2 rounded border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <ShieldAlert className="mt-0.5 h-4 w-4" />
          <div>
            KYC must be approved before enrolling.{" "}
            <Link to="/app/kyc" className="underline">
              Go to verification
            </Link>
          </div>
        </div>
      ) : null}
    </form>
  );
}
