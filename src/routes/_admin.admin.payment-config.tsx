import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { Suspense, useMemo, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Copy, PlugZap, ShieldCheck, XCircle } from "lucide-react";
import {
  EmptyState,
  KPIStat,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
} from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import {
  PROVIDER_TEMPLATES,
  PROVIDER_MODES,
  defaultWebhookPath,
  type ProviderMode,
} from "@/lib/payment-providers";
import {
  getPaymentConfig,
  getPaymentReadiness,
  requestPaymentProviderChange,
  runPaymentSelfTest,
  setPaymentRailEnabled,
  type RailConfigRow,
  type ReadinessReport,
  type SelfTestResult,
} from "@/lib/payment-config.functions";

export const Route = createFileRoute("/_admin/admin/payment-config")({
  head: () => ({
    meta: [
      { title: "Payment configuration — IT-360 CashApp" },
      {
        name: "description",
        content:
          "Select a payment provider, store credentials as backend secrets, and verify readiness for payment intents and webhook callbacks.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PaymentConfigPage,
});

const configQuery = queryOptions({
  queryKey: ["admin", "payment-config"],
  queryFn: () => getPaymentConfig(),
  staleTime: 15_000,
});

function PaymentConfigPage() {
  const { user, can, hasRole, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  if (!hasRole("super_admin") && !can("payments", "view")) return <Navigate to="/admin" />;
  return (
    <>
      <PageHeader
        eyebrow="Payments"
        title="Payment configuration"
        description="Choose a gateway, keep API credentials in backend secrets, and test readiness for creating intents and processing webhook callbacks."
      />
      <Suspense fallback={<SectionCardSkeleton title="Providers" rows={4} cols={4} />}>
        <Body canManage={hasRole("super_admin") || can("payments", "manage")} />
      </Suspense>
    </>
  );
}

function Body({ canManage }: { canManage: boolean }) {
  const { data } = useSuspenseQuery(configQuery);
  const [selected, setSelected] = useState(PROVIDER_TEMPLATES[0]!.code);
  const template = PROVIDER_TEMPLATES.find((t) => t.code === selected)!;
  const saved = data.providers.find((p) => p.code === selected) ?? null;

  const activeCount = data.providers.filter((p) => p.enabled).length;
  const verified = data.events.filter((e) => e.signature_verified).length;
  const succeeded = data.intent_counts.find((c) => c.status === "succeeded")?.count ?? 0;

  return (
    <>
      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat
          label="Providers configured"
          value={<span className="tabular">{data.providers.length}</span>}
        />
        <KPIStat
          label="Enabled rails"
          value={<span className="tabular">{activeCount}</span>}
          accent
        />
        <KPIStat
          label="Callbacks verified"
          value={<span className="tabular">{verified}</span>}
          hint={`${data.events.length} recent events`}
        />
        <KPIStat label="Intents succeeded" value={<span className="tabular">{succeeded}</span>} />
      </section>

      <SectionCard title="Select a provider">
        <div className="grid gap-3 p-6 md:grid-cols-3">
          {PROVIDER_TEMPLATES.map((t) => {
            const row = data.providers.find((p) => p.code === t.code);
            const active = t.code === selected;
            return (
              <button
                key={t.code}
                type="button"
                onClick={() => setSelected(t.code)}
                className={
                  "rounded-lg border p-4 text-left transition " +
                  (active
                    ? "border-emerald-mid bg-emerald-mid/5 shadow-sm"
                    : "border-emerald-deep/10 hover:border-emerald-mid/40 hover:bg-emerald-deep/5")
                }
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{t.label}</span>
                  {row ? (
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest " +
                        (row.enabled
                          ? "bg-emerald-mid/15 text-emerald-mid"
                          : "bg-emerald-deep/10 text-muted-foreground")
                      }
                    >
                      {row.enabled ? row.mode : "disabled"}
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-deep/5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                      not set up
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{t.blurb}</p>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <RailsPanel rails={data.rails} canManage={canManage} />

      <ProviderForm key={selected} code={selected} canManage={canManage} saved={saved} />

      <ReadinessPanel code={selected} canManage={canManage} label={template.label} />

      <SectionCard title="Recent webhook callbacks">
        {data.events.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No callbacks received yet"
              hint="Run the readiness test to journal a simulated event."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Received</th>
                  <th className="px-6 py-3 font-medium">Provider</th>
                  <th className="px-6 py-3 font-medium">Event</th>
                  <th className="px-6 py-3 font-medium">Signature</th>
                  <th className="px-6 py-3 font-medium">Processed</th>
                  <th className="px-6 py-3 font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-deep/5">
                {data.events.map((e) => (
                  <tr key={e.id}>
                    <td className="px-6 py-3 text-[11px] text-muted-foreground">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-3 text-sm font-semibold">{e.provider_code}</td>
                    <td className="px-6 py-3 text-sm text-muted-foreground">
                      {e.event_type ?? "—"}
                    </td>
                    <td className="px-6 py-3 text-sm">
                      {e.signature_verified ? (
                        <span className="inline-flex items-center gap-1 text-emerald-mid">
                          <ShieldCheck className="h-3.5 w-3.5" /> verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <XCircle className="h-3.5 w-3.5" /> rejected
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-[11px] text-muted-foreground">
                      {e.processed_at ? new Date(e.processed_at).toLocaleString() : "pending"}
                    </td>
                    <td className="px-6 py-3 text-[11px] text-muted-foreground">
                      {e.error ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}

function RailsPanel({ rails, canManage }: { rails: RailConfigRow[]; canManage: boolean }) {
  const qc = useQueryClient();
  const call = useServerFn(setPaymentRailEnabled);
  const [pending, setPending] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: (v: { rail: string; enabled: boolean }) => call({ data: v }),
    onSuccess: async (_r, v) => {
      toast.success(v.enabled ? "Rail enabled" : "Rail disabled");
      await qc.invalidateQueries({ queryKey: ["admin", "payment-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setPending(null),
  });

  const groups: { kind: string; label: string }[] = [
    { kind: "mobile_money", label: "Mobile money" },
    { kind: "bank", label: "Bank" },
    { kind: "card", label: "Cards" },
    { kind: "cash", label: "Cash" },
  ];

  return (
    <SectionCard
      title="Payment rails"
      action={
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
          {rails.filter((r) => r.rail_enabled).length}/{rails.length} enabled
        </span>
      }
    >
      <div className="space-y-6 p-6">
        <p className="text-xs text-muted-foreground">
          A rail becomes selectable for members once it is switched on here and a provider that
          supports it is enabled with credentials. Turning a rail off blocks new intents immediately
          without changing any provider credentials.
        </p>
        {groups.map((g) => {
          const items = rails.filter((r) => r.kind === g.kind);
          if (items.length === 0) return null;
          return (
            <div key={g.kind} className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {g.label}
              </p>
              <ul className="divide-y divide-emerald-deep/5 rounded-lg border border-emerald-deep/10">
                {items.map((r) => (
                  <li
                    key={r.rail}
                    className="flex flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        {r.label}
                        <span
                          className={
                            "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest " +
                            (!r.rail_enabled
                              ? "bg-destructive/10 text-destructive"
                              : r.live
                                ? "bg-emerald-mid/15 text-emerald-mid"
                                : r.selectable
                                  ? "bg-accent-gold/15 text-accent-gold"
                                  : "bg-emerald-deep/10 text-muted-foreground")
                          }
                        >
                          {r.statusLabel}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{r.note}</p>
                      {r.providerCode && (
                        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                          provider: {r.providerCode}
                        </p>
                      )}
                    </div>
                    <Switch
                      aria-label={`Enable ${r.label}`}
                      checked={r.rail_enabled}
                      disabled={!canManage || (mut.isPending && pending === r.rail)}
                      onCheckedChange={(next) => {
                        setPending(r.rail);
                        mut.mutate({ rail: r.rail, enabled: next });
                      }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {!canManage && (
          <p className="text-xs text-muted-foreground">
            Read-only — payments.manage required to change rails.
          </p>
        )}
      </div>
    </SectionCard>
  );
}

type SavedProvider = {
  code: string;
  label: string;
  mode: string;
  enabled: boolean;
  config: Record<string, string>;
  webhook_path: string | null;
};

function ProviderForm({
  code,
  canManage,
  saved,
}: {
  code: string;
  canManage: boolean;
  saved: SavedProvider | null;
}) {
  const template = PROVIDER_TEMPLATES.find((t) => t.code === code)!;
  const qc = useQueryClient();
  const call = useServerFn(requestPaymentProviderChange);

  const [label, setLabel] = useState(saved?.label ?? template.label);
  const [mode, setMode] = useState<ProviderMode>((saved?.mode as ProviderMode) ?? "sandbox");
  const [enabled, setEnabled] = useState(saved?.enabled ?? false);
  const [webhookPath, setWebhookPath] = useState(saved?.webhook_path ?? defaultWebhookPath(code));
  const [summary, setSummary] = useState("");
  const initialFields = useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of template.fields) out[f.key] = saved?.config?.[f.key] ?? "";
    return out;
  }, [template, saved]);
  const [fields, setFields] = useState<Record<string, string>>(initialFields);

  const mut = useMutation({
    mutationFn: () =>
      call({
        data: {
          code,
          label: label.trim(),
          mode,
          enabled,
          config: fields,
          webhook_path: webhookPath.trim(),
          summary: summary.trim(),
        },
      }),
    onSuccess: async () => {
      toast.success("Change staged for approval", {
        description: "A second administrator must approve it on Change approvals.",
      });
      setSummary("");
      await qc.invalidateQueries({ queryKey: ["admin", "payment-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <SectionCard
      title={`${template.label} settings`}
      action={
        <Link
          to="/admin/console/approvals"
          className="text-[11px] font-semibold uppercase tracking-widest text-emerald-mid hover:underline"
        >
          Change approvals →
        </Link>
      }
    >
      <form
        className="space-y-5 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (summary.trim().length < 5) {
            toast.error("Describe the change (at least 5 characters).");
            return;
          }
          mut.mutate();
        }}
      >
        <div className="rounded-lg border border-emerald-deep/10 bg-cream/40 p-4 text-xs text-muted-foreground">
          <p className="flex items-center gap-2 font-semibold text-emerald-deep">
            <ShieldCheck className="h-4 w-4 text-emerald-mid" /> Credentials are stored as backend
            secrets
          </p>
          <p className="mt-2">
            Secret keys never touch the database. This provider reads{" "}
            <code className="rounded bg-emerald-deep/10 px-1 py-0.5 font-mono">
              {template.secretEnv}
            </code>{" "}
            for API calls and{" "}
            <code className="rounded bg-emerald-deep/10 px-1 py-0.5 font-mono">
              {template.webhookSecretEnv}
            </code>{" "}
            to verify callback signatures. Only the non-secret identifiers below are persisted.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="provider-label">Display label</Label>
            <Input
              id="provider-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={80}
              disabled={!canManage}
            />
          </div>
          <div>
            <Label htmlFor="provider-mode">Environment</Label>
            <select
              id="provider-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as ProviderMode)}
              disabled={!canManage}
              className="mt-1 w-full rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm"
            >
              {PROVIDER_MODES.map((m) => (
                <option key={m} value={m}>
                  {m === "sandbox" ? "Sandbox (test)" : "Live"}
                </option>
              ))}
            </select>
          </div>
          {template.fields.map((f) => (
            <div key={f.key}>
              <Label htmlFor={`field-${f.key}`}>
                {f.label}
                {f.required ? " *" : ""}
              </Label>
              <Input
                id={`field-${f.key}`}
                value={fields[f.key] ?? ""}
                placeholder={f.placeholder}
                onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                maxLength={300}
                disabled={!canManage}
              />
            </div>
          ))}
          <div className="md:col-span-2">
            <Label htmlFor="webhook-path">Callback path</Label>
            <Input
              id="webhook-path"
              value={webhookPath}
              onChange={(e) => setWebhookPath(e.target.value)}
              disabled={!canManage}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Signed callbacks are accepted at this path and journalled for reconciliation.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-emerald-deep/10 p-4">
          <div>
            <p className="text-sm font-semibold">Enable this rail</p>
            <p className="text-xs text-muted-foreground">
              Disabled providers reject intents and callbacks.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canManage} />
        </div>

        <div>
          <Label htmlFor="summary">Reason for change</Label>
          <Textarea
            id="summary"
            rows={2}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="e.g. Rotate Paystack sandbox keys ahead of go-live"
            disabled={!canManage}
          />
        </div>

        <div className="flex items-center justify-end gap-3">
          {!canManage && (
            <span className="text-xs text-muted-foreground">
              Read-only — payments.manage required.
            </span>
          )}
          <Button type="submit" disabled={!canManage || mut.isPending}>
            {mut.isPending ? "Submitting…" : "Submit for approval"}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

function ReadinessPanel({
  code,
  label,
  canManage,
}: {
  code: string;
  label: string;
  canManage: boolean;
}) {
  const readiness = useServerFn(getPaymentReadiness);
  const selfTest = useServerFn(runPaymentSelfTest);
  const qc = useQueryClient();
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [test, setTest] = useState<SelfTestResult | null>(null);

  const check = useMutation({
    mutationFn: () => readiness({ data: { code } }),
    onSuccess: (r) => setReport(r),
    onError: (e: Error) => toast.error(e.message),
  });
  const run = useMutation({
    mutationFn: () => selfTest({ data: { code } }),
    onSuccess: async (r) => {
      setTest(r);
      if (r.passed) toast.success("Readiness test passed");
      else toast.error("Readiness test failed");
      await qc.invalidateQueries({ queryKey: ["admin", "payment-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <SectionCard
      title={`Readiness — ${label}`}
      action={
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => check.mutate()}
            disabled={check.isPending}
          >
            <PlugZap className="mr-1 h-3.5 w-3.5" /> Check configuration
          </Button>
          <Button size="sm" onClick={() => run.mutate()} disabled={!canManage || run.isPending}>
            Run end-to-end test
          </Button>
        </div>
      }
    >
      <div className="space-y-5 p-6">
        {check.isPending && <Skeleton className="h-24 w-full" />}
        {report && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <Badge ok={report.ready_for_intents} text="Create intents" />
              <Badge ok={report.ready_for_webhooks} text="Process callbacks" />
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded border border-emerald-deep/15 px-2 py-1 font-mono text-[11px] hover:bg-emerald-deep/5"
                onClick={() => {
                  void navigator.clipboard.writeText(report.webhook_url);
                  toast.success("Webhook URL copied");
                }}
              >
                <Copy className="h-3 w-3" /> {report.webhook_url}
              </button>
            </div>
            <ul className="divide-y divide-emerald-deep/5 rounded-lg border border-emerald-deep/10">
              {report.checks.map((c) => (
                <li key={c.key} className="flex items-start gap-3 p-3 text-sm">
                  {c.state === "pass" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-mid" />
                  ) : c.state === "warn" ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-accent-gold" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 text-destructive" />
                  )}
                  <div>
                    <p className="font-semibold">{c.label}</p>
                    <p className="text-xs text-muted-foreground">{c.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {test && (
          <div className="rounded-lg border border-emerald-deep/10 p-4">
            <p className="text-sm font-semibold">
              End-to-end test {test.passed ? "passed" : "failed"}
              {test.reference ? ` · ${test.reference}` : ""}
            </p>
            <ul className="mt-2 space-y-2">
              {test.steps.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  {s.ok ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-mid" />
                  ) : (
                    <XCircle className="mt-0.5 h-3.5 w-3.5 text-destructive" />
                  )}
                  <span>
                    <span className="font-semibold">{s.label}:</span> {s.detail}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!report && !test && !check.isPending && (
          <EmptyState
            title="No readiness data yet"
            hint="Run a configuration check to see credential and callback status."
          />
        )}
      </div>
    </SectionCard>
  );
}

function Badge({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest " +
        (ok ? "bg-emerald-mid/15 text-emerald-mid" : "bg-destructive/10 text-destructive")
      }
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />} {text}
    </span>
  );
}
