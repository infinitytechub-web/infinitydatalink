import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Suspense, useState } from "react";
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
import { listEntities, decideEntity, type EntityRow } from "@/lib/admin-entities.functions";
import { KycRecordActions } from "@/components/kyc-record-actions";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const TYPE_LABEL: Record<string, string> = {
  all: "All entities",
  group: "Groups",
  department: "Departments",
  institution: "Institutions",
};

const search = z.object({
  type: fallback(z.enum(["group", "department", "institution", "all"]), "all").default("all"),
  status: fallback(z.string(), "all").default("all"),
  q: fallback(z.string(), "").default(""),
  page: fallback(z.number().int().min(1), 1).default(1),
});
type SearchInput = z.infer<typeof search>;

const PAGE_SIZE = 20;

const entitiesQuery = (s: SearchInput) =>
  queryOptions({
    queryKey: ["admin", "entities", s.type, s.status, s.q, s.page],
    queryFn: () =>
      listEntities({
        data: {
          type: s.type === "all" ? undefined : s.type,
          status: s.status,
          q: s.q || undefined,
          page: s.page,
          pageSize: PAGE_SIZE,
        },
      }),
  });

export const Route = createFileRoute("/_admin/admin/entities/")({
  validateSearch: zodValidator(search),
  component: EntitiesPage,
  errorComponent: ({ error }) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const router = useRouter();
    return (
      <div className="p-6">
        <ErrorState
          title="Entities failed to load"
          message={error.message}
          onRetry={() => router.invalidate()}
        />
      </div>
    );
  },
});

function EntitiesPage() {
  const s = Route.useSearch();
  const navigate = useNavigate();
  return (
    <>
      <PageHeader
        eyebrow="Membership"
        title={TYPE_LABEL[s.type]}
        description="Group, department and institutional members. Review, approve, or suspend registrations."
        action={
          s.type !== "all" ? (
            <Link
              to="/admin/entities/register"
              search={{ type: s.type as any }}
              className="rounded-md bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90"
            >
              Register {s.type}
            </Link>
          ) : null
        }
      />

      <nav aria-label="Entity type" className="mb-4 flex flex-wrap gap-2">
        {(["all", "group", "department", "institution"] as const).map((t) => (
          <Link
            key={t}
            to="/admin/entities"
            search={{ type: t, status: s.status, q: s.q, page: 1 }}
            className={
              "rounded-md border px-3 py-1.5 text-xs font-medium " +
              (s.type === t
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background hover:bg-muted")
            }
          >
            {TYPE_LABEL[t]}
          </Link>
        ))}
      </nav>

      <FilterBar
        search={s}
        onChange={(next) => navigate({ to: "/admin/entities", search: next })}
      />

      <Suspense fallback={<SectionCardSkeleton title={TYPE_LABEL[s.type]} rows={8} cols={5} />}>
        <EntitiesBody search={s} />
      </Suspense>
    </>
  );
}

function FilterBar({
  search: s,
  onChange,
}: {
  search: SearchInput;
  onChange: (next: SearchInput) => void;
}) {
  const [q, setQ] = useState(s.q);
  return (
    <form
      className="mb-4 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onChange({ ...s, q, page: 1 });
      }}
    >
      <input
        className="w-56 rounded-md border border-border bg-background px-3 py-1.5 text-xs"
        placeholder="Search by name or reg no."
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <select
        className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
        value={s.status}
        onChange={(e) => onChange({ ...s, status: e.target.value, page: 1 })}
      >
        <option value="all">All statuses</option>
        <option value="pending">Pending</option>
        <option value="active">Active</option>
        <option value="suspended">Suspended</option>
        <option value="closed">Closed</option>
      </select>
      <button
        type="submit"
        className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted"
      >
        Apply
      </button>
      {s.q ? (
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            setQ("");
            onChange({ ...s, q: "", page: 1 });
          }}
        >
          Clear
        </button>
      ) : null}
    </form>
  );
}

function EntitiesBody({ search: s }: { search: SearchInput }) {
  const { data } = useSuspenseQuery(entitiesQuery(s));
  const navigate = useNavigate();
  const qc = useQueryClient();
  const decideFn = useServerFn(decideEntity);
  const rows = data.rows;
  const total = data.total;
  const pending = rows.filter((r) => r.status === "pending").length;
  const active = rows.filter((r) => r.status === "active").length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-8">
      <section className="grid gap-6 md:grid-cols-3">
        <KPIStat label="Total matches" value={<span className="tabular">{total}</span>} />
        <KPIStat
          label="Awaiting review (page)"
          value={<span className="tabular">{pending}</span>}
          accent
        />
        <KPIStat label="Active (page)" value={<span className="tabular">{active}</span>} />
      </section>

      <SectionCard title="Directory">
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No entities" hint="Nothing matches this filter yet." />
          </div>
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
                  <tr key={e.id} className="hover:bg-muted/40">
                    <td className="px-6 py-3 font-medium">{e.name}</td>
                    <td className="px-6 py-3 capitalize text-muted-foreground">{e.type}</td>
                    <td className="px-6 py-3 text-muted-foreground">{e.region ?? "—"}</td>
                    <td className="px-6 py-3 text-right tabular">{e.member_count ?? 0}</td>
                    <td className="px-6 py-3">
                      <StatusPill status={e.status as any} />
                    </td>
                    <td className="px-6 py-3">
                      <KycRecordActions
                        label={`${e.type} KYC record`}
                        title={`${e.type.toUpperCase()} KYC — ${e.name}`}
                        subtitle={`Status ${e.status}`}
                        filename={`entity_kyc_${e.name}`}
                        fields={[
                          { label: "Name", value: e.name },
                          { label: "Type", value: e.type },
                          { label: "Status", value: e.status },
                          { label: "Region", value: e.region ?? "—" },
                          { label: "Members", value: String(e.member_count ?? 0) },
                        ]}
                        approveLabel="Approve"
                        rejectLabel={e.status === "pending" ? "Reject" : "Suspend"}
                        disabled={{
                          approve: e.status !== "pending",
                          reject: e.status !== "pending" && e.status !== "active",
                        }}
                        onView={() =>
                          navigate({ to: "/admin/entities/$entityId", params: { entityId: e.id } })
                        }
                        onEdit={() =>
                          navigate({ to: "/admin/entities/$entityId", params: { entityId: e.id } })
                        }
                        onDecide={async (decision, note) => {
                          await decideFn({
                            data: {
                              id: e.id,
                              action: decision === "approved" ? "approve" : "suspend",
                              note,
                            },
                          });
                          toast.success(
                            `${e.name} ${decision === "approved" ? "approved" : "updated"}`,
                          );
                          qc.invalidateQueries({ queryKey: ["admin", "entities"] });
                        }}
                        className="justify-end"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-border p-3 text-xs">
            <span className="text-muted-foreground">
              Page {s.page} of {pages} · {total} total
            </span>
            <div className="flex gap-2">
              <Link
                to="/admin/entities"
                search={{ ...s, page: Math.max(1, s.page - 1) }}
                disabled={s.page <= 1}
                className={
                  "rounded-md border border-border bg-background px-3 py-1 hover:bg-muted " +
                  (s.page <= 1 ? "pointer-events-none opacity-50" : "")
                }
              >
                Prev
              </Link>
              <Link
                to="/admin/entities"
                search={{ ...s, page: Math.min(pages, s.page + 1) }}
                disabled={s.page >= pages}
                className={
                  "rounded-md border border-border bg-background px-3 py-1 hover:bg-muted " +
                  (s.page >= pages ? "pointer-events-none opacity-50" : "")
                }
              >
                Next
              </Link>
            </div>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
