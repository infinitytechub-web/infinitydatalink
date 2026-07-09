import { useState } from "react";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { applyForLoan } from "@/lib/member-data.functions";

const PRODUCTS = [
  "Business Expansion",
  "Home Improvement",
  "Education",
  "Emergency",
  "Auto",
];

const Schema = z.object({
  product: z.string().min(2, "Select a product"),
  amount: z.number({ invalid_type_error: "Enter an amount" }).positive("Amount must be greater than 0"),
  term_months: z.number({ invalid_type_error: "Enter a term" }).int().min(1).max(360),
  purpose: z.string().max(1000).optional(),
});

export function LoanApplicationDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [product, setProduct] = useState<string>(PRODUCTS[0]);
  const [amount, setAmount] = useState<string>("");
  const [term, setTerm] = useState<string>("12");
  const [purpose, setPurpose] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const qc = useQueryClient();
  const apply = useServerFn(applyForLoan);
  const mutation = useMutation({
    mutationFn: (input: z.infer<typeof Schema>) => apply({ data: input }),
    onSuccess: (loan) => {
      toast.success(`Loan application submitted`, { description: `Reference ${loan.ref} · pending review.` });
      qc.invalidateQueries({ queryKey: ["member", "loans"] });
      qc.invalidateQueries({ queryKey: ["member", "summary"] });
      setOpen(false);
      setAmount("");
      setTerm("12");
      setPurpose("");
      setErrors({});
    },
    onError: (err: Error) => toast.error("Application failed", { description: err.message }),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Schema.safeParse({
      product,
      amount: Number(amount),
      term_months: Number(term),
      purpose: purpose.trim() || undefined,
    });
    if (!parsed.success) {
      const es: Record<string, string> = {};
      for (const issue of parsed.error.issues) es[issue.path[0] as string] = issue.message;
      setErrors(es);
      return;
    }
    setErrors({});
    mutation.mutate(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl text-emerald-deep">Apply for a loan</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Product</Label>
            <Select value={product} onValueChange={setProduct}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRODUCTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            {errors.product && <p className="text-xs text-destructive">{errors.product}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount (GH₵)</Label>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10000" />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Term (months)</Label>
              <Input inputMode="numeric" value={term} onChange={(e) => setTerm(e.target.value)} />
              {errors.term_months && <p className="text-xs text-destructive">{errors.term_months}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Purpose (optional)</Label>
            <Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={3} placeholder="Briefly describe the intended use" />
            {errors.purpose && <p className="text-xs text-destructive">{errors.purpose}</p>}
          </div>
          <DialogFooter>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded bg-emerald-deep px-4 py-2 text-xs font-bold uppercase tracking-widest text-cream hover:bg-emerald-mid disabled:opacity-60"
            >
              {mutation.isPending ? "Submitting…" : "Submit application"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
