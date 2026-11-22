import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PauseCircle, PlayCircle, RefreshCw, Trash2 } from "lucide-react";
import { z } from "zod";
import {
  ErrorState,
  KPIStat,
  Money,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
} from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  adminCancelRecurring,
  adminListRecurring,
  adminRetryRecurring,
  type AdminRecurringRow,
} from "@/lib/admin-recurring.functions";

const SearchSchema = z.object({
  status: z.enum(["all", "active", "paused", "failed"]).catch("all").default("all"),
  q: z.string().max(120).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1).default(1),
});

type SearchParams = z.infer<typeof SearchSchema>;

const PAGE_SIZE = 25;

const listQuery = (s: SearchParams) =>
  queryOptions({
    queryKey: ["admin", "recurring", s],
    queryFn: () =>
      adminListRecurring({
        data: {
          status: s.status,
          search: s.q ?? null,
          page: s.page,
          page_size: PAGE_SIZE,
        },
      }),
    staleTime: 15_000,
  });

export const Route = createFileRoute("/_admin/admin/recurring")({
  validateSearch: (raw) => SearchSchema.parse(raw ?? {}),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(listQuery(deps)),
  head: () => ({ meta: [{ title: "Recurring schedules — Admin" }] }),
  component: AdminRecurringPage,
  errorComponent: ({ error }) => (
    <div className="p-6">
      <ErrorState title="Failed to load recurring schedules" message={(error as Error).message} />
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm text-muted-foreground">Not found.</div>,
});

function AdminRecurringPage() {
  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Recurring schedules"
        description="Every automated member deposit — filter by status, retry failed runs, or cancel schedules."
      />
      <Suspense fallback={<SectionCardSkeleton title="Recurring schedules" rows={8} cols={6} />}>
        <Body />
      </Suspense>
    </>
  );
}

function Body() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data } = useSuspenseQuery(listQuery(search));
  const [term, setTerm] = useState(search.q ?? "");

  const setStatus = (status: SearchParams["status"]) =>
    navigate({ search: (s: SearchParams) => ({ ...s, status, page: 1 }) });
  const setPage = (page: number) => navigate({ search: (s: SearchParams) => ({ ...s, page }) });

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <>
      <section className="grid gap-6 md:grid-cols-3">
        <KPIStat
          label="Active schedules"
          value={<span className="tabular">{data.active_count}</span>}
        />
        <KPIStat label="Paused" value={<span className="tabular">{data.paused_count}</span>} />
        <KPIStat
          label="Failed last run"
          value={<span className="tabular">{data.failed_count}</span>}
          accent
          hint="Needs attention"
        />
      </section>

      <SectionCard
        title="Schedules"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                navigate({
                  search: (s: SearchParams) => ({ ...s, q: term || undefined, page: 1 }),
                });
              }}
            >
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Search member, email, account…"
                className="h-9 w-64"
              />
            </form>
            <Select
              value={search.status}
              onValueChange={(v) => setStatus(v as SearchParams["status"])}
            >
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="failed">Failed last run</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      >
        {data.rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No schedules match these filters.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-6 py-3 font-medium">Member</th>
                <th className="px-6 py-3 font-medium">Account</th>
                <th className="px-6 py-3 font-medium">Schedule</th>
                <th className="px-6 py-3 text-right font-medium">Amount</th>
                <th className="px-6 py-3 font-medium">Next run</th>
                <th className="px-6 py-3 font-medium">Last run</th>
                <th className="px-6 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-deep/5">
              {data.rows.map((r) => (
                <Row key={r.id} r={r} />
              ))}
            </tbody>
          </table>
        )}
        <div className="flex items-center justify-between border-t border-emerald-deep/5 px-6 py-3 text-xs text-muted-foreground">
          <span>
            Page {search.page} of {totalPages} · {data.total} total
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={search.page <= 1}
              onClick={() => setPage(search.page - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={search.page >= totalPages}
              onClick={() => setPage(search.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </SectionCard>
    </>
  );
}

function scheduleLabel(r: AdminRecurringRow): string {
  if (r.frequency === "daily") return "Daily";
  if (r.frequency === "weekly") {
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `Weekly · ${names[r.day_of_week ?? 1]}`;
  }
  return `Monthly · day ${r.day_of_month ?? 1}`;
}

function Row({ r }: { r: AdminRecurringRow }) {
  const qc = useQueryClient();
  const retryFn = useServerFn(adminRetryRecurring);
  const retry = useMutation({
    mutationFn: () => retryFn({ data: { id: r.id } }),
    onSuccess: async () => {
      toast.success("Schedule requeued — next run is now.");
      await qc.invalidateQueries({ queryKey: ["admin", "recurring"] });
    },
    onError: (e: Error) => toast.error(`Retry failed: ${e.message}`),
  });

  const failed = r.last_run_status === "failed";
  const statusBadge = failed
    ? "bg-destructive/10 text-destructive"
    : r.status === "paused"
      ? "bg-amber-500/10 text-amber-700"
      : "bg-emerald-mid/10 text-emerald-mid";
  const statusLabel = failed ? "Failed" : r.status === "paused" ? "Paused" : "Active";

  return (
    <tr className="align-top">
      <td className="px-6 py-3 text-sm">
        <div className="font-semibold">{r.member_name ?? "Member"}</div>
        <div className="text-[11px] text-muted-foreground">
          {r.member_email ?? r.member_no ?? r.user_id.slice(0, 8)}
        </div>
      </td>
      <td className="px-6 py-3 text-sm text-muted-foreground">{r.account_label}</td>
      <td className="px-6 py-3 text-sm">
        <div>{scheduleLabel(r)}</div>
        <div className="mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
          <span className={`rounded px-1.5 py-0.5 ${statusBadge}`}>{statusLabel}</span>
          {r.status === "paused" ? (
            <PauseCircle className="h-3 w-3 text-amber-600" />
          ) : (
            <PlayCircle className="h-3 w-3 text-emerald-mid" />
          )}
        </div>
      </td>
      <td className="px-6 py-3 text-right">
        <Money amount={r.amount} />
      </td>
      <td className="px-6 py-3 text-[11px] text-muted-foreground">
        {new Date(r.next_run_at).toLocaleString()}
      </td>
      <td className="px-6 py-3 text-[11px] text-muted-foreground">
        {r.last_run_at ? new Date(r.last_run_at).toLocaleString() : "—"}
        {r.last_run_error ? (
          <div className="mt-1 max-w-xs truncate text-destructive" title={r.last_run_error}>
            {r.last_run_error}
          </div>
        ) : null}
      </td>
      <td className="px-6 py-3">
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-emerald-mid/40 text-emerald-mid hover:bg-emerald-mid/10"
            onClick={() => retry.mutate()}
            disabled={retry.isPending}
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Retry
          </Button>
          <CancelDialog r={r} />
        </div>
      </td>
    </tr>
  );
}

function CancelDialog({ r }: { r: AdminRecurringRow }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const qc = useQueryClient();
  const cancelFn = useServerFn(adminCancelRecurring);
  const mut = useMutation({
    mutationFn: () => cancelFn({ data: { id: r.id, note } }),
    onSuccess: async () => {
      toast.success("Schedule cancelled");
      setOpen(false);
      setNote("");
      await qc.invalidateQueries({ queryKey: ["admin", "recurring"] });
    },
    onError: (e: Error) => toast.error(`Cancel failed: ${e.message}`),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" /> Cancel
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel recurring schedule</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!note.trim()) return toast.error("A note is required.");
            mut.mutate();
          }}
        >
          <p className="text-sm text-muted-foreground">
            This permanently removes the schedule for{" "}
            <span className="font-semibold">{r.member_name ?? "the member"}</span> on{" "}
            <span className="font-semibold">{r.account_label}</span>. The member can create a new
            one later.
          </p>
          <Textarea
            rows={3}
            placeholder="Reason for cancellation"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Keep schedule
            </Button>
            <Button
              type="submit"
              disabled={mut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {mut.isPending ? "Cancelling…" : "Confirm cancellation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
