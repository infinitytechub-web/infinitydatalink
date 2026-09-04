import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/org-config";
import { submitMyLoanRepayment } from "@/lib/member-repayments.functions";

const CHANNELS = [
  { value: "mobile_money", label: "Mobile money" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card", label: "Card" },
  { value: "cash", label: "Cash at branch" },
] as const;

type Props = {
  loanId: string;
  loanRef: string;
  suggestedAmount: number | null;
  maxAmount: number;
  triggerLabel?: string;
  triggerClassName?: string;
};

export function LoanRepaymentDialog({
  loanId,
  loanRef,
  suggestedAmount,
  maxAmount,
  triggerLabel = "Make a payment",
  triggerClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(
    suggestedAmount && suggestedAmount > 0 ? suggestedAmount.toFixed(2) : "",
  );
  const [channel, setChannel] = useState<string>("mobile_money");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();
  const submit = useServerFn(submitMyLoanRepayment);

  const mutation = useMutation({
    mutationFn: () =>
      submit({
        data: {
          loan_id: loanId,
          amount: Number(amount),
          channel: channel as (typeof CHANNELS)[number]["value"],
          reference: reference.trim() || undefined,
          note: note.trim() || undefined,
        },
      }),
    onSuccess: (txn) => {
      toast.success("Payment submitted", {
        description: `${formatMoney(Number(txn?.amount ?? amount))} is awaiting confirmation (${txn?.ref ?? ""}).`,
      });
      setOpen(false);
      setReference("");
      setNote("");
      void queryClient.invalidateQueries({ queryKey: ["member"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const numeric = Number(amount);
  const invalid = !Number.isFinite(numeric) || numeric <= 0 || numeric > maxAmount + 0.01;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className={triggerClassName}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay towards {loanRef}</DialogTitle>
          <DialogDescription>
            Balance still owed: {formatMoney(maxAmount)}. Your payment is recorded straight away and
            allocated to your schedule once staff confirm it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="repay-amount">Amount</Label>
            <Input
              id="repay-amount"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {invalid && amount !== "" ? (
              <p className="text-xs text-destructive">
                Enter an amount between {formatMoney(0.01)} and {formatMoney(maxAmount)}.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="repay-channel">How are you paying?</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger id="repay-channel">
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
            <Label htmlFor="repay-reference">Transaction reference (optional)</Label>
            <Input
              id="repay-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. MoMo ID"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="repay-note">Note (optional)</Label>
            <Textarea
              id="repay-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={invalid || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Submitting…" : "Submit payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
