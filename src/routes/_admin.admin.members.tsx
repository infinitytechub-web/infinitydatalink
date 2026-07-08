import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, SectionCard, StatusPill } from "@/components/primitives";

export const Route = createFileRoute("/_admin/admin/members")({
  component: MembersPage,
});

const members = [
  { id: "MB-0001", name: "Kwame Mensah", region: "Greater Accra", kyc: "active" as const, tier: "Premium" },
  { id: "MB-0002", name: "Ama Serwaa", region: "Ashanti", kyc: "active" as const, tier: "Standard" },
  { id: "MB-0003", name: "Kojo Antwi", region: "Central", kyc: "pending" as const, tier: "Standard" },
  { id: "MB-0004", name: "Efua Owusu", region: "Western", kyc: "active" as const, tier: "Premium" },
  { id: "MB-0005", name: "Yaw Preko", region: "Volta", kyc: "rejected" as const, tier: "Standard" },
];

function MembersPage() {
  const [q, setQ] = useState("");
  const rows = members.filter((m) => (m.name + m.id + m.region).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Membership"
        description="Individual, group, department and institutional registrations."
        action={
          <button className="rounded bg-emerald-deep px-4 py-2 text-xs font-bold uppercase tracking-widest text-cream hover:bg-emerald-mid">
            Register member
          </button>
        }
      />

      <SectionCard
        title="Directory"
        action={
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search members…"
            className="rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs outline-none focus:border-emerald-mid"
          />
        }
      >
        <table className="w-full">
          <thead>
            <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
              <th className="px-6 py-3 font-medium">Member ID</th>
              <th className="px-6 py-3 font-medium">Name</th>
              <th className="px-6 py-3 font-medium">Region</th>
              <th className="px-6 py-3 font-medium">Tier</th>
              <th className="px-6 py-3 text-right font-medium">KYC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-deep/5">
            {rows.map((m) => (
              <tr key={m.id} className="hover:bg-cream/30">
                <td className="tabular px-6 py-4 text-sm font-semibold">{m.id}</td>
                <td className="px-6 py-4 text-sm">{m.name}</td>
                <td className="px-6 py-4 text-sm text-emerald-deep/60">{m.region}</td>
                <td className="px-6 py-4 text-sm">{m.tier}</td>
                <td className="px-6 py-4 text-right"><StatusPill status={m.kyc} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </>
  );
}
