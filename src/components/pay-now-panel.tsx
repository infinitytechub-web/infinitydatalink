/**
 * Member-facing payment composer + gateway history.
 * Rails light up automatically once an admin configures a provider that
 * supports them; unconfigured rails stay visible but disabled with a reason.
 */
import { useMemo, useState } from "react";
import { queryOptions, useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Banknote, Building2, CreditCard, Loader2, Smartphone } from "lucide-react";
import { EmptyState, Money, SectionCard } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PhoneField } from "@/components/phone-field";
import { PaymentStatusBadge } from "@/components/payment-status-badge";
import { checkGhPhone } from "@/lib/gh-phone";
import {
  PAYMENT_PURPOSES,
  PURPOSE_LABELS,
  RAIL_LABELS,
  minorToMajor,
  type PaymentPurpose,
  type RailAvailability,
  type RailKind,
} from "@/lib/payment-rails";
import { createPayment, getMyPayments, getPaymentRails } from "@/lib/payments.functions";

const railsQuery = queryOptions({
  queryKey: ["payments", "rails"],
  queryFn: () => getPaymentRails(),
  staleTime: 60_000,
});
const myPaymentsQuery = queryOptions({
  queryKey: ["payments", "mine"],
  queryFn: () => getMyPayments({ data: { page: 1, pageSize: 20 } }),
  staleTime: 10_000,
});

const KIND_ICON: Record<RailKind, typeof Smartphone> = {
  mobile_money: Smartphone,
  bank: Building2,
  card: CreditCard,
  cash: Banknote,
};

export function PayNowPanel() {
  const { data: rails } = useSuspenseQuery(railsQuery);
  const qc = useQueryClient();
  const call = useServerFn(createPayment);

  const [rail, setRail] = useState<string>(() => rails.find((r) => r.selectable)?.rail ?? rails[0]?.rail ?? "cash");
  const [purpose, setPurpose] = useState<PaymentPurpose>("savings_deposit");
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");

  const selected = useMemo(() => rails.find((r) => r.rail === rail), [rails, rail]);
  const needsPhone = selected?.kind === "mobile_money";
  const amountNum = Number(amount);
  const phoneOk = !needsPhone || checkGhPhone(phone).valid;
  const amountOk = Number.isFinite(amountNum) && amountNum > 0;

  const mut = useMutation({
    mutationFn: () =>
      call({
        data: {
          rail: rail as never,
          purpose,
          amount: amountNum,
          payer_phone: needsPhone ? phone : null,
          note: note.trim() || null,
          client_key: `${rail}:${purpose}:${amountNum}:${Math.floor(Date.now() / 60_000)}`,
        },
      }),
    onSuccess: async (res) => {
      if (res.duplicate) toast.info(`Existing payment reused: ${res.intent.reference}`);
      else toast.success(`Payment ${res.intent.reference} created`, { description: res.message });
      setAmount("");
      setNote("");
      await qc.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <SectionCard title="Make a payment">
        <form
          className="space-y-5 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!selected?.selectable) return toast.error("That payment method is not available yet.");
            if (!amountOk) return toast.error("Enter a valid amount.");
            if (!phoneOk) return toast.error("Enter a valid 10-digit Ghana mobile number.");
            mut.mutate();
          }}
        >
          <fieldset>
            <legend className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Payment method
            </legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rails.map((r) => (
                <RailCard key={r.rail} rail={r} active={r.rail === rail} onSelect={() => setRail(r.rail)} />
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Purpose
              </span>
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value as PaymentPurpose)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {PAYMENT_PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {PURPOSE_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Amount (GHS)
              </span>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
              />
            </label>
          </div>

          {needsPhone && (
            <PhoneField
              value={phone}
              onChange={setPhone}
              required
              label="Mobile money number"
              hint="A payment prompt is sent to this number."
            />
          )}

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Note (optional)
            </span>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} />
          </label>

          {selected && !selected.selectable && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
              {selected.note}
            </p>
          )}
          {selected?.sandbox && selected.selectable && (
            <p className="text-xs text-muted-foreground">
              Sandbox mode — no real funds move until live credentials are configured.
            </p>
          )}

          <Button type="submit" disabled={mut.isPending || !selected?.selectable}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Continue to pay
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Card details are entered on the provider's secure page — this app never receives or stores card numbers.
          </p>
        </form>
      </SectionCard>

      <MyPaymentsTable />
    </div>
  );
}

function RailCard({ rail, active, onSelect }: { rail: RailAvailability; active: boolean; onSelect: () => void }) {
  const Icon = KIND_ICON[rail.kind];
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!rail.selectable}
      aria-pressed={active}
      className={
        "rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-55 " +
        (active ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:border-primary/40")
      }
    >
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        <span className="min-w-0 truncate text-sm font-semibold">{rail.label}</span>
      </span>
      <span className="mt-1 block text-[11px] text-muted-foreground">{rail.blurb}</span>
      <span className="mt-2 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {rail.statusLabel}
      </span>
    </button>
  );
}

function MyPaymentsTable() {
  const { data, isLoading } = useQuery(myPaymentsQuery);
  const rows = data?.rows ?? [];
  const receiptByIntent = new Map((data?.receipts ?? []).map((r) => [r.intent_id, r]));

  return (
    <SectionCard title="My payments">
      {isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="p-6">
          <EmptyState title="No payments yet" hint="Payments you start will be tracked here with a receipt." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/60 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-5 py-3 font-medium">Reference</th>
                <th className="px-5 py-3 font-medium">Method</th>
                <th className="px-5 py-3 font-medium">Purpose</th>
                <th className="px-5 py-3 text-right font-medium">Amount</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Receipt</th>
                <th className="px-5 py-3 text-right font-medium">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-3 font-mono text-[11px] text-muted-foreground">{r.reference}</td>
                  <td className="px-5 py-3 text-sm">{RAIL_LABELS[r.rail] ?? r.rail}</td>
                  <td className="px-5 py-3 text-sm text-muted-foreground">
                    {PURPOSE_LABELS[r.purpose as PaymentPurpose] ?? r.purpose}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Money amount={minorToMajor(r.amount_minor)} />
                  </td>
                  <td className="px-5 py-3">
                    <PaymentStatusBadge status={r.status} />
                  </td>
                  <td className="px-5 py-3 font-mono text-[11px] text-muted-foreground">
                    {receiptByIntent.get(r.id)?.receipt_no ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-right text-[11px] text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
