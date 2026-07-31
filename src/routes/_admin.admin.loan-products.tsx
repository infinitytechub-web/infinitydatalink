import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { EmptyState, ErrorState, PageHeader, SectionCard, SectionCardSkeleton, StatusPill } from "@/components/primitives";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/org-config";
import {
  listLoanProducts,
  setLoanProductActive,
  upsertLoanProduct,
  type LoanProduct,
} from "@/lib/loan-products.functions";

export const Route = createFileRoute("/_admin/admin/loan-products")({
  head: () => ({
    meta: [
      { title: "Loan Products & Eligibility — Admin" },
      { name: "description", content: "Manage the loan product catalogue, pricing, limits and eligibility rules." },
      { property: "og:title", content: "Loan Products & Eligibility" },
      { property: "og:description", content: "Loan product catalogue with limits, pricing and eligibility rules." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoanProductsPage,
  errorComponent: ({ error }) => <PageError error={error} />,
});

function PageError({ error }: { error: Error }) {
  const router = useRouter();
  return (
    <div className="p-6">
      <ErrorState title="Loan products failed to load" message={error.message} onRetry={() => router.invalidate()} />
    </div>
  );
}

const productsQuery = queryOptions({
  queryKey: ["admin", "loan-products", "all"],
  queryFn: () => listLoanProducts({ data: { include_inactive: true } }),
});

const BLANK = {
  code: "",
  name: "",
  description: "",
  min_amount: "500",
  max_amount: "50000",
  min_term_months: "3",
  max_term_months: "36",
  interest_rate: "24",
  processing_fee_pct: "1",
  late_fee_pct: "2",
  late_fee_grace_days: "5",
  max_multiple_of_savings: "3",
  min_savings_balance: "0",
  max_open_loans: "1",
  requires_guarantor: true,
  min_guarantors: "1",
  requires_collateral: false,
  requires_verified_kyc: true,
  active: true,
};
type FormState = typeof BLANK;

function toForm(p: LoanProduct): FormState {
  return {
    code: p.code,
    name: p.name,
    description: p.description ?? "",
    min_amount: String(p.min_amount),
    max_amount: String(p.max_amount),
    min_term_months: String(p.min_term_months),
    max_term_months: String(p.max_term_months),
    interest_rate: String(p.interest_rate),
    processing_fee_pct: String(p.processing_fee_pct),
    late_fee_pct: String(p.late_fee_pct),
    late_fee_grace_days: String(p.late_fee_grace_days),
    max_multiple_of_savings: String(p.max_multiple_of_savings),
    min_savings_balance: String(p.min_savings_balance),
    max_open_loans: String(p.max_open_loans),
    requires_guarantor: p.requires_guarantor,
    min_guarantors: String(p.min_guarantors),
    requires_collateral: p.requires_collateral,
    requires_verified_kyc: p.requires_verified_kyc,
    active: p.active,
  };
}

function LoanProductsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Loan products & eligibility"
        description="Define pricing, limits, late-fee policy and the eligibility rules applied at application time."
      />
      <Suspense fallback={<SectionCardSkeleton title="Product catalogue" rows={5} cols={6} />}>
        <ProductsContent />
      </Suspense>
    </>
  );
}

function ProductsContent() {
  const { data: products } = useSuspenseQuery(productsQuery);
  const [editing, setEditing] = useState<LoanProduct | null>(null);
  const [creating, setCreating] = useState(false);
  const qc = useQueryClient();
  const toggle = useServerFn(setLoanProductActive);

  const toggleMutation = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => toggle({ data: v }),
    onSuccess: () => {
      toast.success("Product updated");
      qc.invalidateQueries({ queryKey: ["admin", "loan-products"] });
      qc.invalidateQueries({ queryKey: ["member", "loan-products"] });
    },
    onError: (e: Error) => toast.error("Update failed", { description: e.message }),
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>New product</Button>
      </div>

      <SectionCard title="Product catalogue" description={`${products.length} products configured`}>
        {products.length === 0 ? (
          <EmptyState title="No loan products" message="Create your first product to enable applications." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Product</th>
                  <th className="py-2 pr-4">Amount range</th>
                  <th className="py-2 pr-4">Term</th>
                  <th className="py-2 pr-4">Rate / fees</th>
                  <th className="py-2 pr-4">Rules</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-t border-border/60 align-top">
                    <td className="py-3 pr-4">
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.code}</div>
                    </td>
                    <td className="py-3 pr-4">
                      {formatMoney(p.min_amount)} – {formatMoney(p.max_amount)}
                    </td>
                    <td className="py-3 pr-4">
                      {p.min_term_months}–{p.max_term_months} mo
                    </td>
                    <td className="py-3 pr-4">
                      <div>{p.interest_rate}% p.a.</div>
                      <div className="text-xs text-muted-foreground">
                        fee {p.processing_fee_pct}% · late {p.late_fee_pct}% after {p.late_fee_grace_days}d
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-xs text-muted-foreground">
                      <div>≤ {p.max_multiple_of_savings}× savings</div>
                      <div>
                        {p.requires_guarantor ? `${p.min_guarantors} guarantor(s)` : "no guarantor"}
                        {p.requires_collateral ? " · collateral" : ""}
                        {p.requires_verified_kyc ? " · KYC" : ""}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <StatusPill status={p.active ? "active" : "retired"} />
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditing(p)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={toggleMutation.isPending}
                          onClick={() => toggleMutation.mutate({ id: p.id, active: !p.active })}
                        >
                          {p.active ? "Retire" : "Activate"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <ProductDialog
        open={creating || editing !== null}
        product={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function ProductDialog({
  open,
  product,
  onClose,
}: {
  open: boolean;
  product: LoanProduct | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(product ? toForm(product) : BLANK);
  const [key, setKey] = useState(product?.id ?? "new");
  const currentKey = product?.id ?? "new";
  if (key !== currentKey) {
    setKey(currentKey);
    setForm(product ? toForm(product) : BLANK);
  }

  const qc = useQueryClient();
  const save = useServerFn(upsertLoanProduct);
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          ...(product ? { id: product.id } : {}),
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
          description: form.description.trim() || null,
          min_amount: Number(form.min_amount),
          max_amount: Number(form.max_amount),
          min_term_months: Number(form.min_term_months),
          max_term_months: Number(form.max_term_months),
          interest_rate: Number(form.interest_rate),
          processing_fee_pct: Number(form.processing_fee_pct),
          late_fee_pct: Number(form.late_fee_pct),
          late_fee_grace_days: Number(form.late_fee_grace_days),
          max_multiple_of_savings: Number(form.max_multiple_of_savings),
          min_savings_balance: Number(form.min_savings_balance),
          max_open_loans: Number(form.max_open_loans),
          requires_guarantor: form.requires_guarantor,
          min_guarantors: Number(form.min_guarantors),
          requires_collateral: form.requires_collateral,
          requires_verified_kyc: form.requires_verified_kyc,
          active: form.active,
        },
      }),
    onSuccess: () => {
      toast.success(product ? "Product updated" : "Product created");
      qc.invalidateQueries({ queryKey: ["admin", "loan-products"] });
      qc.invalidateQueries({ queryKey: ["member", "loan-products"] });
      onClose();
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  const num = (field: keyof FormState, label: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        inputMode="decimal"
        value={String(form[field])}
        onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
      />
    </div>
  );

  const bool = (field: keyof FormState, label: string) => (
    <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
      <Label className="text-xs">{label}</Label>
      <Switch
        checked={Boolean(form[field])}
        onCheckedChange={(v) => setForm((f) => ({ ...f, [field]: v }))}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{product ? `Edit ${product.name}` : "New loan product"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Code</Label>
            <Input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="SALARY"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Description</Label>
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          {num("min_amount", "Min amount")}
          {num("max_amount", "Max amount")}
          {num("min_term_months", "Min term (months)")}
          {num("max_term_months", "Max term (months)")}
          {num("interest_rate", "Interest rate (% p.a.)")}
          {num("processing_fee_pct", "Processing fee (%)")}
          {num("late_fee_pct", "Late fee (% of overdue)")}
          {num("late_fee_grace_days", "Late fee grace (days)")}
          {num("max_multiple_of_savings", "Max multiple of savings")}
          {num("min_savings_balance", "Min savings balance")}
          {num("max_open_loans", "Max open loans")}
          {num("min_guarantors", "Min guarantors")}
          {bool("requires_guarantor", "Requires guarantor")}
          {bool("requires_collateral", "Requires collateral")}
          {bool("requires_verified_kyc", "Requires verified KYC")}
          {bool("active", "Active")}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Saving…" : "Save product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
