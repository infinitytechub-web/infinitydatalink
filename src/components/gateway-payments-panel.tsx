/**
 * Admin gateway payments: filterable ledger, manual (cash/bank) confirmation,
 * cancellation, refund requests and a pending-vs-cleared reconciliation view.
 * Every mutating action requires a note and writes an audit entry server-side.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BadgeCheck, Ban, Loader2, RotateCcw } from "lucide-react";
import { EmptyState, KPIStat, Money, SectionCard } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ExportBar } from "@/components/export-bar";
import { PaymentStatusBadge } from "@/components/payment-status-badge";
import { formatMoney } from "@/lib/org-config";
import { formatGhPhone } from "@/lib/gh-phone";
import {
  INTENT_STATUSES,
  PURPOSE_LABELS,
  RAILS,
  RAIL_LABELS,
  STATUS_LABELS,
  minorToMajor,
  railSpec,
  type PaymentPurpose,
} from "@/lib/payment-rails";
import {
  cancelPayment,
  confirmManualPayment,
  getAdminPayments,
  getPaymentReconciliation,
  requestPaymentRefund,
  type IntentRow,
} from "@/lib/payments.functions";

type Filters = { status: string; rail: string; date_from: string; date_to: string; search: string };

export function GatewayPaymentsPanel() {
  const [tab, setTab] = useState<"ledger" | "reconciliation">("ledger");
  return (
    <SectionCard
      title="Gateway payments"
      action={
        <div className="flex gap-2">
          {(["ledger", "reconciliation"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition " +
                (tab === t
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground hover:bg-muted")
              }
            >
              {t}
            </button>
          ))}
        </div>
      }
    >
      {tab === "ledger" ? <Ledger /> : <Reconciliation />}
    </SectionCard>
  );
}

function Ledger() {
  const [page, setPage] = useState(1);
  const [f, setF] = useState<Filters>({
    status: "",
    rail: "",
    date_from: "",
    date_to: "",
    search: "",
  });
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "gateway-payments", page, f],
    queryFn: () =>
      getAdminPayments({
        data: {
          page,
          pageSize: 25,
          status: f.status || null,
          rail: f.rail || null,
          date_from: f.date_from || null,
          date_to: f.date_to || null,
          search: f.search || null,
        },
      }),
    staleTime: 5_000,
  });

  const rows = data?.rows ?? [];
  const receipts = new Map((data?.receipts ?? []).map((r) => [r.intent_id, r]));
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 25));

  const set = (patch: Partial<Filters>) => {
    setF((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  return (
    <>
      <div className="flex flex-wrap items-end gap-3 border-b border-border/60 p-4">
        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Status
          <select
            value={f.status}
            onChange={(e) => set({ status: e.target.value })}
            className="mt-1 block h-9 rounded-md border border-input bg-background px-2 text-xs font-normal normal-case tracking-normal"
          >
            <option value="">All</option>
            {INTENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Rail
          <select
            value={f.rail}
            onChange={(e) => set({ rail: e.target.value })}
            className="mt-1 block h-9 rounded-md border border-input bg-background px-2 text-xs font-normal normal-case tracking-normal"
          >
            <option value="">All</option>
            {RAILS.map((r) => (
              <option key={r} value={r}>
                {RAIL_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          From
          <Input
            type="date"
            value={f.date_from}
            onChange={(e) => set({ date_from: e.target.value })}
            className="mt-1 h-9 w-36"
          />
        </label>
        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          To
          <Input
            type="date"
            value={f.date_to}
            onChange={(e) => set({ date_to: e.target.value })}
            className="mt-1 h-9 w-36"
          />
        </label>
        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Reference / phone
          <Input
            value={f.search}
            onChange={(e) => set({ search: e.target.value })}
            className="mt-1 h-9 w-44"
            placeholder="IW-…"
          />
        </label>
        <div className="ml-auto">
          <ExportBar
            permission="export:payments"
            title="Gateway payments"
            subtitle={`${rows.length} of ${total} rows`}
            filename="gateway_payments"
            columns={[
              { header: "Reference", accessor: (r: IntentRow) => r.reference },
              { header: "Rail", accessor: (r) => RAIL_LABELS[r.rail] ?? r.rail },
              { header: "Provider", accessor: (r) => r.provider_code },
              { header: "Purpose", accessor: (r) => r.purpose },
              {
                header: "Amount",
                accessor: (r) => formatMoney(minorToMajor(r.amount_minor)),
                align: "right",
              },
              { header: "Status", accessor: (r) => r.status },
              {
                header: "Payer phone",
                accessor: (r) => (r.payer_phone ? formatGhPhone(r.payer_phone) : ""),
              },
              { header: "Receipt", accessor: (r) => receipts.get(r.id)?.receipt_no ?? "" },
              { header: "Created", accessor: (r) => new Date(r.created_at).toISOString() },
            ]}
            rows={rows}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="p-6">
          <EmptyState title="No payments match" hint="Adjust the filters above." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/60 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-5 py-3 font-medium">Reference</th>
                <th className="px-5 py-3 font-medium">Rail / provider</th>
                <th className="px-5 py-3 font-medium">Purpose</th>
                <th className="px-5 py-3 font-medium">Payer</th>
                <th className="px-5 py-3 text-right font-medium">Amount</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Receipt</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-3 font-mono text-[11px] text-muted-foreground">
                    {r.reference}
                  </td>
                  <td className="px-5 py-3 text-sm">
                    <div>{RAIL_LABELS[r.rail] ?? r.rail}</div>
                    <div className="text-[11px] text-muted-foreground">{r.provider_code}</div>
                  </td>
                  <td className="px-5 py-3 text-sm text-muted-foreground">
                    {PURPOSE_LABELS[r.purpose as PaymentPurpose] ?? r.purpose}
                  </td>
                  <td className="px-5 py-3 text-[11px] text-muted-foreground">
                    {r.payer_phone ? formatGhPhone(r.payer_phone) : "—"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Money amount={minorToMajor(r.amount_minor)} />
                  </td>
                  <td className="px-5 py-3">
                    <PaymentStatusBadge status={r.status} />
                  </td>
                  <td className="px-5 py-3 font-mono text-[11px] text-muted-foreground">
                    {receipts.get(r.id)?.receipt_no ?? "—"}
                  </td>
                  <td className="px-5 py-3">
                    <RowActions row={r} canManage={data?.can_manage ?? false} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">
        <span>
          Page {page} of {pages} · {total} payments
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </>
  );
}

function RowActions({ row, canManage }: { row: IntentRow; canManage: boolean }) {
  const manual = railSpec(row.rail)?.manualSettlement ?? false;
  const open =
    row.status === "pending" ||
    row.status === "processing" ||
    row.status === "requires_configuration";
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {manual && open && <ConfirmDialog row={row} disabled={!canManage} />}
      {open && <CancelDialog row={row} disabled={!canManage} />}
      {row.status === "succeeded" && <RefundDialog row={row} disabled={!canManage} />}
    </div>
  );
}

function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["admin", "gateway-payments"] });
}

function ConfirmDialog({ row, disabled }: { row: IntentRow; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [providerRef, setProviderRef] = useState("");
  const refresh = useRefresh();
  const call = useServerFn(confirmManualPayment);
  const mut = useMutation({
    mutationFn: () =>
      call({
        data: { reference: row.reference, note, provider_reference: providerRef.trim() || null },
      }),
    onSuccess: async (res) => {
      toast.success(`Settled ${row.reference} · receipt ${res.receipt.receipt_no}`);
      setOpen(false);
      setNote("");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          title={disabled ? "payments.manage required" : undefined}
        >
          <BadgeCheck className="mr-1 h-3.5 w-3.5" /> Confirm
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm {row.reference}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (note.trim().length < 10)
              return toast.error("Describe how funds were received (min 10 characters).");
            mut.mutate();
          }}
        >
          <p className="text-sm text-muted-foreground">
            Confirming issues a numbered receipt for {formatMoney(minorToMajor(row.amount_minor))}{" "}
            and records you as the settling officer.
          </p>
          <Input
            value={providerRef}
            onChange={(e) => setProviderRef(e.target.value)}
            placeholder="Bank / teller reference (optional)"
          />
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="How were the funds received?"
            required
          />
          <DialogFooter>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ row, disabled }: { row: IntentRow; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const refresh = useRefresh();
  const call = useServerFn(cancelPayment);
  const mut = useMutation({
    mutationFn: () => call({ data: { reference: row.reference, reason } }),
    onSuccess: async () => {
      toast.success(`Cancelled ${row.reference}`);
      setOpen(false);
      setReason("");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          className="border-destructive/40 text-destructive hover:bg-destructive/10"
        >
          <Ban className="mr-1 h-3.5 w-3.5" /> Cancel
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel {row.reference}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length < 5) return toast.error("A reason is required.");
            mut.mutate();
          }}
        >
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why is this cancelled?"
            required
          />
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={mut.isPending}>
              {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cancel payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RefundDialog({ row, disabled }: { row: IntentRow; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(minorToMajor(row.amount_minor)));
  const [reason, setReason] = useState("");
  const refresh = useRefresh();
  const call = useServerFn(requestPaymentRefund);
  const mut = useMutation({
    mutationFn: () => call({ data: { reference: row.reference, amount: Number(amount), reason } }),
    onSuccess: async () => {
      toast.success(`Refund recorded for ${row.reference}`);
      setOpen(false);
      setReason("");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Refund
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refund {row.reference}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const value = Number(amount);
            if (!Number.isFinite(value) || value <= 0)
              return toast.error("Enter a valid refund amount.");
            if (reason.trim().length < 10)
              return toast.error("Explain the refund (min 10 characters).");
            mut.mutate();
          }}
        >
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Reason for refund"
            required
          />
          <DialogFooter>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record refund
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Reconciliation() {
  const [range, setRange] = useState({ date_from: "", date_to: "" });
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "gateway-payments", "recon", range],
    queryFn: () =>
      getPaymentReconciliation({
        data: { date_from: range.date_from || null, date_to: range.date_to || null },
      }),
    staleTime: 5_000,
  });

  const s = data?.summary;
  return (
    <div className="space-y-5 p-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          From
          <Input
            type="date"
            value={range.date_from}
            onChange={(e) => setRange((r) => ({ ...r, date_from: e.target.value }))}
            className="mt-1 h-9 w-36"
          />
        </label>
        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          To
          <Input
            type="date"
            value={range.date_to}
            onChange={(e) => setRange((r) => ({ ...r, date_to: e.target.value }))}
            className="mt-1 h-9 w-36"
          />
        </label>
      </div>

      {isLoading || !s ? (
        <p className="text-sm text-muted-foreground">Loading reconciliation…</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-5">
            <KPIStat
              label="Provider confirmed"
              value={<span className="tabular">{s.provider_confirmed}</span>}
              accent
            />
            <KPIStat
              label="Manually confirmed"
              value={<span className="tabular">{s.manual_confirmed}</span>}
              hint="Cash / bank"
            />
            <KPIStat
              label="Awaiting provider"
              value={<span className="tabular">{s.awaiting_provider}</span>}
            />
            <KPIStat
              label="Unconfigured"
              value={<span className="tabular">{s.unconfigured}</span>}
              hint="Needs credentials"
            />
            <KPIStat label="Failed" value={<span className="tabular">{s.failed}</span>} />
          </div>

          {s.mismatches.length === 0 ? (
            <EmptyState
              title="No mismatches"
              hint="Every payment's status, receipt and settlement agree."
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-amber-500/30">
              <table className="w-full">
                <thead className="bg-amber-500/5">
                  <tr className="text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Reference</th>
                    <th className="px-4 py-2 font-medium">Issue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-500/20">
                  {s.mismatches.map((m) => (
                    <tr key={m.reference}>
                      <td className="px-4 py-2 font-mono text-[11px]">{m.reference}</td>
                      <td className="px-4 py-2 text-sm">{m.issue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
