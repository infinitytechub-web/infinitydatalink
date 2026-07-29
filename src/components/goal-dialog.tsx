import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setGoal, clearGoal } from "@/lib/savings-goals.functions";

export function GoalDialog({
  accountId,
  currentAmount,
  currentDate,
}: {
  accountId: string;
  currentAmount: number | null;
  currentDate: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(currentAmount ? String(currentAmount) : "");
  const [date, setDate] = useState(currentDate ?? "");
  const qc = useQueryClient();
  const setFn = useServerFn(setGoal);
  const clearFn = useServerFn(clearGoal);

  const save = useMutation({
    mutationFn: () =>
      setFn({ data: { account_id: accountId, goal_amount: Number(amount), goal_target_date: date || null } }),
    onSuccess: async () => {
      toast.success("Goal saved");
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["member", "savings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const clear = useMutation({
    mutationFn: () => clearFn({ data: { account_id: accountId } }),
    onSuccess: async () => {
      toast.success("Goal cleared");
      setOpen(false);
      setAmount("");
      setDate("");
      await qc.invalidateQueries({ queryKey: ["member", "savings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="gap-1">
        <Target className="h-3.5 w-3.5" /> {currentAmount ? "Edit goal" : "Set goal"}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Savings goal</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!amount || Number(amount) <= 0) return toast.error("Enter a valid target amount");
            save.mutate();
          }}
        >
          <div>
            <Label htmlFor="g-amt">Target amount</Label>
            <Input id="g-amt" type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="g-dt">Target date (optional)</Label>
            <Input id="g-dt" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <p className="mt-1 text-[11px] text-muted-foreground">
              We'll notify you at 25%, 50%, 75% and 100% progress.
            </p>
          </div>
          <DialogFooter className="flex justify-between gap-2 sm:justify-between">
            {currentAmount ? (
              <Button type="button" variant="ghost" onClick={() => clear.mutate()} disabled={clear.isPending}>
                Remove goal
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save goal"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
