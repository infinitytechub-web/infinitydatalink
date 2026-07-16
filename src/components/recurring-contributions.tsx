import { useState } from "react";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarClock, Pencil, Pause, Play, Trash2, Plus, Repeat } from "lucide-react";
import {
  EmptyState,
  Money,
  SectionCard,
  StatusPill,
} from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createRecurring,
  deleteRecurring,
  listMyRecurring,
  setRecurringStatus,
  updateRecurring,
  type RecurringFrequency,
  type RecurringSchedule,
} from "@/lib/recurring-savings.functions";
import type { SavingsAccount } from "@/lib/savings.functions";

export const recurringQuery = queryOptions({
  queryKey: ["member", "savings", "recurring"],
  queryFn: () => listMyRecurring(),
  staleTime: 15_000,
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function describeSchedule(s: RecurringSchedule) {
  if (s.frequency === "daily") return "Every day";
  if (s.frequency === "weekly")
    return `Every ${WEEKDAYS[s.day_of_week ?? 1]}`;
  return `Monthly on day ${s.day_of_month ?? 1}`;
}

export function RecurringContributionsSection({
  accounts,
}: {
  accounts: SavingsAccount[];
}) {
  const q = useQuery(recurringQuery);
  const [editing, setEditing] = useState<RecurringSchedule | null>(null);
  const [creating, setCreating] = useState(false);
  const activeAccounts = accounts.filter((a) => a.status === "active");

  return (
    <SectionCard
      title="Recurring contributions"
      action={
        activeAccounts.length > 0 ? (
          <Button size="sm" onClick={() => setCreating(true)} className="gap-1">
            <Plus className="h-4 w-4" /> New schedule
          </Button>
        ) : undefined
      }
    >
      {q.isLoading ? (
        <div className="p-6"><Skeleton className="h-24 w-full" /></div>
      ) : activeAccounts.length === 0 ? (
        <div className="p-6">
          <EmptyState title="No active savings account" hint="Open a savings plan first, then automate your deposits." />
        </div>
      ) : (q.data ?? []).length === 0 ? (
        <div className="p-6">
          <EmptyState title="No recurring contributions" hint="Set one up to auto-deposit on a daily, weekly, or monthly schedule." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
                <th className="px-6 py-3 font-medium">Account</th>
                <th className="px-6 py-3 font-medium">Schedule</th>
                <th className="px-6 py-3 text-right font-medium">Amount</th>
                <th className="px-6 py-3 font-medium">Next run</th>
                <th className="px-6 py-3 font-medium">Last run</th>
                <th className="px-6 py-3 text-right font-medium">Status</th>
                <th className="px-6 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-deep/5">
              {(q.data ?? []).map((s) => (
                <ScheduleRow key={s.id} s={s} onEdit={() => setEditing(s)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating ? (
        <ScheduleDialog
          accounts={activeAccounts}
          initial={null}
          onClose={() => setCreating(false)}
        />
      ) : null}
      {editing ? (
        <ScheduleDialog
          accounts={activeAccounts}
          initial={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </SectionCard>
  );
}

function ScheduleRow({ s, onEdit }: { s: RecurringSchedule; onEdit: () => void }) {
  const qc = useQueryClient();
  const setStatus = useServerFn(setRecurringStatus);
  const remove = useServerFn(deleteRecurring);
  const toggle = useMutation({
    mutationFn: () =>
      setStatus({ data: { id: s.id, status: s.status === "active" ? "paused" : "active" } }),
    onSuccess: () => {
      toast.success(s.status === "active" ? "Schedule paused" : "Schedule resumed");
      qc.invalidateQueries({ queryKey: ["member", "savings", "recurring"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: () => remove({ data: { id: s.id } }),
    onSuccess: () => {
      toast.success("Schedule removed");
      qc.invalidateQueries({ queryKey: ["member", "savings", "recurring"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <tr>
      <td className="px-6 py-3">
        <div className="font-medium text-emerald-deep">{s.account_label}</div>
        <div className="text-[11px] text-emerald-deep/50">{s.channel.replace(/_/g, " ")}</div>
      </td>
      <td className="px-6 py-3 text-emerald-deep/70">
        <div className="flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5 text-emerald-mid" />
          {describeSchedule(s)}
        </div>
      </td>
      <td className="px-6 py-3 text-right tabular"><Money amount={s.amount} /></td>
      <td className="px-6 py-3 text-[11px] text-emerald-deep/70">
        {new Date(s.next_run_at).toLocaleString()}
      </td>
      <td className="px-6 py-3 text-[11px] text-emerald-deep/60">
        {s.last_run_at ? (
          <>
            {new Date(s.last_run_at).toLocaleString()}
            {s.last_run_status === "error" ? (
              <div className="text-destructive">{s.last_run_error?.slice(0, 60)}</div>
            ) : s.last_run_status ? (
              <div className="text-emerald-mid">{s.runs_completed} completed</div>
            ) : null}
          </>
        ) : (
          <span className="text-emerald-deep/40">Not yet run</span>
        )}
      </td>
      <td className="px-6 py-3 text-right">
        <span
          className={
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest " +
            (s.status === "active"
              ? "bg-emerald-mid/15 text-emerald-mid"
              : "bg-emerald-deep/10 text-emerald-deep/60")
          }
        >
          {s.status}
        </span>
      </td>
      <td className="px-6 py-3 text-right">
        <div className="inline-flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            title={s.status === "active" ? "Pause" : "Resume"}
            onClick={() => toggle.mutate()}
            disabled={toggle.isPending}
          >
            {s.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button size="icon" variant="ghost" title="Edit" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title="Delete"
            onClick={() => {
              if (confirm("Delete this recurring contribution?")) del.mutate();
            }}
            disabled={del.isPending}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function ScheduleDialog({
  accounts,
  initial,
  onClose,
}: {
  accounts: SavingsAccount[];
  initial: RecurringSchedule | null;
  onClose: () => void;
}) {
  const isEdit = !!initial;
  const [accountId, setAccountId] = useState(initial?.account_id ?? accounts[0]?.id ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [frequency, setFrequency] = useState<RecurringFrequency>(initial?.frequency ?? "monthly");
  const [dow, setDow] = useState(initial?.day_of_week ?? 1);
  const [dom, setDom] = useState(initial?.day_of_month ?? 1);
  const [channel, setChannel] = useState(initial?.channel ?? "mobile_money");
  const [note, setNote] = useState(initial?.note ?? "");

  const qc = useQueryClient();
  const create = useServerFn(createRecurring);
  const update = useServerFn(updateRecurring);
  const mut = useMutation({
    mutationFn: async () => {
      const payload = {
        account_id: accountId,
        amount: Number(amount),
        channel,
        note: note || null,
        frequency,
        day_of_week: frequency === "weekly" ? dow : null,
        day_of_month: frequency === "monthly" ? dom : null,
      };
      if (isEdit) {
        await update({ data: { id: initial!.id, ...payload } });
      } else {
        await create({ data: payload });
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Schedule updated" : "Schedule created");
      qc.invalidateQueries({ queryKey: ["member", "savings", "recurring"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-emerald-mid" />
            {isEdit ? "Edit recurring contribution" : "New recurring contribution"}
          </DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!accountId) return toast.error("Choose an account");
            if (!amount || Number(amount) <= 0) return toast.error("Enter a valid amount");
            mut.mutate();
          }}
        >
          <div>
            <Label htmlFor="rs-acct">Savings account</Label>
            <select
              id="rs-acct"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              disabled={isEdit}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nickname || a.plan_name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rs-amt">Amount</Label>
              <Input
                id="rs-amt"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="rs-freq">Frequency</Label>
              <select
                id="rs-freq"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>
          {frequency === "weekly" ? (
            <div>
              <Label htmlFor="rs-dow">Day of week</Label>
              <select
                id="rs-dow"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={dow}
                onChange={(e) => setDow(Number(e.target.value))}
              >
                {WEEKDAYS.map((w, i) => (
                  <option key={w} value={i}>{w}</option>
                ))}
              </select>
            </div>
          ) : null}
          {frequency === "monthly" ? (
            <div>
              <Label htmlFor="rs-dom">Day of month (1–28)</Label>
              <Input
                id="rs-dom"
                type="number"
                min={1}
                max={28}
                value={dom}
                onChange={(e) => setDom(Number(e.target.value))}
              />
            </div>
          ) : null}
          <div>
            <Label htmlFor="rs-ch">Channel</Label>
            <select
              id="rs-ch"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option value="mobile_money">Mobile money</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
            </select>
          </div>
          <div>
            <Label htmlFor="rs-note">Note (optional)</Label>
            <Textarea id="rs-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={mut.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending ? "Saving…" : isEdit ? "Save changes" : "Create schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
