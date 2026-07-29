import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRightLeft, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSweep, updateSweep, type Sweep } from "@/lib/savings-sweeps.functions";

type Account = { id: string; label: string; balance: number };

/**
 * Create or edit a per-account sweep rule: cadence, amount, minimum balance to
 * keep in the source account, and a cap per run. Cron enforces the same rules.
 */
export function SweepDialog({ accounts, sweep }: { accounts: Account[]; sweep?: Sweep }) {
  const editing = Boolean(sweep);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(sweep?.from_account_id ?? accounts[0]?.id ?? "");
  const [to, setTo] = useState(sweep?.to_account_id ?? accounts[1]?.id ?? "");
  const [amount, setAmount] = useState(sweep ? String(sweep.amount) : "");
  const [minBalance, setMinBalance] = useState(sweep ? String(sweep.min_balance) : "0");
  const [maxAmount, setMaxAmount] = useState(sweep?.max_amount != null ? String(sweep.max_amount) : "");
  const [freq, setFreq] = useState<"daily" | "weekly" | "monthly">(sweep?.frequency ?? "monthly");
  const [dow, setDow] = useState(sweep?.day_of_week ?? 1);
  const [dom, setDom] = useState(sweep?.day_of_month ?? 1);
  const qc = useQueryClient();
  const createFn = useServerFn(createSweep);
  const updateFn = useServerFn(updateSweep);

  const rules = {
    amount: Number(amount),
    min_balance: Number(minBalance || 0),
    max_amount: maxAmount ? Number(maxAmount) : null,
    frequency: freq,
    day_of_week: freq === "weekly" ? dow : null,
    day_of_month: freq === "monthly" ? dom : null,
  };

  const mut = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      if (editing) return await updateFn({ data: { id: sweep!.id, ...rules } });
      return await createFn({ data: { from_account_id: from, to_account_id: to, ...rules } });
    },
    onSuccess: async () => {
      toast.success(editing ? "Sweep rules updated" : "Sweep scheduled");
      setOpen(false);
      if (!editing) setAmount("");
      await qc.invalidateQueries({ queryKey: ["member", "sweeps"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const invalid =
    (!editing && (!from || !to || from === to)) ||
    !amount ||
    Number(amount) <= 0 ||
    Number(minBalance) < 0 ||
    (maxAmount !== "" && Number(maxAmount) <= 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {editing ? (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)} title="Edit sweep rules">
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <Button size="sm" variant="outline" className="gap-1" onClick={() => setOpen(true)} disabled={accounts.length < 2}>
          <ArrowRightLeft className="h-3.5 w-3.5" /> Schedule sweep
        </Button>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit sweep rules" : "Schedule a sweep"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (invalid) return toast.error("Check the amounts and accounts");
            mut.mutate();
          }}
        >
          {editing ? (
            <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {sweep!.from_label} → {sweep!.to_label}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="sw-from">From</Label>
                <select
                  id="sw-from"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="sw-to">To</Label>
                <select
                  id="sw-to"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="sw-amt">Amount per run</Label>
            <Input id="sw-amt" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="sw-min">Keep at least</Label>
              <Input id="sw-min" type="number" min="0" step="0.01" value={minBalance} onChange={(e) => setMinBalance(e.target.value)} />
              <p className="mt-1 text-[10px] text-muted-foreground">Minimum balance to leave in the source account.</p>
            </div>
            <div>
              <Label htmlFor="sw-max">Max per sweep</Label>
              <Input
                id="sw-max"
                type="number"
                min="0"
                step="0.01"
                placeholder="No cap"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
              />
              <p className="mt-1 text-[10px] text-muted-foreground">Optional hard cap on each transfer.</p>
            </div>
          </div>

          <div>
            <Label htmlFor="sw-freq">Frequency</Label>
            <select
              id="sw-freq"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={freq}
              onChange={(e) => setFreq(e.target.value as "daily" | "weekly" | "monthly")}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          {freq === "weekly" ? (
            <div>
              <Label htmlFor="sw-dow">Day of week</Label>
              <select
                id="sw-dow"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={dow}
                onChange={(e) => setDow(Number(e.target.value))}
              >
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
                  <option key={i} value={i}>{d}</option>
                ))}
              </select>
            </div>
          ) : null}
          {freq === "monthly" ? (
            <div>
              <Label htmlFor="sw-dom">Day of month</Label>
              <Input id="sw-dom" type="number" min="1" max="28" value={dom} onChange={(e) => setDom(Number(e.target.value))} />
            </div>
          ) : null}

          <p className="text-[11px] text-muted-foreground">
            Each run transfers the smaller of the amount, the cap, and whatever sits above the minimum balance. If nothing is
            available, the run is skipped and retried on the next schedule.
          </p>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={mut.isPending || invalid}>
              {mut.isPending ? "Saving…" : editing ? "Save rules" : "Schedule sweep"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
