import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useEffect, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { EmptyState, ErrorState, Money, PageHeader, SectionCard, SectionCardSkeleton } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listMyAccounts } from "@/lib/savings.functions";
import { cancelMyDeposit, DEPOSIT_CHANNELS, listMyDeposits, requestDeposit } from "@/lib/deposits.functions";
import { supabase } from "@/integrations/supabase/client";

const accountsQuery = queryOptions({ queryKey: ["member", "savings", "accounts"], queryFn: () => listMyAccounts(), staleTime: 20_000 });
const depositsQuery = queryOptions({ queryKey: ["member", "deposits"], queryFn: () => listMyDeposits() });

export const CHANNEL_LABEL: Record<string, string> = {
  mobile_money: "Mobile money",
  bank_transfer: "Bank transfer",
  card: "Card",
  cash: "Cash at branch",
};

export const Route = createFileRoute("/_member/app/deposits")({
  head: () => ({
    meta: [
      { title: "Deposit requests — IT-360 CashApp" },
      { name: "description", content: "Send money into your savings account and track each deposit until it is credited." },
      { property: "og:title", content: "Deposit requests — IT-360 CashApp" },
      { property: "og:description", content: "Send money into your savings account and track each deposit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error }) => <ErrorState title="Deposits unavailable" message={(error as Error).message} />,
  component: () => (
    <div className="space-y-6">
      <PageHeader eyebrow="Pay in" title="Deposits" description="Tell us about money you've sent. Once an officer confirms it, it lands in your savings straight away." />
      <Suspense fallback={<SectionCardSkeleton />}>
        <Workspace />
      </Suspense>
    </div>
  ),
});

function Workspace() {
  const qc = useQueryClient();
  const { data: accounts } = useSuspenseQuery(accountsQuery);
  const { data: deposits } = useSuspenseQuery(depositsQuery);
  const active = accounts.filter((a) => a.status === "active");
  const [accountId, setAccountId] = useState(active[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [channel, setChannel] = useState<(typeof DEPOSIT_CHANNELS)[number]>("mobile_money");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const submit = useServerFn(requestDeposit);
  const cancel = useServerFn(cancelMyDeposit);

  useEffect(() => {
    const ch = supabase
      .channel("member-deposits")
      .on("postgres_changes", { event: "*", schema: "public", table: "savings_deposit_requests" }, () => {
        qc.invalidateQueries({ queryKey: ["member", "deposits"] });
        qc.invalidateQueries({ queryKey: ["member", "savings"] });
      })
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, [qc]);

  const create = useMutation({
    mutationFn: () => submit({ data: { account_id: accountId, amount: Number(amount), channel, payment_reference: reference, note } }),
    onSuccess: (r) => {
      toast.success(`Deposit ${r.ref} sent for confirmation`);
      setAmount(""); setReference(""); setNote("");
      qc.invalidateQueries({ queryKey: ["member", "deposits"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const doCancel = useMutation({
    mutationFn: (id: string) => cancel({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["member", "deposits"] }),
    onError: (e) => toast.error((e as Error).message),
  });

  if (active.length === 0)
    return <SectionCard title="No active savings account"><div className="p-5"><EmptyState title="Open a savings account first" hint="Deposits go into an active savings account." /></div></SectionCard>;

  const valid = accountId && Number(amount) > 0;
  return (
    <>
      <SectionCard title="New deposit">
        <form className="grid gap-4 p-5 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (valid) create.mutate(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="dep-acc">Into account</Label>
            <select id="dep-acc" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {active.map((a) => <option key={a.id} value={a.id}>{a.nickname || a.plan_name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dep-amt">Amount (GH₵)</Label>
            <Input id="dep-amt" type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dep-ch">How you paid</Label>
            <select id="dep-ch" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
              {DEPOSIT_CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dep-ref">Payment reference</Label>
            <Input id="dep-ref" placeholder="e.g. MoMo transaction ID" maxLength={80} value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="dep-note">Note (optional)</Label>
            <Input id="dep-note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={!valid || create.isPending}>{create.isPending ? "Sending…" : "Submit deposit"}</Button>
          </div>
        </form>
      </SectionCard>
      <SectionCard title="My deposits">
        {deposits.length === 0 ? (
          <div className="p-5"><EmptyState title="No deposits yet" hint="Deposits you submit appear here." /></div>
        ) : (
          <ul className="divide-y divide-border">
            {deposits.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <div className="font-medium"><Money amount={d.amount} /> · {d.account_label}</div>
                  <div className="text-xs text-muted-foreground">{d.ref} · {CHANNEL_LABEL[d.channel] ?? d.channel}{d.payment_reference ? ` · ${d.payment_reference}` : ""} · {new Date(d.created_at).toLocaleString()}</div>
                  {d.decision_note && <div className="text-xs text-muted-foreground">Officer note: {d.decision_note}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">{d.status === "approved" ? "credited" : d.status}</span>
                  {d.status === "pending" && <Button size="sm" variant="outline" onClick={() => doCancel.mutate(d.id)}>Cancel</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
