import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, PageHeader, SectionCard, SectionCardSkeleton } from "@/components/primitives";
import { WithdrawalRequestsSection } from "@/components/withdrawal-requests";
import { listMyAccounts } from "@/lib/savings.functions";

const accountsQuery = queryOptions({
  queryKey: ["member", "savings", "accounts"],
  queryFn: () => listMyAccounts(),
  staleTime: 20_000,
});

export const Route = createFileRoute("/_member/app/withdrawals")({
  head: () => ({
    meta: [
      { title: "Withdrawal requests — IT-360 CashApp" },
      {
        name: "description",
        content:
          "Request a withdrawal from your savings, follow each approval step, and review your full withdrawal history.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error }) => <ErrorState title="Withdrawals unavailable" message={error.message} />,
  notFoundComponent: () => <EmptyState title="Nothing here" hint="This withdrawal view does not exist." />,
  component: MemberWithdrawalsPage,
});

function MemberWithdrawalsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Cash out"
        title="Withdrawals"
        description="Submit a request, watch it move through review and payout, and cancel anything still pending."
      />
      <Suspense fallback={<SectionCardSkeleton />}>
        <WithdrawalsWorkspace />
      </Suspense>
    </div>
  );
}

function WithdrawalsWorkspace() {
  const { data: accounts } = useSuspenseQuery(accountsQuery);
  const active = accounts.filter((a) => a.status === "active");

  if (active.length === 0) {
    return (
      <SectionCard title="No active savings account">
        <div className="p-5">
          <EmptyState
            title="Open a savings account first"
            hint="Withdrawals are made from an active savings account. Once one is open and funded, requests appear here."
          />
        </div>
      </SectionCard>
    );
  }

  return (
    <WithdrawalRequestsSection
      accounts={active.map((a) => ({
        id: a.id,
        label: a.nickname || a.plan_name,
        balance: a.balance,
      }))}
    />
  );
}
