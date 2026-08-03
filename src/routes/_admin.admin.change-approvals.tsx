import { createFileRoute, Link, Navigate, Outlet } from "@tanstack/react-router";
import { ClipboardList, FilePlus2, History } from "lucide-react";
import { ErrorState, PageHeader } from "@/components/primitives";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_admin/admin/change-approvals")({
  head: () => ({
    meta: [
      { title: "Change Approvals — IT-360 Admin" },
      {
        name: "description",
        content:
          "Request sensitive configuration changes, review pending requests, approve or reject them with comments, apply approved changes and audit the full history.",
      },
      { property: "og:title", content: "Change Approvals — IT-360 Admin" },
      {
        property: "og:description",
        content: "Two-person change control for branding, roles, permissions and payment configuration.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ChangeApprovalsLayout,
  errorComponent: ({ error }) => (
    <div className="p-6">
      <ErrorState title="Change approvals unavailable" message={error.message} />
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm text-muted-foreground">Not found.</div>,
});

const TABS = [
  { to: "/admin/change-approvals", label: "Pending review", icon: ClipboardList, exact: true },
  { to: "/admin/change-approvals/new", label: "Request a change", icon: FilePlus2 },
  { to: "/admin/change-approvals/history", label: "Audit history", icon: History },
] as const;

function ChangeApprovalsLayout() {
  const { loading, can } = useAuth();
  if (loading) return null;
  if (!can("approvals", "view")) return <Navigate to="/admin" replace />;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Governance"
        title="Change Approvals"
        description="Sensitive configuration changes are staged as requests, reviewed by a second person, then applied. Requesters can never approve their own change."
      />
      <nav aria-label="Change approval sections" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            activeOptions={{ exact: "exact" in t ? t.exact : false }}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:bg-muted"
            activeProps={{
              className:
                "inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-primary",
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
