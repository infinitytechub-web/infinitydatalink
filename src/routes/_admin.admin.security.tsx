import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Activity, ShieldAlert, FileSearch, Radio, BellRing } from "lucide-react";
import { ErrorState, PageHeader } from "@/components/primitives";

export const Route = createFileRoute("/_admin/admin/security")({
  head: () => ({
    meta: [
      { title: "Security Centre — IT-360 Admin" },
      {
        name: "description",
        content:
          "Security event log, firewall and rate-limit controls, upload scanning results and privacy-aware live session monitoring.",
      },
      { property: "og:title", content: "Security Centre — IT-360 Admin" },
      {
        property: "og:description",
        content:
          "Administrator security operations: events, firewall, upload scans and live sessions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SecurityLayout,
  errorComponent: ({ error }) => (
    <div className="p-6">
      <ErrorState title="Security Centre unavailable" message={(error as Error).message} />
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm text-muted-foreground">Not found.</div>,
});

const TABS = [
  { to: "/admin/security", label: "Event log", icon: Activity, exact: true },
  { to: "/admin/security/firewall", label: "Firewall & rate limits", icon: ShieldAlert },
  { to: "/admin/security/uploads", label: "Upload scanning", icon: FileSearch },
  { to: "/admin/security/sessions", label: "Live sessions", icon: Radio },
  { to: "/admin/security/alerts", label: "Alert notifications", icon: BellRing },
] as const;

function SecurityLayout() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administrator"
        title="Security Centre"
        description="Security event trail, network firewall and rate-limit policy, secure upload scanning and privacy-aware session monitoring. Network identifiers are redacted unless you hold the security management permission."
      />
      <nav aria-label="Security Centre sections" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            activeOptions={{ exact: "exact" in t ? t.exact : false }}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-deep/15 bg-card px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:bg-cream"
            activeProps={{
              className:
                "inline-flex items-center gap-2 rounded-full border border-emerald-mid/40 bg-emerald-mid/10 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-emerald-mid",
            }}
          >
            <t.icon className="h-3.5 w-3.5" aria-hidden />
            {t.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
