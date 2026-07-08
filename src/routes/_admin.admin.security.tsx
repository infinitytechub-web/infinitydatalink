import { createFileRoute } from "@tanstack/react-router";
import { KPIStat, PageHeader, SectionCard, StatusPill } from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";

export const Route = createFileRoute("/_admin/admin/security")({
  component: SecurityPage,
});

const events = [
  { when: "12:04", who: "Kwame Mensah", ip: "154.161.24.11", geo: "Accra, GH", event: "Login OK", status: "cleared" as const },
  { when: "11:58", who: "Unknown", ip: "185.220.101.44", geo: "Berlin, DE", event: "Blocked — Tor exit", status: "failed" as const },
  { when: "11:22", who: "Admin (Kojo)", ip: "10.0.14.2", geo: "Accra, GH", event: "Role updated MB-0004", status: "cleared" as const },
];

function SecurityPage() {
  return (
    <>
      <PageHeader eyebrow="Administrator" title="Security Centre" description="Sessions, geo tracking, firewall, malware scans and audit trail." />
      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat label="Live sessions" value={<span className="tabular">312</span>} />
        <KPIStat label="Blocked 24h" value={<span className="tabular">47</span>} accent />
        <KPIStat label="Malware scans" value={<span className="tabular">1,204</span>} hint="0 threats" />
        <KPIStat label="OWASP posture" value={<span className="tabular">A</span>} hint="ASVS L2" />
      </section>
      <SectionCard
        title="Security events"
        action={
          <ExportBar
            permission="export:security"
            title="Security Events"
            subtitle={`${events.length} events`}
            filename="security_events"
            columns={[
              { header: "Time", accessor: (e: typeof events[number]) => e.when },
              { header: "Actor", accessor: (e) => e.who },
              { header: "IP", accessor: (e) => e.ip },
              { header: "Geo", accessor: (e) => e.geo },
              { header: "Event", accessor: (e) => e.event },
              { header: "Status", accessor: (e) => e.status.toUpperCase(), align: "right" },
            ]}
            rows={events}
          />
        }
      >
        <table className="w-full">
          <thead>
            <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
              <th className="px-6 py-3 font-medium">Time</th>
              <th className="px-6 py-3 font-medium">Actor</th>
              <th className="px-6 py-3 font-medium">IP</th>
              <th className="px-6 py-3 font-medium">Geo</th>
              <th className="px-6 py-3 font-medium">Event</th>
              <th className="px-6 py-3 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-deep/5">
            {events.map((e, i) => (
              <tr key={i}>
                <td className="tabular px-6 py-4 text-sm">{e.when}</td>
                <td className="px-6 py-4 text-sm font-semibold">{e.who}</td>
                <td className="tabular px-6 py-4 text-sm">{e.ip}</td>
                <td className="px-6 py-4 text-sm">{e.geo}</td>
                <td className="px-6 py-4 text-sm text-emerald-deep/60">{e.event}</td>
                <td className="px-6 py-4 text-right"><StatusPill status={e.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </>
  );
}
