import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense, useEffect, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, PlayCircle, Save, Sparkles } from "lucide-react";
import { ErrorState, KPIStat, Money, PageHeader, SectionCard, SectionCardSkeleton } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/org-config";
import {
  getInterestSettings,
  runInterestPosting,
  updateInterestSettings,
  type InterestSettings,
} from "@/lib/savings-interest.functions";

const interestQuery = queryOptions({
  queryKey: ["admin", "savings", "interest"],
  queryFn: () => getInterestSettings(),
  staleTime: 15_000,
});

export const Route = createFileRoute("/_admin/admin/savings/interest")({
  component: InterestPage,
  errorComponent: ({ error }) => (
    <div className="p-6"><ErrorState title="Failed to load interest settings" message={error.message} /></div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm text-muted-foreground">Not found.</div>,
});

const BASIS_LABEL: Record<string, string> = {
  closing_balance: "Closing balance",
  average_balance: "Average balance",
  minimum_balance: "Minimum balance",
};

function InterestPage() {
  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Interest rules & posting"
        description="Configure how savings interest is calculated, when it posts, and run or preview an accrual."
        action={
          <Link
            to="/admin/savings"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to savings
          </Link>
        }
      />
      <Suspense fallback={<SectionCardSkeleton title="Interest rules" rows={6} cols={3} />}>
        <Body />
      </Suspense>
    </>
  );
}

function Body() {
  const { data } = useSuspenseQuery(interestQuery);
  const qc = useQueryClient();
  const [form, setForm] = useState<InterestSettings>(data.settings);
  useEffect(() => setForm(data.settings), [data.settings]);

  const save = useServerFn(updateInterestSettings);
  const saveMut = useMutation({
    mutationFn: () =>
      save({
        data: {
          enabled: form.enabled,
          frequency: form.frequency,
          basis: form.basis,
          rounding_dp: Number(form.rounding_dp),
          min_balance_to_earn: Number(form.min_balance_to_earn),
          exclude_held_funds: form.exclude_held_funds,
          rate_source: form.rate_source,
          flat_rate_annual: Number(form.flat_rate_annual),
          min_interest_to_post: Number(form.min_interest_to_post),
        },
      }),
    onSuccess: async () => {
      toast.success("Interest rules saved");
      await qc.invalidateQueries({ queryKey: ["admin", "savings", "interest"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lastRun = data.runs.find((r) => !r.dry_run) ?? null;

  return (
    <div className="space-y-6">
      <section className="grid gap-6 md:grid-cols-3">
        <KPIStat
          label="Accrual status"
          value={form.enabled ? "Enabled" : "Paused"}
          hint={`${form.frequency} · ${BASIS_LABEL[form.basis]}`}
          tone={form.enabled ? "emerald" : "rose"}
        />
        <KPIStat
          label="Rate source"
          value={form.rate_source === "flat" ? `${form.flat_rate_annual}% flat` : "Per savings plan"}
          hint={form.exclude_held_funds ? "Held funds excluded" : "Held funds included"}
        />
        <KPIStat
          label="Last posting"
          value={lastRun ? <Money amount={lastRun.total_interest} /> : "—"}
          hint={lastRun ? `${lastRun.accounts_credited} accounts · ${lastRun.period_start} → ${lastRun.period_end}` : "No posting yet"}
          accent
        />
      </section>

      <SectionCard title="Calculation rules">
        <form
          className="grid gap-5 p-6 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            saveMut.mutate();
          }}
        >
          <div className="flex items-center justify-between rounded-lg border border-border p-4 md:col-span-2">
            <div>
              <p className="text-sm font-medium">Automatic interest accrual</p>
              <p className="text-xs text-muted-foreground">
                When enabled, scheduled runs calculate and post interest to active accounts.
              </p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => setForm({ ...form, enabled: v })}
              aria-label="Enable interest accrual"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Posting frequency</Label>
            <Select value={form.frequency} onValueChange={(v: any) => setForm({ ...form, frequency: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annually">Annually</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Annual rate is pro-rated across the period length.</p>
          </div>

          <div className="space-y-1.5">
            <Label>Balance basis</Label>
            <Select value={form.basis} onValueChange={(v: any) => setForm({ ...form, basis: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="closing_balance">Closing balance</SelectItem>
                <SelectItem value="average_balance">Average balance (opening + closing) / 2</SelectItem>
                <SelectItem value="minimum_balance">Minimum balance in period</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Rate source</Label>
            <Select value={form.rate_source} onValueChange={(v: any) => setForm({ ...form, rate_source: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="plan">Use each savings plan's rate</SelectItem>
                <SelectItem value="flat">Use one flat institutional rate</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="flat-rate">Flat annual rate (%)</Label>
            <Input
              id="flat-rate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              disabled={form.rate_source !== "flat"}
              value={form.flat_rate_annual}
              onChange={(e) => setForm({ ...form, flat_rate_annual: Number(e.target.value) })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="min-balance">Minimum balance to earn</Label>
            <Input
              id="min-balance"
              type="number"
              step="0.01"
              min="0"
              value={form.min_balance_to_earn}
              onChange={(e) => setForm({ ...form, min_balance_to_earn: Number(e.target.value) })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="min-interest">Minimum interest to post</Label>
            <Input
              id="min-interest"
              type="number"
              step="0.01"
              min="0"
              value={form.min_interest_to_post}
              onChange={(e) => setForm({ ...form, min_interest_to_post: Number(e.target.value) })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rounding">Rounding (decimal places)</Label>
            <Input
              id="rounding"
              type="number"
              min="0"
              max="4"
              value={form.rounding_dp}
              onChange={(e) => setForm({ ...form, rounding_dp: Number(e.target.value) })}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-4 md:col-span-2">
            <div>
              <p className="text-sm font-medium">Exclude funds on hold</p>
              <p className="text-xs text-muted-foreground">Active collateral holds are deducted before interest is calculated.</p>
            </div>
            <Switch
              checked={form.exclude_held_funds}
              onCheckedChange={(v) => setForm({ ...form, exclude_held_funds: v })}
              aria-label="Exclude held funds"
            />
          </div>

          <div className="md:col-span-2">
            <Button type="submit" disabled={saveMut.isPending} className="gap-1">
              <Save className="h-3.5 w-3.5" /> {saveMut.isPending ? "Saving…" : "Save rules"}
            </Button>
          </div>
        </form>
      </SectionCard>

      <RunPanel />

      <SectionCard title="Recent runs" accent="gold">
        {data.runs.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No interest runs recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Run at</th>
                  <th className="px-6 py-3 font-medium">Period</th>
                  <th className="px-6 py-3 font-medium">Basis</th>
                  <th className="px-6 py-3 text-right font-medium">Processed</th>
                  <th className="px-6 py-3 text-right font-medium">Credited</th>
                  <th className="px-6 py-3 text-right font-medium">Interest</th>
                  <th className="px-6 py-3 font-medium">Mode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.runs.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-6 py-3 text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-6 py-3">{r.period_start} → {r.period_end}</td>
                    <td className="px-6 py-3 text-muted-foreground">{BASIS_LABEL[r.basis] ?? r.basis}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{r.accounts_processed}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{r.accounts_credited}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{formatMoney(r.total_interest)}</td>
                    <td className="px-6 py-3 text-xs uppercase tracking-wide text-muted-foreground">
                      {r.dry_run ? "Preview" : "Posted"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function RunPanel() {
  const qc = useQueryClient();
  const [periodEnd, setPeriodEnd] = useState("");
  const [note, setNote] = useState("");
  const call = useServerFn(runInterestPosting);

  const mut = useMutation({
    mutationFn: (dry: boolean) => call({ data: { period_end: periodEnd || null, dry_run: dry, note } }),
    onSuccess: async (r) => {
      toast.success(
        `${r.dry_run ? "Preview" : "Posted"}: ${formatMoney(r.total_interest)} across ${r.accounts_credited} of ${r.accounts_processed} accounts (${r.period_start} → ${r.period_end})`,
      );
      await qc.invalidateQueries({ queryKey: ["admin", "savings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const start = (dry: boolean) => {
    if (note.trim().length < 3) {
      toast.error("Provide a note (≥3 characters) for the audit trail.");
      return;
    }
    mut.mutate(dry);
  };

  return (
    <SectionCard title="Run interest posting" accent="emerald">
      <div className="grid gap-4 p-6 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="period-end">Period end (optional)</Label>
          <Input id="period-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Defaults to the end of last month. Statements are idempotent per account and period.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="run-note">Audit note</Label>
          <Textarea
            id="run-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason for this run"
          />
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button variant="outline" className="gap-1" disabled={mut.isPending} onClick={() => start(true)}>
            <Sparkles className="h-3.5 w-3.5" /> Preview (no changes)
          </Button>
          <Button className="gap-1" disabled={mut.isPending} onClick={() => start(false)}>
            <PlayCircle className="h-3.5 w-3.5" /> {mut.isPending ? "Running…" : "Post interest"}
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}
