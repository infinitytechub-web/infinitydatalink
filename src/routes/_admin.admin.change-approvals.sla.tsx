import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useEffect, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Loader2, PlayCircle, Save } from "lucide-react";
import { toast } from "sonner";
import { SectionCard, SectionCardSkeleton } from "@/components/primitives";
import { SLA_CHANNELS, SLA_ROLES } from "@/lib/change-sla.functions";
import {
  getChangeSlaSettings,
  runChangeSlaRemindersNow,
  updateChangeSlaSettings,
} from "@/lib/change-sla.functions";
import type { ChangeSlaChannel, ChangeSlaSettings } from "@/lib/change-sla";
import { SLA_STAGE_LABELS } from "@/lib/change-sla";

export const Route = createFileRoute("/_admin/admin/change-approvals/sla")({
  component: SlaPage,
});

const settingsQuery = queryOptions({
  queryKey: ["change-sla-settings"],
  queryFn: () => getChangeSlaSettings(),
});

function SlaPage() {
  return (
    <Suspense fallback={<SectionCardSkeleton title="SLA reminders" rows={6} cols={2} />}>
      <Content />
    </Suspense>
  );
}

function toggleIn<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function Content() {
  const { data } = useSuspenseQuery(settingsQuery);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ChangeSlaSettings>(data.settings);

  useEffect(() => setForm(data.settings), [data.settings]);

  const readOnly = !data.canManage;

  const save = useMutation({
    mutationFn: () =>
      updateChangeSlaSettings({
        data: {
          enabled: form.enabled,
          warn_after_hours: form.warn_after_hours,
          breach_after_hours: form.breach_after_hours,
          repeat_hours: form.repeat_hours,
          channels: form.channels,
          notify_roles: form.notify_roles,
          escalate_roles: form.escalate_roles,
          notify_requester: form.notify_requester,
        },
      }),
    onSuccess: async () => {
      toast.success("SLA reminder settings saved");
      await queryClient.invalidateQueries({ queryKey: ["change-sla-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["change-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runNow = useMutation({
    mutationFn: () => runChangeSlaRemindersNow(),
    onSuccess: (r) => {
      if (!r.enabled) toast.warning("Reminders are switched off — nothing was sent.");
      else if (r.reminders_sent === 0)
        toast.success(`Checked ${r.scanned} pending request(s) — none are overdue right now.`);
      else
        toast.success(
          `${r.reminders_sent} reminder(s) sent to ${r.reviewers_notified} reviewer(s) — ${r.due_soon} due soon, ${r.breached} breached.`,
        );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const num = (v: string, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
  };

  return (
    <div className="space-y-6">
      <SectionCard title="SLA reminders">
        <div className="space-y-8 p-5">
          <p className="text-xs text-muted-foreground">
            Reviewers are reminded automatically when a change request sits in{" "}
            <strong>{SLA_STAGE_LABELS.due_soon.toLowerCase()}</strong> territory, and escalation
            roles are pulled in once the request is{" "}
            <strong>{SLA_STAGE_LABELS.breached.toLowerCase()}</strong>. The check runs hourly.
          </p>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={form.enabled}
              disabled={readOnly}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            <span>
              <span className="block text-sm font-semibold">SLA reminders enabled</span>
              <span className="block text-xs text-muted-foreground">
                Master switch. When off, no reminders are sent on any channel.
              </span>
            </span>
          </label>

          <fieldset className="grid gap-4 md:grid-cols-3">
            <legend className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Thresholds
            </legend>
            <label className="space-y-1">
              <span className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Warn after (hours)
              </span>
              <input
                type="number"
                min={1}
                max={2000}
                value={form.warn_after_hours}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, warn_after_hours: num(e.target.value, 12) })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <span className="block text-[11px] text-muted-foreground">
                First nudge to the reviewer roles.
              </span>
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Breach after (hours)
              </span>
              <input
                type="number"
                min={1}
                max={2000}
                value={form.breach_after_hours}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, breach_after_hours: num(e.target.value, 24) })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <span className="block text-[11px] text-muted-foreground">
                Escalation roles are added from here on. Must be ≥ the warning threshold.
              </span>
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Repeat every (hours)
              </span>
              <input
                type="number"
                min={1}
                max={720}
                value={form.repeat_hours}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, repeat_hours: num(e.target.value, 24) })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <span className="block text-[11px] text-muted-foreground">
                A request is reminded at most once per window while it stays pending.
              </span>
            </label>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Delivery channels
            </legend>
            <div className="flex flex-wrap gap-4">
              {SLA_CHANNELS.map((c) => (
                <label key={c.key} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={form.channels.includes(c.key as ChangeSlaChannel)}
                    disabled={readOnly}
                    onChange={() =>
                      setForm({
                        ...form,
                        channels: toggleIn(form.channels, c.key as ChangeSlaChannel),
                      })
                    }
                  />
                  <span>
                    <span className="block text-sm font-semibold">{c.label}</span>
                    <span className="block text-xs text-muted-foreground">{c.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Reviewer roles reminded
            </legend>
            <div className="flex flex-wrap gap-3">
              {SLA_ROLES.map((r) => (
                <label key={r.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={form.notify_roles.includes(r.key)}
                    disabled={readOnly}
                    onChange={() =>
                      setForm({ ...form, notify_roles: toggleIn(form.notify_roles, r.key) })
                    }
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Escalation roles (added once breached)
            </legend>
            <div className="flex flex-wrap gap-3">
              {SLA_ROLES.map((r) => (
                <label key={r.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={form.escalate_roles.includes(r.key)}
                    disabled={readOnly}
                    onChange={() =>
                      setForm({ ...form, escalate_roles: toggleIn(form.escalate_roles, r.key) })
                    }
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={form.notify_requester}
              disabled={readOnly}
              onChange={(e) => setForm({ ...form, notify_requester: e.target.checked })}
            />
            <span>
              <span className="block text-sm font-semibold">Copy the requester</span>
              <span className="block text-xs text-muted-foreground">
                Lets the person who raised the change know that review is running late.
              </span>
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
            <button
              type="button"
              disabled={readOnly || save.isPending}
              onClick={() => save.mutate()}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {save.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Save className="h-4 w-4" aria-hidden />
              )}
              Save settings
            </button>
            <button
              type="button"
              disabled={readOnly || runNow.isPending}
              onClick={() => runNow.mutate()}
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {runNow.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <PlayCircle className="h-4 w-4" aria-hidden />
              )}
              Run a reminder check now
            </button>
            {readOnly ? (
              <span className="text-xs text-muted-foreground">
                You need change-approval management rights to edit these settings.
              </span>
            ) : null}
            {form.updated_at ? (
              <span className="text-xs text-muted-foreground">
                Last updated {new Date(form.updated_at).toLocaleString()}
              </span>
            ) : null}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
