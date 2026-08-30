import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BanknoteArrowDown, History as HistoryIcon, Lock, XCircle } from "lucide-react";
import { EmptyState, Money, SectionCard, StatusPill } from "@/components/primitives";
import { WithdrawalTimeline } from "@/components/withdrawal-timeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  cancelWithdrawalRequest,
  createWithdrawalRequest,
  getMyWithdrawals,
  type WithdrawalStatus,
} from "@/lib/withdrawals.functions";

const CHANNELS = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "cash", label: "Cash at branch" },
  { value: "cheque", label: "Cheque" },
];

const ERROR_TEXT: Record<string, string> = {
  reason_required: "Give a reason of at least 5 characters.",
  account_not_owned: "That account does not belong to you.",
  account_not_active: "This account is not active.",
  below_min_amount: "Amount is below the minimum withdrawal.",
  above_max_amount: "Amount is above the maximum withdrawal.",
  daily_limit_exceeded: "This exceeds your daily withdrawal limit.",
  insufficient_available_balance:
    "Not enough available balance — funds may be held by another request.",
  request_not_cancellable: "Only pending requests can be cancelled.",
};

function friendly(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err);
  for (const key of Object.keys(ERROR_TEXT)) if (raw.includes(key)) return ERROR_TEXT[key];
  return raw;
}

function pillStatus(status: WithdrawalStatus) {
  if (status === "paid") return "cleared" as const;
  if (status === "cancelled") return "closed" as const;
  if (status === "approved") return "approved" as const;
  if (status === "rejected") return "rejected" as const;
  return "pending" as const;
}

export function WithdrawalRequestsSection({
  accounts,
}: {
  accounts: Array<{ id: string; label: string; balance: number }>;
}) {
  const qc = useQueryClient();
  const load = useServerFn(getMyWithdrawals);
  const create = useServerFn(createWithdrawalRequest);
  const cancel = useServerFn(cancelWithdrawalRequest);

  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [channel, setChannel] = useState("bank_transfer");
  const [reason, setReason] = useState("");

  const query = useQuery({
    queryKey: ["member", "withdrawals"],
    queryFn: () => load(),
    staleTime: 15_000,
  });

  const holds = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of query.data?.holds ?? []) m.set(h.account_id, h.held);
    return m;
  }, [query.data]);

  const selected = accounts.find((a) => a.id === accountId);
  const available = selected ? selected.balance - (holds.get(selected.id) ?? 0) : 0;

  const [cancelTarget, setCancelTarget] = useState<{ id: string; ref: string } | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["member", "withdrawals"] });
    qc.invalidateQueries({ queryKey: ["member", "savings"] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          account_id: accountId,
          amount: Number(amount),
          channel,
          reason: reason.trim(),
        },
      }),
    onSuccess: (res) => {
      toast.success(`Withdrawal request ${res.ref} submitted for review`);
      setOpen(false);
      setAmount("");
      setReason("");
      invalidate();
    },
    onError: (e) => toast.error(friendly(e)),
  });

  const cancelMutation = useMutation({
    mutationFn: (vars: { id: string; reason: string }) =>
      cancel({ data: { id: vars.id, reason: vars.reason } }),
    onSuccess: () => {
      toast.success("Request cancelled");
      setCancelTarget(null);
      setCancelReason("");
      invalidate();
    },
    onError: (e) => toast.error(friendly(e)),
  });

  const settings = query.data?.settings;
  const canSubmit =
    accountId.length > 0 &&
    Number(amount) > 0 &&
    reason.trim().length >= 5 &&
    !createMutation.isPending;

  return (
    <SectionCard
      title="Withdrawal requests"
      accent="amber"
      action={
        <Button size="sm" onClick={() => setOpen(true)} disabled={accounts.length === 0}>
          <BanknoteArrowDown className="mr-2 size-4" /> Request withdrawal
        </Button>
      }
    >
      <div className="px-6 py-5">
        {settings ? (
          <p className="mb-4 text-xs text-muted-foreground">
            Limits: min <Money amount={settings.min_amount} /> · max{" "}
            <Money amount={settings.max_amount} /> per request · daily cap{" "}
            <Money amount={settings.daily_limit} />. Pending and approved requests place a hold on
            your balance until they are paid out.
          </p>
        ) : null}

        {query.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : query.isError ? (
          <p className="text-sm text-destructive">{friendly(query.error)}</p>
        ) : (query.data?.requests.length ?? 0) === 0 ? (
          <EmptyState
            icon={<BanknoteArrowDown className="size-5" />}
            title="No withdrawal requests yet"
            hint="Request a payout and a finance officer will review it."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-4 font-semibold">Reference</th>
                  <th className="py-2 pr-4 font-semibold">Account</th>
                  <th className="py-2 pr-4 font-semibold">Amount</th>
                  <th className="py-2 pr-4 font-semibold">Channel</th>
                  <th className="py-2 pr-4 font-semibold">Status</th>
                  <th className="py-2 pr-4 font-semibold">Requested</th>
                  <th className="py-2 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {(query.data?.requests ?? []).map((r) => (
                  <Fragment key={r.id}>
                    <tr>
                      <td className="py-3 pr-4 font-mono text-xs">{r.ref}</td>
                      <td className="py-3 pr-4">{r.account_label}</td>
                      <td className="py-3 pr-4 font-semibold">
                        <Money amount={r.amount} />
                      </td>
                      <td className="py-3 pr-4 capitalize">{r.channel.replace(/_/g, " ")}</td>
                      <td className="py-3 pr-4">
                        <StatusPill status={pillStatus(r.status)} />
                        {r.status === "rejected" && r.rejection_reason ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {r.rejection_reason}
                          </span>
                        ) : null}
                        {r.status === "cancelled" && r.cancellation_reason ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {r.cancelled_by_role && r.cancelled_by_role !== "member"
                              ? `Cancelled by staff: `
                              : ""}
                            {r.cancellation_reason}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-expanded={expanded === r.id}
                            aria-controls={`wd-timeline-${r.id}`}
                            onClick={() => setExpanded((cur) => (cur === r.id ? null : r.id))}
                          >
                            <HistoryIcon className="mr-1 size-4" />
                            {expanded === r.id ? "Hide timeline" : "Timeline"}
                          </Button>
                          {r.status === "pending" ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setCancelReason("");
                                setCancelTarget({ id: r.id, ref: r.ref });
                              }}
                              disabled={cancelMutation.isPending}
                            >
                              <XCircle className="mr-1 size-4" /> Cancel
                            </Button>
                          ) : r.status === "approved" ? (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Lock className="size-3" /> Awaiting payout
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {expanded === r.id ? (
                      <tr id={`wd-timeline-${r.id}`}>
                        <td colSpan={7} className="bg-muted/30 px-4 py-4">
                          <WithdrawalTimeline request={r} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request a withdrawal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selected ? (
                <p className="text-xs text-muted-foreground">
                  Balance <Money amount={selected.balance} /> · available{" "}
                  <Money amount={Math.max(0, available)} />
                  {holds.get(selected.id) ? (
                    <>
                      {" "}
                      (<Money amount={holds.get(selected.id)!} /> held)
                    </>
                  ) : null}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="wd-amount">Amount</Label>
              <Input
                id="wd-amount"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label>Payout channel</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wd-reason">Reason</Label>
              <Textarea
                id="wd-reason"
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why do you need this withdrawal? (min 5 characters)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={!canSubmit}>
              {createMutation.isPending ? "Submitting…" : "Submit request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cancelTarget !== null}
        onOpenChange={(o) => {
          if (!o) setCancelTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel withdrawal {cancelTarget?.ref}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="wd-cancel-reason">Why are you cancelling? (required)</Label>
            <Textarea
              id="wd-cancel-reason"
              value={cancelReason}
              maxLength={500}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. No longer needed — min 5 characters"
            />
            <p className="text-xs text-muted-foreground">
              The reason and timestamp are recorded on the request timeline.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelTarget(null)}>
              Keep request
            </Button>
            <Button
              variant="destructive"
              disabled={cancelReason.trim().length < 5 || cancelMutation.isPending}
              onClick={() =>
                cancelTarget &&
                cancelMutation.mutate({ id: cancelTarget.id, reason: cancelReason.trim() })
              }
            >
              {cancelMutation.isPending ? "Cancelling…" : "Cancel request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
