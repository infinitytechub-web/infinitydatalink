import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { BellRing, CheckCheck, MailOpen, RotateCcw, Search, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, SectionCardSkeleton, EmptyState, StatusPill } from "@/components/primitives";
import { Pagination } from "@/components/table-controls";
import { KycReminderLog } from "@/components/kyc-reminder-log";
import { Button } from "@/components/ui/button";
import { NOTIFICATION_CATEGORIES } from "@/lib/notification-preferences.functions";
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationUnread,
  markNotificationsRead,
} from "@/lib/notifications.functions";

const searchSchema = z.object({
  page: fallback(z.number().int(), 1).default(1),
  page_size: fallback(z.number().int(), 25).default(25),
  status: fallback(z.string(), "all").default("all"),
  category: fallback(z.string(), "").default(""),
  q: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/_member/app/inbox")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Notifications centre — IT-360 CashApp" },
      {
        name: "description",
        content: "Review, filter and mark your IT-360 CashApp in-app notifications as read.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InboxPage,
});

const STATUSES = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "read", label: "Read" },
] as const;

type CategoryKey = (typeof NOTIFICATION_CATEGORIES)[number]["key"];

const CATEGORY_LABELS = new Map<CategoryKey, string>(
  NOTIFICATION_CATEGORIES.map((c) => [c.key, c.label] as const),
);

function InboxPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Member portal"
        title="Notifications centre"
        description="Every in-app alert about your registration, verification, savings and loans — filter it, read it, clear it."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/app/notifications">
              <Settings2 className="mr-2 h-4 w-4" />
              Alert settings
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<SectionCardSkeleton rows={8} />}>
        <InboxContent />
      </Suspense>
      <KycReminderLog />
    </div>
  );
}

function InboxContent() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const qc = useQueryClient();

  // Search params are user-controlled; clamp and whitelist before querying.
  const page = Math.max(1, search.page);
  const pageSize = [10, 25, 50, 100].includes(search.page_size) ? search.page_size : 25;
  const status = (STATUSES.find((s) => s.key === search.status)?.key ?? "all") as
    | "all"
    | "unread"
    | "read";
  const category = CATEGORY_LABELS.has(search.category as CategoryKey) ? search.category : "";
  const q = search.q.slice(0, 120);

  const [term, setTerm] = useState(q);

  const feedQuery = queryOptions({
    queryKey: ["member", "notifications-feed", { page, pageSize, status, category, q }],
    queryFn: () =>
      listMyNotifications({ data: { page, page_size: pageSize, status, category, q } }),
  });
  const { data } = useSuspenseQuery(feedQuery);

  const refresh = () => qc.invalidateQueries({ queryKey: ["member", "notifications-feed"] });

  const setSearch = (patch: Partial<typeof search>) =>
    navigate({ search: (prev: typeof search) => ({ ...prev, page: 1, ...patch }) });

  const readOne = useMutation({
    mutationFn: (id: string) => markNotificationsRead({ data: { ids: [id] } }),
    onSuccess: refresh,
    onError: (err: any) => toast.error(err?.message ?? "Could not mark as read"),
  });

  const unreadOne = useMutation({
    mutationFn: (id: string) => markNotificationUnread({ data: { id } }),
    onSuccess: refresh,
    onError: (err: any) => toast.error(err?.message ?? "Could not mark as unread"),
  });

  const readPage = useMutation({
    mutationFn: (ids: string[]) => markNotificationsRead({ data: { ids } }),
    onSuccess: (res) => {
      toast.success(`${res.count} notification${res.count === 1 ? "" : "s"} marked as read`);
      refresh();
    },
    onError: (err: any) => toast.error(err?.message ?? "Could not mark these as read"),
  });

  const readAll = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => {
      toast.success("Inbox cleared");
      refresh();
    },
    onError: (err: any) => toast.error(err?.message ?? "Could not clear the inbox"),
  });

  const unreadOnPage = data.rows.filter((r) => !r.read_at).map((r) => r.id);

  return (
    <div className="space-y-4">
      <SectionCard title={`Inbox — ${data.unread} unread`}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex rounded-lg border border-border p-1">
            {STATUSES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSearch({ status: s.key })}
                aria-pressed={status === s.key}
                className={
                  "rounded px-3 py-1.5 text-xs font-semibold transition " +
                  (status === s.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {s.label}
              </button>
            ))}
          </div>

          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Event type
            <select
              value={category}
              onChange={(e) => setSearch({ category: e.target.value })}
              className="min-w-[13rem] rounded border border-border bg-card px-2 py-1.5 text-xs font-normal normal-case tracking-normal text-foreground outline-none focus:border-primary"
            >
              <option value="">All event types</option>
              {NOTIFICATION_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <form
            className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch({ q: term.slice(0, 120) });
            }}
          >
            <label htmlFor="notif-search">Search</label>
            <div className="flex gap-2">
              <input
                id="notif-search"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Title or message"
                className="rounded border border-border bg-card px-2 py-1.5 text-xs font-normal normal-case tracking-normal text-foreground outline-none focus:border-primary"
              />
              <Button type="submit" size="sm" variant="outline">
                <Search className="h-3.5 w-3.5" />
                <span className="sr-only">Search notifications</span>
              </Button>
            </div>
          </form>

          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={unreadOnPage.length === 0 || readPage.isPending}
              onClick={() => readPage.mutate(unreadOnPage)}
            >
              <MailOpen className="mr-2 h-4 w-4" />
              Mark page read
            </Button>
            <Button
              size="sm"
              disabled={data.unread === 0 || readAll.isPending}
              onClick={() => readAll.mutate()}
            >
              <CheckCheck className="mr-2 h-4 w-4" />
              Mark all read
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Notifications">
        {data.rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<BellRing className="h-5 w-5" />}
              title="Nothing here"
              hint={
                status === "unread"
                  ? "You have read every notification that matches these filters."
                  : "No notifications match these filters yet."
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {data.rows.map((n) => {
              const unread = !n.read_at;
              return (
                <li
                  key={n.id}
                  className={
                    "flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4 sm:px-6 " +
                    (unread ? "bg-primary/5" : "")
                  }
                >
                  <span
                    aria-hidden
                    className={
                      "mt-1.5 hidden h-2 w-2 shrink-0 rounded-full sm:block " +
                      (unread ? "bg-primary" : "bg-transparent")
                    }
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={"text-sm " + (unread ? "font-semibold" : "font-medium")}>
                        {n.title}
                      </span>
                      <StatusPill status={unread ? "pending" : "cleared"} />
                    </div>
                    {n.body ? (
                      <p className="text-xs leading-relaxed text-muted-foreground">{n.body}</p>
                    ) : null}
                    <p className="text-[11px] text-muted-foreground">
                      {CATEGORY_LABELS.get(n.category as CategoryKey) ?? n.category} ·{" "}
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {n.link ? (
                      <Button asChild size="sm" variant="ghost">
                        <Link to={n.link as never}>View</Link>
                      </Button>
                    ) : null}
                    {unread ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={readOne.isPending}
                        onClick={() => readOne.mutate(n.id)}
                      >
                        <MailOpen className="mr-2 h-3.5 w-3.5" />
                        Mark read
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={unreadOne.isPending}
                        onClick={() => unreadOne.mutate(n.id)}
                      >
                        <RotateCcw className="mr-2 h-3.5 w-3.5" />
                        Unread
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination
          page={page}
          pageSize={pageSize}
          total={data.total}
          onPage={(n) => navigate({ search: (prev: typeof search) => ({ ...prev, page: n }) })}
          onPageSize={(n) => setSearch({ page_size: n })}
        />
      </SectionCard>
    </div>
  );
}
