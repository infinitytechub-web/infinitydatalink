import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useEffect, useState } from "react";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { EmptyState, SectionCard, SectionCardSkeleton } from "@/components/primitives";
import {
  deleteIpRule,
  getFirewallConfig,
  updateSecuritySettings,
  upsertIpRule,
  upsertRateLimit,
  type FirewallView,
  type SecuritySettings,
} from "@/lib/security-centre.functions";

export const Route = createFileRoute("/_admin/admin/security/firewall")({
  component: FirewallPage,
});

const firewallQuery = queryOptions({
  queryKey: ["admin", "security", "firewall"],
  queryFn: () => getFirewallConfig(),
});

const field =
  "w-full rounded border border-emerald-deep/15 bg-card px-3 py-2 text-xs text-emerald-deep focus:outline-none focus:ring-2 focus:ring-emerald-mid/30 disabled:opacity-50";
const btn =
  "inline-flex items-center gap-1.5 rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-deep transition-colors hover:bg-cream disabled:cursor-not-allowed disabled:opacity-40";

function FirewallPage() {
  return (
    <Suspense fallback={<SectionCardSkeleton title="Firewall policy" rows={6} cols={4} />}>
      <Content />
    </Suspense>
  );
}

function Content() {
  const { data } = useSuspenseQuery(firewallQuery);
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "security", "firewall"] });
  return (
    <div className="space-y-6">
      <PolicyCard view={data} onSaved={refresh} />
      <IpRulesCard view={data} onChanged={refresh} />
      <RateLimitsCard view={data} onChanged={refresh} />
    </div>
  );
}

/* ---------------------------------------------------------------- policy */

const TOGGLES: { key: keyof SecuritySettings; label: string; hint: string }[] = [
  { key: "firewall_enabled", label: "Application firewall", hint: "Evaluate IP rules on every request" },
  { key: "ip_allowlist_only", label: "Allowlist only", hint: "Deny every address that is not explicitly allowed" },
  { key: "rate_limiting_enabled", label: "Rate limiting", hint: "Apply the scope limits below" },
  { key: "upload_scanning_enabled", label: "Upload scanning", hint: "Scan every uploaded file before storage" },
  { key: "block_executables", label: "Block executables", hint: "Reject scripts, binaries and archives with executables" },
];

function PolicyCard({ view, onSaved }: { view: FirewallView; onSaved: () => void }) {
  const [form, setForm] = useState<SecuritySettings>(view.settings);
  const [saving, setSaving] = useState(false);
  const disabled = !view.can_manage;

  useEffect(() => setForm(view.settings), [view.settings]);

  const save = async () => {
    setSaving(true);
    try {
      await updateSecuritySettings({
        data: {
          firewall_enabled: form.firewall_enabled,
          ip_allowlist_only: form.ip_allowlist_only,
          rate_limiting_enabled: form.rate_limiting_enabled,
          upload_scanning_enabled: form.upload_scanning_enabled,
          max_upload_mb: form.max_upload_mb,
          allowed_upload_mime: form.allowed_upload_mime,
          block_executables: form.block_executables,
        },
      });
      toast.success("Security policy saved");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="Firewall & upload policy"
      action={
        <button className={btn} disabled={disabled || saving} onClick={() => void save()}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Save policy
        </button>
      }
    >
      <div className="space-y-4 p-6">
        {disabled ? (
          <p className="rounded border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-gold">
            Read-only — the security management permission is required to change these controls.
          </p>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          {TOGGLES.map((t) => (
            <label
              key={t.key}
              className="flex items-start gap-3 rounded border border-emerald-deep/10 bg-cream/40 px-4 py-3"
            >
              <input
                type="checkbox"
                className="mt-0.5"
                disabled={disabled}
                checked={Boolean(form[t.key])}
                onChange={(e) => setForm({ ...form, [t.key]: e.target.checked })}
              />
              <span>
                <span className="block text-sm font-semibold text-emerald-deep">{t.label}</span>
                <span className="block text-[11px] text-emerald-deep/55">{t.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/50">
            Maximum upload size (MB)
            <input
              type="number"
              min={1}
              max={200}
              className={field}
              disabled={disabled}
              value={form.max_upload_mb}
              onChange={(e) => setForm({ ...form, max_upload_mb: Number(e.target.value) || 1 })}
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/50">
            Allowed MIME types (comma separated)
            <input
              className={field}
              disabled={disabled}
              value={form.allowed_upload_mime.join(", ")}
              onChange={(e) =>
                setForm({
                  ...form,
                  allowed_upload_mime: e.target.value
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
        </div>
        {view.settings.updated_at ? (
          <p className="text-[11px] text-emerald-deep/45">
            Last updated {new Date(view.settings.updated_at).toLocaleString()}
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}

/* -------------------------------------------------------------- ip rules */

function IpRulesCard({ view, onChanged }: { view: FirewallView; onChanged: () => void }) {
  const [cidr, setCidr] = useState("");
  const [mode, setMode] = useState<"allow" | "deny">("deny");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const disabled = !view.can_manage;

  const add = async () => {
    setBusy(true);
    try {
      await upsertIpRule({ data: { cidr: cidr.trim(), mode, note: note.trim() || undefined, enabled: true } });
      toast.success(`${mode === "allow" ? "Allow" : "Deny"} rule added`);
      setCidr("");
      setNote("");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save rule");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (id: string, enabled: boolean, rule: { cidr: string; mode: "allow" | "deny"; note: string | null }) => {
    try {
      await upsertIpRule({ data: { id, cidr: rule.cidr, mode: rule.mode, note: rule.note ?? undefined, enabled } });
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteIpRule({ data: { id } });
      toast.success("Rule removed");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <SectionCard title="IP firewall rules" hint={`${view.ip_rules.length} rule(s)`}>
      {!disabled ? (
        <div className="flex flex-wrap items-end gap-3 border-b border-emerald-deep/5 px-6 py-4">
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/50">
            Address or CIDR
            <input
              className={field}
              placeholder="197.251.0.0/16"
              value={cidr}
              onChange={(e) => setCidr(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/50">
            Mode
            <select className={field} value={mode} onChange={(e) => setMode(e.target.value as "allow" | "deny")}>
              <option value="deny">Deny</option>
              <option value="allow">Allow</option>
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/50">
            Note
            <input className={field} placeholder="Reason for this rule" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button className={btn} disabled={busy || cidr.trim().length < 3} onClick={() => void add()}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Add rule
          </button>
        </div>
      ) : null}

      {view.ip_rules.length === 0 ? (
        <EmptyState title="No IP rules" hint="Add an allow or deny rule to start filtering traffic." />
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
              <th className="px-6 py-3 font-medium">Address</th>
              <th className="px-6 py-3 font-medium">Mode</th>
              <th className="px-6 py-3 font-medium">Note</th>
              <th className="px-6 py-3 font-medium">Added</th>
              <th className="px-6 py-3 text-right font-medium">Enabled</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-deep/5">
            {view.ip_rules.map((r) => (
              <tr key={r.id}>
                <td className="tabular px-6 py-4 text-sm font-semibold">{r.cidr}</td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      r.mode === "allow" ? "bg-emerald-mid/10 text-emerald-mid" : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {r.mode}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-emerald-deep/60">{r.note ?? "—"}</td>
                <td className="px-6 py-4 text-xs text-emerald-deep/50">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-3">
                    <input
                      type="checkbox"
                      aria-label={`Enable rule ${r.cidr}`}
                      disabled={disabled}
                      checked={r.enabled}
                      onChange={(e) => void toggle(r.id, e.target.checked, r)}
                    />
                    <button
                      className={btn}
                      disabled={disabled}
                      onClick={() => void remove(r.id)}
                      aria-label={`Delete rule ${r.cidr}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionCard>
  );
}

/* ----------------------------------------------------------- rate limits */

function RateLimitsCard({ view, onChanged }: { view: FirewallView; onChanged: () => void }) {
  const disabled = !view.can_manage;
  const [draft, setDraft] = useState({ scope: "", window_seconds: 60, max_requests: 60, note: "" });
  const [busy, setBusy] = useState(false);

  const saveRow = async (row: FirewallView["rate_limits"][number], patch: Partial<FirewallView["rate_limits"][number]>) => {
    try {
      await upsertRateLimit({
        data: {
          id: row.id,
          scope: row.scope,
          window_seconds: patch.window_seconds ?? row.window_seconds,
          max_requests: patch.max_requests ?? row.max_requests,
          enabled: patch.enabled ?? row.enabled,
          note: row.note ?? undefined,
        },
      });
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const add = async () => {
    setBusy(true);
    try {
      await upsertRateLimit({
        data: {
          scope: draft.scope.trim(),
          window_seconds: draft.window_seconds,
          max_requests: draft.max_requests,
          enabled: true,
          note: draft.note.trim() || undefined,
        },
      });
      toast.success("Rate limit saved");
      setDraft({ scope: "", window_seconds: 60, max_requests: 60, note: "" });
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save limit");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title="Rate limits"
      hint={view.settings.rate_limiting_enabled ? "Enforcement on" : "Enforcement off"}
    >
      {!disabled ? (
        <div className="flex flex-wrap items-end gap-3 border-b border-emerald-deep/5 px-6 py-4">
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/50">
            Scope key
            <input
              className={field}
              placeholder="auth.reset_password"
              value={draft.scope}
              onChange={(e) => setDraft({ ...draft, scope: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/50">
            Window (seconds)
            <input
              type="number"
              min={1}
              className={field}
              value={draft.window_seconds}
              onChange={(e) => setDraft({ ...draft, window_seconds: Number(e.target.value) || 1 })}
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/50">
            Max requests
            <input
              type="number"
              min={1}
              className={field}
              value={draft.max_requests}
              onChange={(e) => setDraft({ ...draft, max_requests: Number(e.target.value) || 1 })}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/50">
            Note
            <input className={field} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          </label>
          <button className={btn} disabled={busy || draft.scope.trim().length < 3} onClick={() => void add()}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Add limit
          </button>
        </div>
      ) : null}

      {view.rate_limits.length === 0 ? (
        <EmptyState title="No rate limits configured" hint="Add a scope key to throttle a sensitive endpoint." />
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
              <th className="px-6 py-3 font-medium">Scope</th>
              <th className="px-6 py-3 font-medium">Window</th>
              <th className="px-6 py-3 font-medium">Max requests</th>
              <th className="px-6 py-3 font-medium">Note</th>
              <th className="px-6 py-3 text-right font-medium">Enabled</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-deep/5">
            {view.rate_limits.map((r) => (
              <tr key={r.id}>
                <td className="px-6 py-4 text-sm font-semibold">{r.scope}</td>
                <td className="px-6 py-4">
                  <input
                    type="number"
                    min={1}
                    className={`${field} w-24`}
                    disabled={disabled}
                    defaultValue={r.window_seconds}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v && v !== r.window_seconds) void saveRow(r, { window_seconds: v });
                    }}
                  />
                </td>
                <td className="px-6 py-4">
                  <input
                    type="number"
                    min={1}
                    className={`${field} w-24`}
                    disabled={disabled}
                    defaultValue={r.max_requests}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v && v !== r.max_requests) void saveRow(r, { max_requests: v });
                    }}
                  />
                </td>
                <td className="px-6 py-4 text-sm text-emerald-deep/60">{r.note ?? "—"}</td>
                <td className="px-6 py-4 text-right">
                  <input
                    type="checkbox"
                    aria-label={`Enable ${r.scope} limit`}
                    disabled={disabled}
                    checked={r.enabled}
                    onChange={(e) => void saveRow(r, { enabled: e.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionCard>
  );
}
