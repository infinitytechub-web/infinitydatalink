import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard } from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";

export const Route = createFileRoute("/_admin/admin/audit")({
  component: AuditPage,
});

const trail = [
  { at: "2025-10-14 12:04", actor: "Kwame Mensah", action: "Login", target: "session" },
  { at: "2025-10-14 11:22", actor: "Admin (Kojo)", action: "Role update", target: "MB-0004 → Premium" },
  { at: "2025-10-14 09:15", actor: "System", action: "Backup completed", target: "iw-prod" },
  { at: "2025-10-13 22:44", actor: "Admin (Ama)", action: "Loan approved", target: "LN-0914" },
];

function AuditPage() {
  return (
    <>
      <PageHeader eyebrow="Administrator" title="Audit & Activity" description="Immutable log of every privileged action across the platform." />
      <SectionCard
        title="Audit trail"
        action={
          <ExportBar
            title="Audit Trail"
            subtitle={`${trail.length} events`}
            filename="audit_trail"
            columns={[
              { header: "Timestamp", accessor: (t: typeof trail[number]) => t.at },
              { header: "Actor", accessor: (t) => t.actor },
              { header: "Action", accessor: (t) => t.action },
              { header: "Target", accessor: (t) => t.target },
            ]}
            rows={trail}
          />
        }
      >
        <table className="w-full">
          <thead>
            <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
              <th className="px-6 py-3 font-medium">Timestamp</th>
              <th className="px-6 py-3 font-medium">Actor</th>
              <th className="px-6 py-3 font-medium">Action</th>
              <th className="px-6 py-3 font-medium">Target</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-deep/5">
            {trail.map((t, i) => (
              <tr key={i}>
                <td className="tabular px-6 py-4 text-sm">{t.at}</td>
                <td className="px-6 py-4 text-sm font-semibold">{t.actor}</td>
                <td className="px-6 py-4 text-sm">{t.action}</td>
                <td className="px-6 py-4 text-sm text-emerald-deep/60">{t.target}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </>
  );
}
