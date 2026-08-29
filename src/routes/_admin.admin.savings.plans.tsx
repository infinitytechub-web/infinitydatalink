import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { ErrorState, KPIStat, Money, PageHeader, SectionCard, SectionCardSkeleton } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  createPlan,
  listPlans,
  updatePlan,
  type AdminPlan,
} from "@/lib/admin-savings-plans.functions";

const plansQuery = queryOptions({
  queryKey: ["admin", "savings", "plans"],
  queryFn: () => listPlans(),
  staleTime: 15_000,
});

export const Route = createFileRoute("/_admin/admin/savings/plans")({
  head: () => ({
    meta: [
      { title: "Savings plans — IT-360 CashApp Admin" },
      { name: "description", content: "Create and manage savings plans, rates, and lock periods." },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(plansQuery),
  component: PlansPage,
  errorComponent: ({ error }) => (
    <div className="p-6"><ErrorState title="Plans unavailable" message={error.message} /></div>
  ),
});

function PlansPage() {
  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Savings plans"
        description="Configure plans that members enroll in. Every change is logged to the audit trail."
        action={<CreateDialog />}
      />
      <Suspense fallback={<SectionCardSkeleton title="Plans" rows={5} cols={6} />}>
        <Body />
      </Suspense>
    </>
  );
}

function Body() {
  const { data: plans } = useSuspenseQuery(plansQuery);
  const totalBalance = plans.reduce((s, p) => s + p.total_balance, 0);
  const totalAccounts = plans.reduce((s, p) => s + p.active_accounts, 0);
  return (
    <>
      <section className="grid gap-6 md:grid-cols-3">
        <KPIStat label="Plans" value={<span className="tabular">{plans.length}</span>} hint={`${plans.filter((p) => p.is_active).length} active`} />
        <KPIStat label="Active accounts" value={<span className="tabular">{totalAccounts}</span>} />
        <KPIStat label="Balances managed" value={<Money amount={totalBalance} />} />
      </section>

      <SectionCard title="Plans">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-6 py-3 font-medium">Plan</th>
                <th className="px-6 py-3 font-medium">Schedule</th>
                <th className="px-6 py-3 text-right font-medium">Rate</th>
                <th className="px-6 py-3 text-right font-medium">Min</th>
                <th className="px-6 py-3 text-right font-medium">Contribution</th>
                <th className="px-6 py-3 text-right font-medium">Accounts</th>
                <th className="px-6 py-3 text-right font-medium">Balance</th>
                <th className="px-6 py-3 text-right font-medium">Status</th>
                <th className="px-6 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-deep/5">
              {plans.map((p) => (
                <PlanRow key={p.id} p={p} />
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </>
  );
}

function PlanRow({ p }: { p: AdminPlan }) {
  return (
    <tr>
      <td className="px-6 py-3">
        <div className="font-semibold">{p.name}</div>
        {p.description ? <div className="text-[11px] text-muted-foreground">{p.description}</div> : null}
      </td>
      <td className="px-6 py-3 text-muted-foreground">{p.schedule}</td>
      <td className="tabular px-6 py-3 text-right">{p.interest_rate}%</td>
      <td className="px-6 py-3 text-right"><Money amount={p.min_contribution} /></td>
      <td className="px-6 py-3 text-right"><Money amount={p.contribution_amount} /></td>
      <td className="tabular px-6 py-3 text-right">{p.active_accounts}</td>
      <td className="px-6 py-3 text-right"><Money amount={p.total_balance} /></td>
      <td className="px-6 py-3 text-right">
        <span
          className={
            "rounded-md px-2 py-0.5 text-[11px] " +
            (p.is_active ? "bg-emerald-mid/10 text-emerald-mid" : "bg-muted text-muted-foreground")
          }
        >
          {p.is_active ? "Active" : "Inactive"}
        </span>
      </td>
      <td className="px-6 py-3 text-right">
        <EditDialog p={p} />
      </td>
    </tr>
  );
}

function CreateDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    schedule: "monthly",
    interest_rate: "5",
    description: "",
    min_contribution: "50",
    contribution_amount: "100",
    lock_days: "0",
    sort_order: "10",
  });
  const qc = useQueryClient();
  const call = useServerFn(createPlan);
  const mut = useMutation({
    mutationFn: () =>
      call({
        data: {
          name: form.name,
          schedule: form.schedule,
          interest_rate: Number(form.interest_rate),
          description: form.description || null,
          min_contribution: Number(form.min_contribution),
          contribution_amount: Number(form.contribution_amount),
          lock_days: Number(form.lock_days),
          sort_order: Number(form.sort_order),
          is_active: true,
        },
      }),
    onSuccess: async () => {
      toast.success("Plan created");
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["admin", "savings", "plans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)} className="gap-1"><Plus className="h-4 w-4" /> New plan</Button>
      <DialogContent>
        <DialogHeader><DialogTitle>Create savings plan</DialogTitle></DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.name.trim()) return toast.error("Name required");
            mut.mutate();
          }}
        >
          <div className="sm:col-span-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <Label>Schedule</Label>
            <Input value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} placeholder="monthly" />
          </div>
          <div>
            <Label>Interest rate (% p.a.)</Label>
            <Input type="number" step="0.01" value={form.interest_rate} onChange={(e) => setForm({ ...form, interest_rate: e.target.value })} />
          </div>
          <div>
            <Label>Min contribution</Label>
            <Input type="number" step="0.01" value={form.min_contribution} onChange={(e) => setForm({ ...form, min_contribution: e.target.value })} />
          </div>
          <div>
            <Label>Contribution amount</Label>
            <Input type="number" step="0.01" value={form.contribution_amount} onChange={(e) => setForm({ ...form, contribution_amount: e.target.value })} />
          </div>
          <div>
            <Label>Lock days</Label>
            <Input type="number" value={form.lock_days} onChange={(e) => setForm({ ...form, lock_days: e.target.value })} />
          </div>
          <div>
            <Label>Sort order</Label>
            <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label>Description</Label>
            <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={mut.isPending}>{mut.isPending ? "Creating…" : "Create plan"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ p }: { p: AdminPlan }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: p.name,
    schedule: p.schedule,
    interest_rate: String(p.interest_rate),
    description: p.description ?? "",
    min_contribution: String(p.min_contribution),
    contribution_amount: String(p.contribution_amount),
    lock_days: String(p.lock_days),
    sort_order: String(p.sort_order),
    is_active: p.is_active,
    reason: "",
  });
  const qc = useQueryClient();
  const call = useServerFn(updatePlan);
  const mut = useMutation({
    mutationFn: () =>
      call({
        data: {
          id: p.id,
          name: form.name,
          schedule: form.schedule,
          interest_rate: Number(form.interest_rate),
          description: form.description || null,
          min_contribution: Number(form.min_contribution),
          contribution_amount: Number(form.contribution_amount),
          lock_days: Number(form.lock_days),
          sort_order: Number(form.sort_order),
          is_active: form.is_active,
          reason: form.reason || null,
        },
      }),
    onSuccess: async () => {
      toast.success("Plan updated");
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["admin", "savings", "plans"] });
    },
    onError: (e: Error) => {
      if (e.message === "reason_required_deactivate_with_active_accounts") {
        toast.error("Provide a reason to deactivate a plan with active accounts.");
      } else {
        toast.error(e.message);
      }
    },
  });
  const willDeactivate = p.is_active && !form.is_active;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}><Pencil className="h-3.5 w-3.5" /></Button>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit {p.name}</DialogTitle></DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <div className="sm:col-span-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Schedule</Label>
            <Input value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} />
          </div>
          <div>
            <Label>Interest rate (%)</Label>
            <Input type="number" step="0.01" value={form.interest_rate} onChange={(e) => setForm({ ...form, interest_rate: e.target.value })} />
          </div>
          <div>
            <Label>Min contribution</Label>
            <Input type="number" step="0.01" value={form.min_contribution} onChange={(e) => setForm({ ...form, min_contribution: e.target.value })} />
          </div>
          <div>
            <Label>Contribution amount</Label>
            <Input type="number" step="0.01" value={form.contribution_amount} onChange={(e) => setForm({ ...form, contribution_amount: e.target.value })} />
          </div>
          <div>
            <Label>Lock days</Label>
            <Input type="number" value={form.lock_days} onChange={(e) => setForm({ ...form, lock_days: e.target.value })} />
          </div>
          <div>
            <Label>Sort order</Label>
            <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label>Description</Label>
            <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3 sm:col-span-2">
            <div>
              <div className="text-sm font-medium">Active</div>
              <div className="text-[11px] text-muted-foreground">Inactive plans hide from member enrollment.</div>
            </div>
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          </div>
          {willDeactivate && p.active_accounts > 0 ? (
            <div className="sm:col-span-2">
              <Label>Deactivation reason ({p.active_accounts} active accounts)</Label>
              <Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </div>
          ) : null}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={mut.isPending}>{mut.isPending ? "Saving…" : "Save changes"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
