import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useEffect, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { BellRing, Send } from "lucide-react";
import { toast } from "sonner";
import { SectionCard, SectionCardSkeleton } from "@/components/primitives";
import {
  ALERT_CHANNELS,
  ALERT_ROLES,
  ALERT_SEVERITIES,
  getSecurityAlertSettings,
  sendTestSecurityAlert,
  updateSecurityAlertSettings,
  type SecurityAlertSettings,
} from "@/lib/security-alerts.functions";

export const Route = createFileRoute("/_admin/admin/security/alerts")({
  component: AlertsPage,
});

const settingsQuery = queryOptions({
  queryKey: ["admin", "security", "alert-settings"],
  queryFn: () => getSecurityAlertSettings(),
});

const EVENT_TOGGLES = [
  {
    key: "audit_alerts_enabled" as const,
    label: "New audit events",
    hint: "Fires when a qualifying entry lands in the audit trail",
  },
  {
    key: "upload_alerts_enabled" as const,
    label: "Blocked uploads",
    hint: "Blocked or quarantined file scan verdicts",
  },
  {
    key: "rate_limit_alerts_enabled" as const,
    label: "Rate-limit triggers",
    hint: "A configured scope limit was exceeded",
  },
];

function AlertsPage() {
  return (
    <Suspense fallback={<SectionCardSkeleton title="Alert notifications" rows={6} cols={2} />}>
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
  const [form, setForm] = useState<SecurityAlertSettings>(data.settings);
  const [prefixText, setPrefixText] = useState(data.settings.audit_action_prefixes.join(", "));

  useEffect(() => {
    setForm(data.settings);
    setPrefixText(data.settings.audit_action_prefixes.join(", "));
  }, [data.settings]);

  const readOnly = !data.canManage;

  const save = useMutation({
    mutationFn: () =>
      updateSecurityAlertSettings({
        data: {
          enabled: form.enabled,
          channels: form.channels,
          notify_roles: form.notify_roles,
          audit_alerts_enabled: form.audit_alerts_enabled,
          audit_min_severity: form.audit_min_severity,
          audit_action_prefixes: prefixText
            .split(",")
            .map((p) => p.trim())
            .filter((p) => p.length >= 2),
          upload_alerts_enabled: form.upload_alerts_enabled,
          rate_limit_alerts_enabled: form.rate_limit_alerts_enabled,
          throttle_minutes: form.throttle_minutes,
        },
      }),
    onSuccess: async () => {
      toast.success("Alert configuration saved");
      await queryClient.invalidateQueries({ queryKey: ["admin", "security", "alert-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: (kind: "audit" | "upload_blocked" | "rate_limit") =>
      sendTestSecurityAlert({ data: { kind } }),
    onSuccess: (r) =>
      r.sent
        ? toast.success(`Test alert sent to ${r.recipients ?? 0} officer(s)`)
        : toast.warning(`Not sent — ${r.reason ?? "configuration blocked it"}`),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <SectionCard title="Alert notifications">
        <div className="space-y-8 p-5">
          <p className="text-xs text-muted-foreground">
            Choose which security signals raise an email, SMS or in-app alert, who receives them,
            and how often the same alert may repeat.
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
              <span className="block text-sm font-semibold">Security alerting enabled</span>
              <span className="block text-xs text-muted-foreground">
                Master switch. When off, no security alerts are dispatched on any channel.
              </span>
            </span>
          </label>

          <fieldset className="space-y-3">
            <legend className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Events that raise an alert
            </legend>
            {EVENT_TOGGLES.map((t) => (
              <label key={t.key} className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={form[t.key]}
                  disabled={readOnly}
                  onChange={(e) => setForm({ ...form, [t.key]: e.target.checked })}
                />
                <span>
                  <span className="block text-sm font-semibold">{t.label}</span>
                  <span className="block text-xs text-muted-foreground">{t.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <fieldset className="grid gap-4 md:grid-cols-2">
            <legend className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Audit event filters
            </legend>
            <label className="space-y-1">
              <span className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Minimum severity
              </span>
              <select
                value={form.audit_min_severity}
                disabled={readOnly}
                onChange={(e) =>
                  setForm({
                    ...form,
                    audit_min_severity: e.target
                      .value as SecurityAlertSettings["audit_min_severity"],
                  })
                }
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {ALERT_SEVERITIES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Only these action prefixes (optional)
              </span>
              <input
                value={prefixText}
                disabled={readOnly}
                onChange={(e) => setPrefixText(e.target.value)}
                placeholder="e.g. security., role, payments."
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <span className="block text-[11px] text-muted-foreground">
                Comma separated. Leave empty to consider every audit action.
              </span>
            </label>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Delivery channels
            </legend>
            <div className="flex flex-wrap gap-4">
              {ALERT_CHANNELS.map((c) => (
                <label key={c.key} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={form.channels.includes(c.key)}
                    disabled={readOnly}
                    onChange={() => setForm({ ...form, channels: toggleIn(form.channels, c.key) })}
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
              Recipient roles
            </legend>
            <div className="flex flex-wrap gap-3">
              {ALERT_ROLES.map((r) => (
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

          <label className="block max-w-xs space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Repeat throttle (minutes)
            </span>
            <input
              type="number"
              min={0}
              max={1440}
              value={form.throttle_minutes}
              disabled={readOnly}
              onChange={(e) => setForm({ ...form, throttle_minutes: Number(e.target.value) || 0 })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <span className="block text-[11px] text-muted-foreground">
              An identical alert is suppressed inside this window. 0 disables throttling.
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
            <button
              type="button"
              disabled={readOnly || save.isPending}
              onClick={() => save.mutate()}
              className="inline-flex items-center gap-2 rounded bg-emerald-mid px-4 py-2 text-xs font-bold uppercase tracking-widest text-white disabled:opacity-40"
            >
              <BellRing className="h-3.5 w-3.5" aria-hidden />
              {save.isPending ? "Saving…" : "Save configuration"}
            </button>
            <button
              type="button"
              disabled={readOnly || test.isPending}
              onClick={() => test.mutate("audit")}
              className="inline-flex items-center gap-2 rounded border border-border px-4 py-2 text-xs font-bold uppercase tracking-widest disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" aria-hidden />
              Send test alert
            </button>
            {form.updated_at ? (
              <span className="text-xs text-muted-foreground">
                Last changed {new Date(form.updated_at).toLocaleString()}
              </span>
            ) : null}
            {readOnly ? (
              <span className="text-xs text-muted-foreground">
                Read-only — security management permission required to change alerts.
              </span>
            ) : null}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
