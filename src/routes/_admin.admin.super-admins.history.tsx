import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { EmptyState, PageHeader, SectionCard, StatusPill } from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import {
  exportSuperAdminRoleHistory,
  listSuperAdminRoleHistory,
  type RoleHistoryRow,
} from "@/lib/admin-roles.functions";
import { exportCsv } from "@/lib/exports";

const SORT_KEYS = ["occurred_at", "actor_email", "action"] as const;
type SortKey = (typeof SORT_KEYS)[number];

const searchSchema = z.object({
  event: z.enum(["all", "grant", "revoke"]).default("all"),
  emailContains: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(10).max(200).default(50),
  sortBy: z.enum(SORT_KEYS).default("occurred_at"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  selected: z.string().optional(),
});


export const Route = createFileRoute("/_admin/admin/super-admins/history")({
  head: () => ({
    meta: [
      { title: "Super Admin grant history — IT-360 CashApp" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s) => searchSchema.parse(s),
  component: HistoryPage,
});

function historyQuery(input: {
  event: "all" | "grant" | "revoke";
  emailContains?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
  sortBy: SortKey;
  sortDir: "asc" | "desc";
}) {
  return queryOptions({
    queryKey: ["admin", "super-admins", "history", input],
    queryFn: async () =>
      await listSuperAdminRoleHistory({
        data: {
          event: input.event,
          emailContains: input.emailContains?.trim() || undefined,
          from: input.from || undefined,
          to: input.to || undefined,
          limit: input.pageSize,
          offset: (input.page - 1) * input.pageSize,
          sortBy: input.sortBy,
          sortDir: input.sortDir,
        },
      }),
    staleTime: 30_000,
  });
}

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function HistoryPage() {
  const { user, hasRole, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  if (!hasRole("super_admin")) return <Navigate to="/admin" />;
  return (
    <>
      <PageHeader
        eyebrow="Governance"
        title="Super Admin grant & revoke history"
        description="Every Super Admin role assignment and removal, with exact timestamps and the officer who performed the action."
      />
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <HistoryBody />
      </Suspense>
    </>
  );
}

function HistoryBody() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [emailDraft, setEmailDraft] = useState(search.emailContains ?? "");

  const { rows, total } = useSuspenseQuery(
    historyQuery({
      event: search.event,
      emailContains: search.emailContains,
      from: search.from,
      to: search.to,
      page: search.page,
      pageSize: search.pageSize,
      sortBy: search.sortBy,
      sortDir: search.sortDir,
    }),
  ).data;

  const selected = search.selected
    ? rows.find((r) => r.id === search.selected) ?? null
    : null;

  const totalPages = Math.max(1, Math.ceil(total / search.pageSize));

  const toggleSort = (key: SortKey) => {
    navigate({
      search: (s: any) => ({
        ...s,
        sortBy: key,
        sortDir: s.sortBy === key && s.sortDir === "desc" ? "asc" : "desc",
        page: 1,
      }),
    });
  };

  const doExportCsv = async () => {
    try {
      toast.loading("Preparing CSV export…", { id: "hist-csv" });
      const { rows: all } = await exportSuperAdminRoleHistory({
        data: {
          event: search.event,
          emailContains: search.emailContains?.trim() || undefined,
          from: search.from || undefined,
          to: search.to || undefined,
          sortBy: search.sortBy,
          sortDir: search.sortDir,
        },
      });
      exportCsv({
        title: "Super Admin grant history",
        filename: `super-admin-history-${new Date().toISOString().slice(0, 10)}.csv`,
        rows: all,
        columns: [
          { header: "Occurred At", accessor: (r) => r.occurred_at },
          { header: "Event", accessor: (r) => r.event },
          { header: "Target Email", accessor: (r) => r.target_email ?? "" },
          { header: "Target User ID", accessor: (r) => r.target_user_id },
          { header: "Actor Email", accessor: (r) => r.actor_email ?? "" },
          { header: "Actor Role", accessor: (r) => r.actor_role ?? "" },
          { header: "Note", accessor: (r) => r.note ?? "" },
          { header: "Reason", accessor: (r) => r.reason ?? "" },
          {
            header: "Currently super_admin",
            accessor: (r) => (r.currently_super_admin ? "yes" : "no"),
          },
        ],
      });
      toast.success(`Exported ${all.length} row${all.length === 1 ? "" : "s"}`, {
        id: "hist-csv",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed", { id: "hist-csv" });
    }
  };

  return (
    <>
      <SectionCard title={`Events (${total})`}>
        <div className="grid gap-3 border-b border-emerald-deep/5 p-6 md:grid-cols-4">
          <Field label="Event">
            <select
              value={search.event}
              onChange={(e) =>
                navigate({
                  search: (s: any) => ({
                    ...s,
                    event: e.target.value as "all" | "grant" | "revoke",
                    page: 1,
                  }),
                })
              }
              className="w-full rounded border border-emerald-deep/15 bg-transparent px-2 py-1 text-sm"
            >
              <option value="all">All</option>
              <option value="grant">Grants only</option>
              <option value="revoke">Revokes only</option>
            </select>
          </Field>
          <Field label="Target email contains">
            <input
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              onBlur={() =>
                navigate({
                  search: (s: any) => ({
                    ...s,
                    emailContains: emailDraft.trim() || undefined,
                    page: 1,
                  }),
                })
              }
              placeholder="name@company.com"
              className="w-full rounded border border-emerald-deep/15 bg-transparent px-2 py-1 text-sm"
            />
          </Field>
          <Field label="From">
            <input
              type="date"
              value={search.from?.slice(0, 10) ?? ""}
              onChange={(e) =>
                navigate({
                  search: (s: any) => ({
                    ...s,
                    from: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                    page: 1,
                  }),
                })
              }
              className="w-full rounded border border-emerald-deep/15 bg-transparent px-2 py-1 text-sm"
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={search.to?.slice(0, 10) ?? ""}
              onChange={(e) =>
                navigate({
                  search: (s: any) => ({
                    ...s,
                    to: e.target.value
                      ? new Date(e.target.value + "T23:59:59.999Z").toISOString()
                      : undefined,
                    page: 1,
                  }),
                })
              }
              className="w-full rounded border border-emerald-deep/15 bg-transparent px-2 py-1 text-sm"
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-emerald-deep/5 px-6 py-3 text-xs">
          <label className="flex items-center gap-2 text-emerald-deep/60">
            Rows per page
            <select
              value={search.pageSize}
              onChange={(e) =>
                navigate({
                  search: (s: any) => ({ ...s, pageSize: Number(e.target.value), page: 1 }),
                })
              }
              className="rounded border border-emerald-deep/15 bg-transparent px-2 py-1"
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="ml-auto flex gap-2">
            <button
              onClick={doExportCsv}
              className="rounded border border-emerald-deep/15 px-3 py-1 uppercase tracking-widest hover:bg-emerald-deep/5"
            >
              Export CSV
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState title="No events" hint="Adjust the filters or wait for role changes." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
                  <SortableTh
                    label="When"
                    active={search.sortBy === "occurred_at"}
                    dir={search.sortDir}
                    onClick={() => toggleSort("occurred_at")}
                  />
                  <SortableTh
                    label="Event"
                    active={search.sortBy === "action"}
                    dir={search.sortDir}
                    onClick={() => toggleSort("action")}
                  />
                  <th className="px-6 py-3 font-medium">Target</th>
                  <SortableTh
                    label="Actor"
                    active={search.sortBy === "actor_email"}
                    dir={search.sortDir}
                    onClick={() => toggleSort("actor_email")}
                  />
                  <th className="px-6 py-3 font-medium">Note / Reason</th>
                  <th className="px-6 py-3 font-medium">Current</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() =>
                      navigate({ search: (s: any) => ({ ...s, selected: r.id }) })
                    }
                    className="cursor-pointer border-b border-emerald-deep/5 hover:bg-emerald-deep/[0.02]"
                  >
                    <td className="px-6 py-3 tabular">{fmt(r.occurred_at)}</td>
                    <td className="px-6 py-3">
                      <StatusPill status={r.event === "grant" ? "approved" : "rejected"} />
                    </td>
                    <td className="px-6 py-3">
                      <div className="tabular">{r.target_email ?? "—"}</div>
                      <div className="text-xs text-emerald-deep/40">{r.target_user_id.slice(0, 8)}…</div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="tabular">{r.actor_email ?? "system"}</div>
                      <div className="text-xs text-emerald-deep/40">{r.actor_role ?? "—"}</div>
                    </td>
                    <td className="px-6 py-3 text-emerald-deep/70">
                      {r.note ?? r.reason ?? "—"}
                    </td>
                    <td className="px-6 py-3">
                      <StatusPill
                        status={r.currently_super_admin ? "active" : "closed"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-emerald-deep/5 px-6 py-3 text-xs">
          <span className="text-emerald-deep/50">
            Page {search.page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={search.page <= 1}
              onClick={() =>
                navigate({ search: (s: any) => ({ ...s, page: Math.max(1, search.page - 1) }) })
              }
              className="rounded border border-emerald-deep/15 px-3 py-1 uppercase tracking-widest disabled:opacity-40"
            >
              Prev
            </button>
            <button
              disabled={search.page >= totalPages}
              onClick={() =>
                navigate({ search: (s: any) => ({ ...s, page: search.page + 1 }) })
              }
              className="rounded border border-emerald-deep/15 px-3 py-1 uppercase tracking-widest disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </SectionCard>

      <DetailsDialog
        entry={selected}
        onClose={() => navigate({ search: (s: any) => ({ ...s, selected: undefined }) })}
      />
    </>
  );
}

function SortableTh({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <th className="px-6 py-3 font-medium">
      <button
        type="button"
        onClick={onClick}
        className={`flex items-center gap-1 uppercase tracking-widest ${active ? "text-emerald-deep" : ""}`}
      >
        {label}
        <span aria-hidden className="text-[8px]">
          {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-emerald-deep/50">
        {label}
      </span>
      {children}
    </label>
  );
}

function DetailsDialog({ entry, onClose }: { entry: RoleHistoryRow | null; onClose: () => void }) {
  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Role change details</DialogTitle>
          <DialogDescription>
            Full metadata for the selected {entry?.event} event.
          </DialogDescription>
        </DialogHeader>
        {entry ? (
          <div className="space-y-4 text-sm">
            <Row label="Event" value={entry.event.toUpperCase()} />
            <Row label="Occurred at" value={fmt(entry.occurred_at)} mono />
            <Row label="Target email" value={entry.target_email ?? "—"} mono />
            <Row label="Target user id" value={entry.target_user_id} mono />
            <Row label="Actor email" value={entry.actor_email ?? "system"} mono />
            <Row label="Actor role" value={entry.actor_role ?? "—"} />
            <Row label="Note" value={entry.note ?? "—"} />
            <Row label="Reason" value={entry.reason ?? "—"} />
            <Row
              label="Currently super_admin?"
              value={entry.currently_super_admin ? "Yes — still active" : "No — revoked"}
            />
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-widest text-emerald-deep/50">
                Raw metadata
              </div>
              <pre className="max-h-48 overflow-auto rounded bg-emerald-deep/5 p-3 text-xs">
                {JSON.stringify(entry.meta, null, 2)}
              </pre>
            </div>
            {entry.target_user_id ? (
              <div className="flex gap-2 pt-2">
                <Link
                  to="/admin/members/$id"
                  params={{ id: entry.target_user_id }}
                  className="rounded border border-emerald-deep/15 px-3 py-1 text-xs uppercase tracking-widest hover:bg-emerald-deep/5"
                >
                  Open member profile
                </Link>
                <button
                  onClick={() =>
                    void navigator.clipboard.writeText(JSON.stringify(entry, null, 2))
                  }
                  className="rounded border border-emerald-deep/15 px-3 py-1 text-xs uppercase tracking-widest hover:bg-emerald-deep/5"
                >
                  Copy JSON
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-3">
      <div className="text-[10px] font-medium uppercase tracking-widest text-emerald-deep/50">
        {label}
      </div>
      <div className={mono ? "tabular text-emerald-deep" : "text-emerald-deep"}>{value}</div>
    </div>
  );
}
