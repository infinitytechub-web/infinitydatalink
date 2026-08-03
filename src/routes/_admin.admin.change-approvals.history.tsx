import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Download, Loader2 } from "lucide-react";
import { EmptyState, SectionCard } from "@/components/primitives";
import { Pagination } from "@/components/table-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listChangeAuditHistory } from "@/lib/change-approvals.functions";
import { exportCsv } from "@/lib/export-utils";

const ACTIONS = [
  "settings.change.requested",
  "settings.change.approved",
  "settings.change.rejected",
  "settings.change.applied",
] as const;

const ACTION_LABELS: Record<string, string> = {
  "settings.change.requested": "Requested",
  "settings.change.approved": "Approved & applied",
  "settings.change.rejected": "Rejected",
  "settings.change.applied": "Applied (retry)",
};

const SearchSchema = z.object({
  action: z.enum(["all", ...ACTIONS]).default("all"),
  actor: z.string().default(""),
  from: z.string().default(""),
  to: z.string().default(""),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(100).default(25),
});
type Search = z.infer<typeof SearchSchema>;

export const Route = createFileRoute("/_admin/admin/change-approvals/history")({
  validateSearch: (search) => SearchSchema.parse(search),
  component: ChangeAuditHistoryPage,
});

function ChangeAuditHistoryPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const load = useServerFn(listChangeAuditHistory);

  const query = useQuery({
    queryKey: ["change-audit-history", search],
    queryFn: () =>
      load({
        data: {
          action: search.action,
          actorContains: search.actor,
          ...(search.from ? { from: new Date(`${search.from}T00:00:00.000Z`).toISOString() } : {}),
          ...(search.to ? { to: new Date(`${search.to}T23:59:59.999Z`).toISOString() } : {}),
          page: search.page,
          pageSize: search.pageSize,
        },
      }),
  });

  const rows = query.data?.rows ?? [];
  const setSearch = (patch: Partial<Search>) =>
    navigate({ search: (prev: Search) => ({ ...prev, page: 1, ...patch }) });

  return (
    <SectionCard
      title="Change approval audit history"
      action={
        <Button
          size="sm"
          variant="outline"
          disabled={rows.length === 0}
          onClick={() =>
            exportCsv(
              "change-approval-audit",
              ["Timestamp", "Event", "Actor", "Role", "Request"],
              rows.map((r) => [
                new Date(r.created_at).toISOString(),
                ACTION_LABELS[r.action] ?? r.action,
                r.actor_email ?? "system",
                r.actor_role ?? "",
                r.target ?? "",
              ]),
            )
          }
        >
          <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
        </Button>
      }
    >
      <div className="flex flex-wrap items-end gap-3 border-b border-border/60 px-5 py-4">
        <div className="grid gap-1.5">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Event</Label>
          <select
            value={search.action}
            onChange={(e) => setSearch({ action: e.target.value as Search["action"] })}
            className="h-9 rounded-md border border-border bg-card px-2 text-sm"
          >
            <option value="all">All lifecycle events</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABELS[a]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Actor email</Label>
          <Input
            value={search.actor}
            onChange={(e) => setSearch({ actor: e.target.value })}
            placeholder="name@example.com"
            className="h-9 w-56"
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">From</Label>
          <Input
            type="date"
            value={search.from}
            onChange={(e) => setSearch({ from: e.target.value })}
            className="h-9"
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">To</Label>
          <Input
            type="date"
            value={search.to}
            onChange={(e) => setSearch({ to: e.target.value })}
            className="h-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
          Refresh
        </Button>
      </div>

      {query.isLoading ? (
        <div className="p-10 text-center text-sm text-muted-foreground">Loading audit history…</div>
      ) : rows.length === 0 ? (
        <div className="p-6">
          <EmptyState
            title="No audit entries match these filters"
            hint="Every request, approval, rejection and retry is recorded here."
          />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border/60 text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Timestamp</th>
                  <th className="px-5 py-3 text-left font-medium">Event</th>
                  <th className="px-5 py-3 text-left font-medium">Actor</th>
                  <th className="px-5 py-3 text-left font-medium">Details</th>
                  <th className="px-5 py-3 text-right font-medium">Request</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/40 last:border-0">
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-muted-foreground tabular-nums">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-xs font-medium">{ACTION_LABELS[row.action] ?? row.action}</td>
                    <td className="px-5 py-3 text-xs">
                      {row.actor_email ?? "system"}
                      {row.actor_role ? (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {row.actor_role}
                        </span>
                      ) : null}
                    </td>
                    <td className="max-w-sm px-5 py-3">
                      <code className="block truncate text-[11px] text-muted-foreground">
                        {JSON.stringify(row.meta)}
                      </code>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {row.target ? (
                        <Button asChild size="sm" variant="outline">
                          <Link to="/admin/change-approvals/$id" params={{ id: row.target }}>
                            Open
                          </Link>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={search.page}
            pageSize={search.pageSize}
            total={query.data?.total ?? 0}
            onPage={(n) => navigate({ search: (prev: Search) => ({ ...prev, page: n }) })}
            onPageSize={(n) => navigate({ search: (prev: Search) => ({ ...prev, pageSize: n, page: 1 }) })}
          />
        </>
      )}
    </SectionCard>
  );
}
