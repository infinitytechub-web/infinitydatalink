import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
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
import { adminListFixedDeposits, adminRunMaturities } from "@/lib/savings-modules.functions";

type FdFilter = "active" | "matured" | "redeemed" | "broken" | "all";

const fdQuery = (status: FdFilter) =>
  queryOptions({
    queryKey: ["admin", "fixed-deposits", status],
    queryFn: () => adminListFixedDeposits({ data: { status, page: 1, page_size: 50 } }),
    staleTime: 15_000,
  });

export const Route = createFileRoute("/_admin/admin/savings/fixed")({
  head: () => ({
    meta: [
      { title: "Fixed deposits book — IT-360 CashApp" },
      {
        name: "description",
        content:
          "Monitor the term deposit book, upcoming maturities and run the maturity settlement job.",
      },
      { property: "og:title", content: "Fixed deposits book — IT-360 CashApp" },
      { property: "og:description", content: "Term deposit book, maturities and rollovers." },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(fdQuery("active")),
  component: AdminFixedPage,
  errorComponent: ({ error }) => (
    <div className="p-6">
      <ErrorState title="Fixed deposit book unavailable" message={error.message} />
    </div>
  ),
});

function AdminFixedPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<FdFilter>("active");

  const run = useMutation({
    mutationFn: () => adminRunMaturities(),
    onSuccess: (r) => {
      toast.success(`${r.processed} deposit(s) settled`);
      qc.invalidateQueries({ queryKey: ["admin", "fixed-deposits"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Fixed deposits"
        description="Term deposit book with maturity, rollover and early-break settlement."
        action={
          <div className="flex items-center gap-2">
            <select
              aria-label="Filter deposits by status"
              className="h-9 rounded-md border border-border bg-background px-3 text-xs"
              value={status}
              onChange={(e) => setStatus(e.target.value as FdFilter)}
            >
              <option value="active">Active</option>
              <option value="matured">Matured</option>
              <option value="redeemed">Redeemed</option>
              <option value="broken">Broken</option>
              <option value="all">All</option>
            </select>
            <Button size="sm" onClick={() => run.mutate()} disabled={run.isPending}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> Run maturities
            </Button>
          </div>
        }
      />
      <Suspense fallback={<SectionCardSkeleton title="Fixed deposits" rows={6} cols={6} />}>
        <Body status={status} />
      </Suspense>
    </>
  );
}

function Body({ status }: { status: FdFilter }) {
  const { data } = useSuspenseQuery(fdQuery(status));
  return (
    <div className="space-y-6">
      <section className="grid gap-6 md:grid-cols-3">
        <KPIStat label="Active principal" value={<Money amount={data.principal_active} />} accent />
        <KPIStat
          label="Deposits shown"
          value={<span className="tabular">{data.rows.length}</span>}
        />
        <KPIStat label="Total records" value={<span className="tabular">{data.total}</span>} />
      </section>

      <SectionCard title="Deposit book">
        {data.rows.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No deposits in this view" />
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-6 py-3 font-medium">Reference</th>
                <th className="px-6 py-3 font-medium">Member</th>
                <th className="px-6 py-3 font-medium">Product</th>
                <th className="px-6 py-3 text-right font-medium">Principal</th>
                <th className="px-6 py-3 text-right font-medium">Interest</th>
                <th className="px-6 py-3 font-medium">Maturity</th>
                <th className="px-6 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((d) => (
                <tr key={d.id} className="border-b border-border/60 text-sm">
                  <td className="px-6 py-3 font-mono text-xs">{d.ref}</td>
                  <td className="px-6 py-3">
                    <div className="font-medium text-foreground">{d.member_name ?? "Member"}</div>
                    <div className="text-xs text-muted-foreground">{d.member_no ?? "—"}</div>
                  </td>
                  <td className="px-6 py-3 text-xs">{d.product_name}</td>
                  <td className="px-6 py-3 text-right tabular">
                    <Money amount={d.principal} />
                  </td>
                  <td className="px-6 py-3 text-right tabular">
                    <Money amount={d.status === "active" ? d.interest_expected : d.interest_paid} />
                  </td>
                  <td className="px-6 py-3 text-xs">
                    {new Date(d.maturity_date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-3 text-xs capitalize">{d.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  );
}
