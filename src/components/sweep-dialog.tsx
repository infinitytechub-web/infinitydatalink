import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSweep } from "@/lib/savings-sweeps.functions";

export function SweepDialog({
  accounts,
}: {
  accounts: Array<{ id: string; label: string; balance: number }>;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(accounts[0]?.id ?? "");
  const [to, setTo] = useState(accounts[1]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [freq, setFreq] = useState<"daily" | "weekly" | "monthly">("monthly");
  const [dow, setDow] = useState(1);
  const [dom, setDom] = useState(1);
  const qc = useQueryClient();
  const call = useServerFn(createSweep);

  const mut = useMutation({
    mutationFn: () =>
      call({
        data: {
          from_account_id: from,
          to_account_id: to,
          amount: Number(amount),
          frequency: freq,
          day_of_week: freq === "weekly" ? dow : null,
          day_of_month: freq === "monthly" ? dom : null,
        },
      }),
    onSuccess: async () => {
      toast.success("Sweep scheduled");
      setOpen(false);
      setAmount("");
      await qc.invalidateQueries({ queryKey: ["member", "sweeps"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const invalid = !from || !to || from === to || !amount || Number(amount) <= 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" className="gap-1" onClick={() => setOpen(true)} disabled={accounts.length < 2}>
        <ArrowRightLeft className="h-3.5 w-3.5" /> Schedule sweep
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule a sweep</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (invalid) return toast.error("Fill all fields");
            mut.mutate();
          }}
        >
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
          <div>
            <Label htmlFor="sw-amt">Amount</Label>
            <Input id="sw-amt" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="sw-freq">Frequency</Label>
            <select
              id="sw-freq"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={freq}
              onChange={(e) => setFreq(e.target.value as any)}
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
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={mut.isPending || invalid}>
              {mut.isPending ? "Scheduling…" : "Schedule sweep"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
