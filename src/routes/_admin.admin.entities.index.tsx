import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Suspense } from "react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  EmptyState,
  ErrorState,
  KPIStat,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
  StatusPill,
} from "@/components/primitives";
import { listEntities, type EntityRow, type EntityType } from "@/lib/admin-entities.functions";

const TYPE_LABEL: Record<EntityType | "all", string> = {
  all: "All entities",
  group: "Groups",
  department: "Departments",
  institution: "Institutions",
};

const search = z.object({
  type: fallback(z.enum(["group", "department", "institution", "all"]), "all").default("all"),
  status: fallback(z.string(), "all").default("all"),
});
type SearchInput = z.infer<typeof search>;

const entitiesQuery = (s: SearchInput) =>
  queryOptions({
    queryKey: ["admin", "entities", s.type, s.status],
    queryFn: () =>
      listEntities({
        data: {
          type: s.type === "all" ? undefined : s.type,
          status: s.status,
          limit: 100,
        },
      }),
  });

export const Route = createFileRoute("/_admin/admin/entities")({
  validateSearch: zodValidator(search),
  component: EntitiesPage,
  errorComponent: ({ error }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <ErrorState title="Entities failed to load" message={error.message} onRetry={() => router.invalidate()} />
      </div>
    );
  },
});

function EntitiesPage() {
  const s = Route.useSearch();
  return (
    <>
      <PageHeader
        eyebrow="Membership"
        title={TYPE_LABEL[s.type]}
        description="Group, department and institutional members. Review, approve, or suspend registrations."
      />

      <nav aria-label="Entity type" className="mb-4 flex flex-wrap gap-2">
        {(["all", "group", "department", "institution"] as const).map((t) => (
          <Link
            key={t}
            to="/admin/entities"
            search={{ type: t, status: s.status }}
            className={
              "rounded-md border px-3 py-1.5 text-xs font-medium " +
              (s.type === t ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:bg-muted")
            }
          >
            {TYPE_LABEL[t]}
          </Link>
        ))}
      </nav>

      <Suspense fallback={<SectionCardSkeleton title={TYPE_LABEL[s.type]} rows={8} cols={5} />}>
        <EntitiesBody search={s} />
      </Suspense>
    </>
  );
}

function EntitiesBody({ search: s }: { search: SearchInput }) {
  const { data: rows } = useSuspenseQuery(entitiesQuery(s));
  const total = rows.length;
  const pending = rows.filter((r) => r.status === "pending").length;
  const active = rows.filter((r) => r.status === "active").length;

  return (
    <div className="space-y-8">
      <section className="grid gap-6 md:grid-cols-3">
        <KPIStat label="Total in view" value={<span className="tabular">{total}</span>} />
        <KPIStat label="Awaiting review" value={<span className="tabular">{pending}</span>} accent />
        <KPIStat label="Active" value={<span className="tabular">{active}</span>} />
      </section>

      <SectionCard
        title="Directory"
        action={
          <select
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            value={s.status}
            onChange={(e) => {
              const params = new URLSearchParams(window.location.search);
              params.set("status", e.target.value);
              params.set("type", s.type);
              window.location.search = params.toString();
            }}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="closed">Closed</option>
          </select>
        }
      >
        {rows.length === 0 ? (
          <div className="p-6"><EmptyState title="No entities" hint="Nothing matches this filter yet." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 text-left">Name</th>
                  <th className="px-6 py-3 text-left">Type</th>
                  <th className="px-6 py-3 text-left">Region</th>
                  <th className="px-6 py-3 text-right">Members</th>
                  <th className="px-6 py-3 text-left">Status</th>
                  <th className="px-6 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((e: EntityRow) => (
                  <tr key={e.id}>
                    <td className="px-6 py-3 font-medium">{e.name}</td>
                    <td className="px-6 py-3 capitalize text-muted-foreground">{e.type}</td>
                    <td className="px-6 py-3 text-muted-foreground">{e.region ?? "—"}</td>
                    <td className="px-6 py-3 text-right tabular">{e.member_count ?? 0}</td>
                    <td className="px-6 py-3"><StatusPill status={e.status as any} /></td>
                    <td className="px-6 py-3 text-right">
                      <Link
                        to="/admin/entities/$entityId"
                        params={{ entityId: e.id }}
                        className="rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-muted"
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
