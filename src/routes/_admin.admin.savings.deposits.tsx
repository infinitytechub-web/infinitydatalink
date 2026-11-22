import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { EmptyState, ErrorState, Money, PageHeader, SectionCard, SectionCardSkeleton } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminDecideDeposit, adminListDeposits } from "@/lib/deposits.functions";

type Filter = "pending" | "approved" | "rejected" | "cancelled" | "all";
const q = (status: Filter) => queryOptions({ queryKey: ["admin", "deposits", status], queryFn: () => adminListDeposits({ data: { status } }) });
const LABEL: Record<string, string> = { mobile_money: "Mobile money", bank_transfer: "Bank transfer", card: "Card", cash: "Cash" };

export const Route = createFileRoute("/_admin/admin/savings/deposits")({
  head: () => ({
    meta: [
      { title: "Deposit approvals — IT-360 CashApp" },
      { name: "description", content: "Confirm or reject member deposit requests and credit savings instantly." },
      { property: "og:title", content: "Deposit approvals — IT-360 CashApp" },
      { property: "og:description", content: "Confirm or reject member deposit requests." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error }) => <ErrorState title="Deposits unavailable" message={(error as Error).message} />,
  component: Page,
});

function Page() {
  const [filter, setFilter] = useState<Filter>("pending");
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Savings" title="Deposit approvals" description="Check each payment arrived, then approve to credit the member's savings immediately." />
      <div className="flex flex-wrap gap-2">
        {(["pending", "approved", "rejected", "cancelled", "all"] as Filter[]).map((f) => (
          <Button key={f} size="sm" variant={f === filter ? "default" : "outline"} onClick={() => setFilter(f)} className="capitalize">{f}</Button>
        ))}
      </div>
      <Suspense fallback={<SectionCardSkeleton />}><List status={filter} /></Suspense>
    </div>
  );
}

function List({ status }: { status: Filter }) {
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(q(status));
  const decide = useServerFn(adminDecideDeposit);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: (v: { id: string; approve: boolean }) => decide({ data: { ...v, note: notes[v.id] ?? "" } }),
    onSuccess: (_r, v) => { toast.success(v.approve ? "Deposit credited" : "Deposit rejected"); qc.invalidateQueries({ queryKey: ["admin", "deposits"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <SectionCard title={`${data.length} request${data.length === 1 ? "" : "s"}`}>
      {data.length === 0 ? <div className="p-5"><EmptyState title="Nothing here" hint="No deposit requests match this filter." /></div> : (
        <ul className="divide-y divide-border">
          {data.map((d) => (
            <li key={d.id} className="space-y-2 px-5 py-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium"><Money amount={d.amount} /> · {d.member_name ?? "Member"} · {d.account_label}</div>
                  <div className="text-xs text-muted-foreground">{d.ref} · {LABEL[d.channel] ?? d.channel}{d.payment_reference ? ` · ref ${d.payment_reference}` : ""} · {new Date(d.created_at).toLocaleString()}</div>
                  {d.note && <div className="text-xs text-muted-foreground">Member note: {d.note}</div>}
                  {d.decision_note && <div className="text-xs text-muted-foreground">Decision note: {d.decision_note}</div>}
                </div>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">{d.status}</span>
              </div>
              {d.status === "pending" && (
                <div className="flex flex-wrap items-center gap-2">
                  <Input className="max-w-sm" placeholder="Note (required to reject)" aria-label={`Note for ${d.ref}`} value={notes[d.id] ?? ""} onChange={(e) => setNotes({ ...notes, [d.id]: e.target.value })} />
                  <Button size="sm" disabled={m.isPending} onClick={() => m.mutate({ id: d.id, approve: true })}>Approve & credit</Button>
                  <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate({ id: d.id, approve: false })}>Reject</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
