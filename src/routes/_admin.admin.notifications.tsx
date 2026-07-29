import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { z } from "zod";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, PageHeader, SectionCard, SectionCardSkeleton, StatusPill } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  adminListNotificationOutbox,
  adminRetryNotification,
  adminRunNotificationDispatch,
} from "@/lib/admin-notifications.functions";

const SearchSchema = z.object({
  status: z.enum(["all", "pending", "sent", "failed", "skipped"]).default("all"),
  channel: z.enum(["all", "email", "sms"]).default("all"),
  page: z.number().int().min(1).default(1),
});

export const Route = createFileRoute("/_admin/admin/notifications")({
  validateSearch: (s: Record<string, unknown>) => SearchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Notification delivery — IT-360 CashApp admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminNotificationsPage,
});

function AdminNotificationsPage() {
  const search = Route.useSearch();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Notification delivery"
        description="Monitor email and SMS alerts queued for loan and savings events, and retry anything that did not go out."
      />
      <Suspense fallback={<SectionCardSkeleton rows={8} />}>
        <OutboxTable key={`${search.status}-${search.channel}-${search.page}`} />
      </Suspense>
    </div>
  );
}

function OutboxTable() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);

  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["admin", "notification-outbox", search],
      queryFn: () =>
        adminListNotificationOutbox({
          data: { status: search.status, channel: search.channel, page: search.page, pageSize: 25 },
        }),
    }),
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "notification-outbox"] });

  const retry = useMutation({
    mutationFn: (ids: string[]) => adminRetryNotification({ data: { ids } }),
    onSuccess: (r) => {
      toast.success(`${r.requeued} alert(s) re-queued`);
      setSelected([]);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Retry failed"),
  });

  const dispatch = useMutation({
    mutationFn: () => adminRunNotificationDispatch(),
    onSuccess: (r) => {
      toast.success(`Dispatched ${r.sent} of ${r.processed} queued alert(s)`);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Dispatch failed"),
  });

  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <SectionCard
      title={`Outbox (${data.total})`}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            value={search.status}
            onChange={(e) => navigate({ search: { ...search, status: e.target.value as any, page: 1 } })}
          >
            {["all", "pending", "sent", "failed", "skipped"].map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All statuses" : s}
              </option>
            ))}
          </select>
          <select
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            value={search.channel}
            onChange={(e) => navigate({ search: { ...search, channel: e.target.value as any, page: 1 } })}
          >
            {["all", "email", "sms"].map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "All channels" : c}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" disabled={selected.length === 0 || retry.isPending} onClick={() => retry.mutate(selected)}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Retry selected
          </Button>
          <Button size="sm" disabled={dispatch.isPending} onClick={() => dispatch.mutate()}>
            <Send className="mr-1 h-3.5 w-3.5" /> {dispatch.isPending ? "Sending…" : "Run dispatch"}
          </Button>
        </div>
      }
    >
      {data.rows.length === 0 ? (
        <EmptyState title="Nothing queued" hint="Alerts appear here when loan or savings events fire." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 w-8" />
                  <th className="py-2">Alert</th>
                  <th className="py-2">Channel</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Attempts</th>
                  <th className="py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id} className="border-t border-border/60 align-top">
                    <td className="py-2">
                      <Checkbox
                        checked={selected.includes(row.id)}
                        onCheckedChange={(v) =>
                          setSelected((s) => (v ? [...s, row.id] : s.filter((id) => id !== row.id)))
                        }
                        aria-label={`Select ${row.title}`}
                      />
                    </td>
                    <td className="py-2">
                      <div className="font-medium">{row.title}</div>
                      <div className="text-xs text-muted-foreground">{row.category}</div>
                    </td>
                    <td className="py-2 text-xs uppercase">{row.channel}</td>
                    <td className="py-2">
                      <StatusPill
                        status={row.status === "sent" ? "cleared" : row.status === "pending" ? "pending" : "rejected"}
                      />
                      {row.error ? <div className="mt-1 max-w-xs text-xs text-muted-foreground">{row.error}</div> : null}
                    </td>
                    <td className="py-2 text-xs">{row.attempts}</td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {new Date(row.sent_at ?? row.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Page {data.page} of {pages}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={data.page <= 1}
                onClick={() => navigate({ search: { ...search, page: data.page - 1 } })}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={data.page >= pages}
                onClick={() => navigate({ search: { ...search, page: data.page + 1 } })}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </SectionCard>
  );
}
