import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { applyForLoan } from "@/lib/member-data.functions";
import { checkMyLoanEligibility, listLoanProducts } from "@/lib/loan-products.functions";

const Schema = z.object({
  product: z.string().min(2, "Select a product"),
  product_id: z.string().uuid().optional(),
  amount: z.number().positive("Amount must be greater than 0"),
  term_months: z.number().int().min(1, "Enter a term").max(360),
  purpose: z.string().max(1000).optional(),
});

const ghs = (n: number) =>
  `GH₵${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function LoanApplicationDialog({
  trigger,
  defaultAmount,
  defaultTermMonths,
}: {
  trigger: React.ReactNode;
  /** Pre-fills the form, e.g. from the loan calculator. */
  defaultAmount?: number;
  defaultTermMonths?: number;
}) {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState<string>("");
  const [amount, setAmount] = useState<string>(defaultAmount && defaultAmount > 0 ? String(defaultAmount) : "");
  const [term, setTerm] = useState<string>(defaultTermMonths ? String(defaultTermMonths) : "12");
  const [purpose, setPurpose] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const qc = useQueryClient();
  const apply = useServerFn(applyForLoan);
  const fetchProducts = useServerFn(listLoanProducts);
  const checkEligibility = useServerFn(checkMyLoanEligibility);

  const productsQuery = useQuery({
    queryKey: ["member", "loan-products"],
    queryFn: () => fetchProducts({ data: {} }),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const products = productsQuery.data ?? [];

  // Default to the first active product once the catalogue loads.
  useEffect(() => {
    if (!productId && products.length > 0) setProductId(products[0]!.id);
  }, [products, productId]);

  const product = useMemo(() => products.find((p) => p.id === productId) ?? null, [products, productId]);

  const amountNum = Number(amount);
  const termNum = Number(term);
  const inputsValid =
    !!productId && Number.isFinite(amountNum) && amountNum > 0 && Number.isInteger(termNum) && termNum >= 1;

  // Debounce so typing an amount doesn't fire a request per keystroke.
  const [debounced, setDebounced] = useState({ amount: 0, term: 0 });
  useEffect(() => {
    const t = setTimeout(() => setDebounced({ amount: amountNum, term: termNum }), 400);
    return () => clearTimeout(t);
  }, [amountNum, termNum]);

  const eligibility = useQuery({
    queryKey: ["member", "loan-eligibility", productId, debounced.amount, debounced.term],
    queryFn: () =>
      checkEligibility({
        data: { product_id: productId, amount: debounced.amount, term_months: debounced.term },
      }),
    enabled:
      open && !!productId && debounced.amount > 0 && Number.isInteger(debounced.term) && debounced.term >= 1,
    staleTime: 30_000,
  });

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
      product: product?.name ?? "",
      product_id: productId || undefined,
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
    if (product) {
      const es: Record<string, string> = {};
      if (parsed.data.amount < product.min_amount || parsed.data.amount > product.max_amount) {
        es.amount = `Enter between ${ghs(product.min_amount)} and ${ghs(product.max_amount)}`;
      }
      if (
        parsed.data.term_months < product.min_term_months ||
        parsed.data.term_months > product.max_term_months
      ) {
        es.term_months = `Term must be ${product.min_term_months}–${product.max_term_months} months`;
      }
      if (Object.keys(es).length > 0) {
        setErrors(es);
        return;
      }
    }
    setErrors({});
    mutation.mutate(parsed.data);
  }

  const verdict = eligibility.data;
  const blocked = !!verdict && !verdict.eligible;

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
            <Select value={productId} onValueChange={setProductId} disabled={productsQuery.isLoading}>
              <SelectTrigger>
                <SelectValue placeholder={productsQuery.isLoading ? "Loading products…" : "Select a product"} />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {p.interest_rate}% p.a.
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {products.length === 0 && !productsQuery.isLoading && (
              <p className="text-xs text-muted-foreground">No loan products are currently open for applications.</p>
            )}
            {product?.description && <p className="text-xs text-muted-foreground">{product.description}</p>}
            {product && (
              <p className="text-xs text-muted-foreground">
                {ghs(product.min_amount)}–{ghs(product.max_amount)} · {product.min_term_months}–
                {product.max_term_months} months · processing fee {product.processing_fee_pct}%
              </p>
            )}
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

          {/* Eligibility preview — advisory; the server re-checks on submit. */}
          {inputsValid && (
            <div className="rounded-md border border-border/70 bg-muted/30 p-3 text-xs">
              {eligibility.isPending ? (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking eligibility…
                </p>
              ) : eligibility.isError ? (
                <p className="text-destructive">Could not check eligibility right now. You can still submit.</p>
              ) : verdict ? (
                <div className="space-y-2">
                  <p
                    className={`flex items-center gap-2 font-semibold ${
                      verdict.eligible ? "text-emerald-mid" : "text-destructive"
                    }`}
                  >
                    {verdict.eligible ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                    {verdict.eligible ? "Eligible for this request" : "Not eligible yet"}
                  </p>
                  {verdict.reasons.length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                      {verdict.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  )}
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                    <div className="flex justify-between">
                      <dt>Savings balance</dt>
                      <dd className="font-medium text-foreground">{ghs(verdict.savings_balance)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Max eligible</dt>
                      <dd className="font-medium text-foreground">{ghs(verdict.max_eligible_amount)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Interest rate</dt>
                      <dd className="font-medium text-foreground">{verdict.interest_rate}% p.a.</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Processing fee</dt>
                      <dd className="font-medium text-foreground">{ghs(verdict.processing_fee)}</dd>
                    </div>
                  </dl>
                  {(verdict.requires_guarantor || verdict.requires_collateral) && (
                    <p className="text-muted-foreground">
                      Requires{" "}
                      {verdict.requires_guarantor
                        ? `${verdict.min_guarantors} guarantor${verdict.min_guarantors === 1 ? "" : "s"}`
                        : ""}
                      {verdict.requires_guarantor && verdict.requires_collateral ? " and " : ""}
                      {verdict.requires_collateral ? "collateral" : ""} before disbursement.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Purpose (optional)</Label>
            <Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={3} placeholder="Briefly describe the intended use" />
            {errors.purpose && <p className="text-xs text-destructive">{errors.purpose}</p>}
          </div>
          <DialogFooter>
            <button
              type="submit"
              disabled={mutation.isPending || blocked || products.length === 0}
              className="rounded bg-emerald-deep px-4 py-2 text-xs font-bold uppercase tracking-widest text-cream hover:bg-emerald-mid disabled:opacity-60"
            >
              {mutation.isPending ? "Submitting…" : blocked ? "Not eligible" : "Submit application"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
