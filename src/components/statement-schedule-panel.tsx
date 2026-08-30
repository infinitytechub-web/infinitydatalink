import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Mail, MessageSquare, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, SectionCard, StatusPill } from "@/components/primitives";
import {
  MEMBER_DATASET_LABELS,
  MEMBER_REPORT_DATASETS,
  type MemberReportDataset,
} from "@/lib/member-reports.shared";
import {
  FREQUENCY_LABELS,
  STATEMENT_FREQUENCIES,
  type StatementFrequency,
} from "@/lib/statement-schedules.shared";
import {
  deleteMyStatementSchedule,
  listMyStatementSchedules,
  saveMyStatementSchedule,
  sendMyStatementNow,
  setMyStatementScheduleActive,
} from "@/lib/statement-schedules.functions";

/** Member-facing scheduling and delivery controls for statements. */
export function StatementSchedulePanel({ dataset }: { dataset: MemberReportDataset }) {
  const qc = useQueryClient();
  const list = useServerFn(listMyStatementSchedules);
  const save = useServerFn(saveMyStatementSchedule);
  const toggle = useServerFn(setMyStatementScheduleActive);
  const remove = useServerFn(deleteMyStatementSchedule);
  const sendNow = useServerFn(sendMyStatementNow);

  const [form, setForm] = useState<{
    dataset: MemberReportDataset;
    frequency: StatementFrequency;
    email: boolean;
    sms: boolean;
  }>({ dataset, frequency: "monthly", email: true, sms: false });

  const query = useQuery({
    queryKey: ["member", "statement-schedules"],
    queryFn: () => list({}),
    staleTime: 15_000,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["member", "statement-schedules"] });

  const saveMutation = useMutation({
    mutationFn: () => save({ data: { ...form, active: true } }),
    onSuccess: () => {
      toast.success("Schedule saved");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => sendNow({ data: { id } }),
    onSuccess: (r) => {
      if (r.status === "sent") toast.success(`Statement queued · ${r.rows} record(s)`);
      else if (r.status === "skipped") toast.info("This period was already delivered");
      else toast.error(r.error ?? "Delivery failed");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const schedules = query.data?.schedules ?? [];
  const runs = query.data?.runs ?? [];

  return (
    <SectionCard title="Scheduled statements">
      <div className="grid gap-3 border-b border-emerald-deep/10 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Statement
          <select
            value={form.dataset}
            onChange={(e) => setForm((f) => ({ ...f, dataset: e.target.value as MemberReportDataset }))}
            className="mt-1 w-full rounded border border-emerald-deep/15 bg-card px-2 py-1.5 text-sm text-foreground"
          >
            {MEMBER_REPORT_DATASETS.map((d) => (
              <option key={d} value={d}>
                {MEMBER_DATASET_LABELS[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Frequency
          <select
            value={form.frequency}
            onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as StatementFrequency }))}
            className="mt-1 w-full rounded border border-emerald-deep/15 bg-card px-2 py-1.5 text-sm text-foreground"
          >
            {STATEMENT_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {FREQUENCY_LABELS[f]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-4 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.checked }))}
            />
            <Mail className="h-3.5 w-3.5" /> Email
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.sms}
              onChange={(e) => setForm((f) => ({ ...f, sms: e.target.checked }))}
            />
            <MessageSquare className="h-3.5 w-3.5" /> SMS
          </label>
        </div>
        <div className="flex items-end">
          <Button
            size="sm"
            className="gap-1"
            disabled={saveMutation.isPending || (!form.email && !form.sms)}
            onClick={() => saveMutation.mutate()}
          >
            <CalendarClock className="h-3.5 w-3.5" /> Save schedule
          </Button>
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
          Delivery follows your notification preferences — if email or SMS is switched off there, that
          channel is skipped and the run is marked accordingly.
        </p>
      </div>

      {query.isPending ? (
        <Skeleton className="m-4 h-24" />
      ) : schedules.length === 0 ? (
        <EmptyState title="No schedules yet" hint="Pick a statement and frequency above to start automatic delivery." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-emerald-deep/10 text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Statement</th>
                <th className="px-4 py-3 text-left font-medium">Frequency</th>
                <th className="px-4 py-3 text-left font-medium">Channels</th>
                <th className="px-4 py-3 text-left font-medium">Next run</th>
                <th className="px-4 py-3 text-left font-medium">Last run</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id} className="border-b border-emerald-deep/5 last:border-0">
                  <td className="px-4 py-2.5">{MEMBER_DATASET_LABELS[s.dataset]}</td>
                  <td className="px-4 py-2.5">{FREQUENCY_LABELS[s.frequency]}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {[s.email ? "Email" : null, s.sms ? "SMS" : null].filter(Boolean).join(" · ") || "In-app only"}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {s.active ? new Date(s.next_run_at).toLocaleString() : "Paused"}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {s.last_run_at ? (
                      <span className="flex items-center gap-2">
                        {new Date(s.last_run_at).toLocaleDateString()}
                        <StatusPill status={s.last_status ?? "pending"} />
                      </span>
                    ) : (
                      "—"
                    )}
                    {s.last_error ? (
                      <span className="block text-[11px] text-destructive">{s.last_error}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        disabled={sendMutation.isPending}
                        onClick={() => sendMutation.mutate(s.id)}
                      >
                        <Send className="h-3.5 w-3.5" /> Send now
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          void toggle({ data: { id: s.id, active: !s.active } }).then(invalidate);
                        }}
                      >
                        {s.active ? "Pause" : "Resume"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1 text-destructive"
                        onClick={() => {
                          void remove({ data: { id: s.id } }).then(() => {
                            toast.success("Schedule removed");
                            invalidate();
                          });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {runs.length > 0 ? (
        <div className="border-t border-emerald-deep/10 p-4">
          <h4 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Recent deliveries
          </h4>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {runs.slice(0, 8).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">
                  {r.period_start} → {r.period_end}
                </span>
                <span>{r.row_count} record(s)</span>
                <span>{r.channels.length > 0 ? r.channels.join(", ") : "in-app"}</span>
                <StatusPill status={r.status} />
                {r.error ? <span className="text-destructive">{r.error}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </SectionCard>
  );
}
