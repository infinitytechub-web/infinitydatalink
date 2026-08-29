import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard } from "@/components/primitives";
import { getOrgConfig, ORG_PRESETS, setOrgConfig } from "@/lib/org-config";
import { useState } from "react";

export const Route = createFileRoute("/_admin/admin/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const cfg = getOrgConfig();
  const [preset, setPreset] = useState(cfg.id);
  return (
    <>
      <PageHeader eyebrow="Administrator" title="Institution settings" description="Country preset, currency, national ID and payment providers." />

      <SectionCard title="Region preset">
        <div className="grid gap-4 p-6 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Country / region
            </label>
            <select
              value={preset}
              onChange={(e) => {
                setPreset(e.target.value);
                setOrgConfig(e.target.value as keyof typeof ORG_PRESETS);
                window.location.reload();
              }}
              className="w-full rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm"
            >
              {Object.values(ORG_PRESETS).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.currency.code}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded border border-emerald-deep/5 bg-cream/40 p-4 text-xs">
            <p><span className="font-semibold">Currency:</span> {cfg.currency.symbol} {cfg.currency.code}</p>
            <p><span className="font-semibold">National ID:</span> {cfg.nationalId.label}</p>
            <p><span className="font-semibold">MoMo:</span> {cfg.momoProviders.join(", ") || "—"}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Organization branding">
        <div className="grid gap-4 p-6 md:grid-cols-2">
          <TextInput label="Institution name" value="IT-360 CashApp Cooperative" />
          <TextInput label="Address" value="12 Ring Road Central, Accra" />
          <TextInput label="Contact email" value="hello@it360cashapp.app" />
          <TextInput label="Contact phone" value="+233 55 000 0000" />
        </div>
      </SectionCard>
    </>
  );
}

function TextInput({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <input
        defaultValue={value}
        className="w-full rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm outline-none focus:border-emerald-mid"
      />
    </label>
  );
}
