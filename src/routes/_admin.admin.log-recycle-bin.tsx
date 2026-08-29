import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { toast } from "sonner";
import { RotateCcw, Trash2 } from "lucide-react";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
} from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/table-controls";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import {
  listLogRecycleBin,
  restoreLogEntries,
  deleteLogEntriesForever,
  type LogBinRow,
} from "@/lib/log-recycle-bin.functions";


const search = z.object({
  kind: fallback(z.enum(["all", "audit_log", "runtime_error_logs"]), "all").default("all"),
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
  page: fallback(z.number().int(), 1).default(1),
  pageSize: fallback(z.number().int(), 25).default(25),
});
type Search = z.infer<typeof search>;

export const Route = createFileRoute("/_admin/admin/log-recycle-bin")({
  validateSearch: zodValidator(search),
  head: () => ({
    meta: [
      { title: "Log Recycle Bin — IT-360 CashApp" },
      {
        name: "description",
        content:
          "Review purged audit and runtime event log entries, filter them by purge date and restore selected snapshots back into the active logs.",
      },
      { property: "og:title", content: "Log Recycle Bin — IT-360 CashApp" },
      {
        property: "og:description",
        content: "Browse and restore purged audit and event log entries.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LogRecycleBinPage,
});

const binQuery = (s: Search) =>
  queryOptions({
    queryKey: ["admin", "log-recycle-bin", s],
    queryFn: () =>
      listLogRecycleBin({
        data: {
          kind: s.kind,
          from: s.from,
          to: s.to,
          page: Math.max(1, s.page),
          pageSize: Math.min(200, Math.max(5, s.pageSize)),
        },
      }),
  });

function label(kind: LogBinRow["entity_table"]) {
  return kind === "audit_log" ? "Audit log" : "Event log";
}

function summary(row: LogBinRow) {
  const p = row.payload as Record<string, unknown>;
  if (row.entity_table === "audit_log") {
    return [p["action"], p["target"], p["actor_email"]].filter(Boolean).join(" · ");
  }
  return [p["kind"], p["severity"], p["message"]].filter(Boolean).join(" · ");
}

function occurredAt(row: LogBinRow) {
  const p = row.payload as Record<string, unknown>;
  const raw = (p["created_at"] ?? p["occurred_at"]) as string | undefined;
  return raw ? new Date(raw).toLocaleString() : "—";
}

function LogRecycleBinPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Log recycle bin"
        description="Purged audit and runtime event log entries, retained for 2 years and restorable."
      />
      <Suspense fallback={<SectionCardSkeleton />}>
        <BinTable />
      </Suspense>
    </div>
  );
}

function BinTable() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const { data } = useSuspenseQuery(binQuery(s));
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");


  const canRestore = hasRole("super_admin");
  const update = (patch: Partial<Search>) => {
    setPicked([]);
    navigate({ search: (prev: Search) => ({ ...prev, ...patch, page: patch.page ?? 1 }) });
  };

  const pickedRows = data.rows.filter((r) => picked.includes(r.id));
  const groups = {
    audit_log: pickedRows.filter((r) => r.entity_table === "audit_log").map((r) => r.id),
    runtime_error_logs: pickedRows
      .filter((r) => r.entity_table === "runtime_error_logs")
      .map((r) => r.id),
  };

  const restore = async () => {
    setBusy(true);
    try {
      let restored = 0;
      for (const kind of ["audit_log", "runtime_error_logs"] as const) {
        const ids = groups[kind];
        if (ids.length === 0) continue;
        const res = await restoreLogEntries({ data: { kind, ids } });
        restored += res.restored;
      }
      toast.success(`${restored} log entr${restored === 1 ? "y" : "ies"} restored`);
      setPicked([]);
      await qc.invalidateQueries({ queryKey: ["admin", "log-recycle-bin"] });
      await qc.invalidateQueries({ queryKey: ["admin", "runtime-error-logs"] });
      await qc.invalidateQueries({ queryKey: ["admin", "loan-audit"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setBusy(false);
    }
  };

  const deleteForever = async () => {
    setBusy(true);
    try {
      const res = await deleteLogEntriesForever({
        data: { ids: picked, confirm: "DELETE" },
      });
      toast.success(
        `${res.deleted} snapshot${res.deleted === 1 ? "" : "s"} permanently deleted`,
      );
      setPicked([]);
      setConfirmOpen(false);
      setConfirmText("");
      await qc.invalidateQueries({ queryKey: ["admin", "log-recycle-bin"] });
      await qc.invalidateQueries({ queryKey: ["admin", "loan-audit"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Permanent delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title={`Purged entries · ${data.total}`}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" asChild>
            <Link to="/admin/audit">Audit log</Link>
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/admin/logs" search={{ kind: "all", severity: "all", page: 1 }}>
              Event log
            </Link>

          </Button>
          {canRestore ? (
            <>
              <Button size="sm" disabled={picked.length === 0 || busy} onClick={restore}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                {busy
                  ? "Restoring…"
                  : `Restore selected${picked.length ? ` (${picked.length})` : ""}`}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={picked.length === 0 || busy}
                onClick={() => {
                  setConfirmText("");
                  setConfirmOpen(true);
                }}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Delete forever{picked.length ? ` (${picked.length})` : ""}
              </Button>
            </>
          ) : null}
        </div>
      }
    >
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently delete {picked.length} snapshot(s)?</DialogTitle>
            <DialogDescription>
              This is irreversible — the selected purged log entries can never be restored.
              A final audit entry recording this deletion will be written.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Type <span className="font-mono font-semibold">DELETE</span> to confirm.
            </p>
            <Input
              aria-label="Type DELETE to confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy || confirmText !== "DELETE" || picked.length === 0}
              onClick={deleteForever}
            >
              {busy ? "Deleting…" : "Permanently delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <div className="grid gap-3 border-b border-emerald-deep/10 p-4 md:grid-cols-4">
        <Select value={s.kind} onValueChange={(v) => update({ kind: v as Search["kind"] })}>
          <SelectTrigger>
            <SelectValue placeholder="Log type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All logs</SelectItem>
            <SelectItem value="audit_log">Audit log</SelectItem>
            <SelectItem value="runtime_error_logs">Event log</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          aria-label="Purged from"
          value={s.from}
          onChange={(e) => update({ from: e.target.value })}
        />
        <Input
          type="date"
          aria-label="Purged to"
          value={s.to}
          onChange={(e) => update({ to: e.target.value })}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => update({ kind: "all", from: "", to: "" })}
        >
          Clear filters
        </Button>
      </div>

      {data.rows.length === 0 ? (
        <EmptyState
          icon={<Trash2 />}
          title="Nothing in the log recycle bin"
          hint="Purged audit and event log entries appear here for 2 years before they are permanently removed."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-cream/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-3 text-left">
                  <input
                    type="checkbox"
                    aria-label="Select all snapshots on this page"
                    checked={picked.length === data.rows.length}
                    onChange={(e) =>
                      setPicked(e.target.checked ? data.rows.map((r) => r.id) : [])
                    }
                  />
                </th>
                <th className="p-3 text-left">Log</th>
                <th className="p-3 text-left">Original time</th>
                <th className="p-3 text-left">Entry</th>
                <th className="p-3 text-left">Purged</th>
                <th className="p-3 text-left">Auto-delete</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} className="border-t border-emerald-deep/5 hover:bg-cream/30">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      aria-label="Select snapshot"
                      checked={picked.includes(row.id)}
                      onChange={(e) =>
                        setPicked((prev) =>
                          e.target.checked
                            ? [...prev, row.id]
                            : prev.filter((id) => id !== row.id),
                        )
                      }
                    />
                  </td>
                  <td className="p-3 font-medium">{label(row.entity_table)}</td>
                  <td className="p-3 font-mono text-[11px]">{occurredAt(row)}</td>
                  <td className="p-3 max-w-[420px] truncate">{summary(row)}</td>
                  <td className="p-3 font-mono text-[11px]">
                    {new Date(row.deleted_at).toLocaleString()}
                  </td>
                  <td className="p-3 font-mono text-[11px] text-muted-foreground">
                    {new Date(row.purge_after).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-t border-emerald-deep/10 p-4">
        <Pagination
          page={s.page}
          pageSize={s.pageSize}
          total={data.total}
          onPage={(page: number) => update({ page })}
          onPageSize={(pageSize: number) => update({ pageSize, page: 1 })}
        />
      </div>
    </SectionCard>
  );
}
