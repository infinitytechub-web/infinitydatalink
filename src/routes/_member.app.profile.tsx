import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard } from "@/components/primitives";
import { getOrgConfig, ORG_PRESETS, setOrgConfig } from "@/lib/org-config";
import { useAuth } from "@/lib/auth";
import { useState } from "react";

export const Route = createFileRoute("/_member/app/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuth();
  const cfg = getOrgConfig();
  const [region, setRegion] = useState(cfg.id);
  return (
    <>
      <PageHeader
        eyebrow="Member portal"
        title="Profile & KYC"
        description="Personal details, national ID, and linked accounts."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded border border-emerald-deep/5 bg-card p-6 shadow-sm lg:col-span-2">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-emerald-deep/50">
            Personal details
          </p>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" value={user?.fullName ?? "—"} />
            <Field label="Email" value={user?.email ?? "—"} />
            <Field label="Gender" value="Prefer not to say" />
            <Field label="Date of birth" value="1990-01-01" />
            <Field label="Region" value={cfg.regions[0] ?? "—"} />
            <Field label="Digital address" value="GA-123-4567" />
            <Field label={cfg.nationalId.label} value="GHA-XXXXXXXXX-0" />
            <Field label="Membership status" value="Premium · Level 3" />
          </dl>
        </div>

        <div className="space-y-6">
          <div className="rounded border border-emerald-deep/5 bg-card p-6 shadow-sm">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-emerald-deep/50">
              Region preset
            </p>
            <select
              value={region}
              onChange={(e) => {
                setRegion(e.target.value);
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
            <p className="mt-2 text-[11px] text-emerald-deep/50">
              Controls currency, national ID label, and MoMo providers.
            </p>
          </div>

          <div className="rounded border border-emerald-deep/5 bg-card p-6 shadow-sm">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-emerald-deep/50">
              Security
            </p>
            <ul className="space-y-2 text-sm">
              <li>Two-factor authentication</li>
              <li>Biometric login</li>
              <li>Trusted devices (2)</li>
              <li>Session timeout · 15 min</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-widest text-emerald-deep/40">{label}</dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  );
}
