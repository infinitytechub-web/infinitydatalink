import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Bell, BellRing, CheckCheck, Wifi, WifiOff } from "lucide-react";
import { EmptyState, SectionCard } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRow,
} from "@/lib/notifications.functions";

function relative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/**
 * Live notification feed. Loads the latest rows once, then keeps them fresh
 * through a Realtime subscription scoped to the signed-in user.
 *
 * Accessibility:
 * - The list is a `feed` with roving tabindex; Arrow/Home/End/PageUp/PageDown move
 *   focus between articles, Enter/Space opens the linked record, `r` marks read.
 * - Incoming items are announced through a polite live region rather than by
 *   stealing focus; focus only moves when the user asks for it (Alt+N shortcut is
 *   intentionally avoided; instead a "jump to newest" button appears).
 */
export function RealtimeNotifications({ limit = 8 }: { limit?: number }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [live, setLive] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [newSinceFocus, setNewSinceFocus] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const listRef = useRef<HTMLUListElement | null>(null);
  const hadFocusRef = useRef(false);

  const listFn = useServerFn(listNotifications);
  const markFn = useServerFn(markNotificationRead);
  const markAllFn = useServerFn(markAllNotificationsRead);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    error: feedError,
  } = useInfiniteQuery({
    queryKey: ["notifications", "feed", limit],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => listFn({ data: { limit, before: pageParam } }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
  });


  const markAll = useMutation({
    mutationFn: () => markAllFn({}),
    onSuccess: async () => {
      setAnnouncement("All notifications marked as read.");
      await qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markOne = useMutation({
    mutationFn: (id: string) => markFn({ data: { id } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as NotificationRow;
          toast(row.title, { description: row.body ?? undefined });
          setAnnouncement(`New notification: ${row.title}${row.body ? `. ${row.body}` : ""}`);
          if (hadFocusRef.current) setNewSinceFocus((n) => n + 1);
          void qc.invalidateQueries({ queryKey: ["notifications"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => void qc.invalidateQueries({ queryKey: ["notifications"] }),
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      setLive(false);
      void supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);

  const rows = useMemo<NotificationRow[]>(
    () => (data?.pages ?? []).flatMap((p) => p.rows),
    [data?.pages],
  );
  const unread = data?.pages?.[0]?.unread ?? 0;

  // Keep the roving tabindex target inside bounds as the feed changes.
  // Appending a page never shifts existing indexes, so focus is preserved.
  useEffect(() => {
    itemRefs.current.length = rows.length;
    setActiveIndex((i) => Math.min(Math.max(i, 0), Math.max(rows.length - 1, 0)));
  }, [rows.length]);

  const focusItem = useCallback((index: number) => {
    const el = itemRefs.current[index];
    if (!el) return;
    setActiveIndex(index);
    el.focus();
  }, []);

  // When more items are requested from the keyboard, move focus to the first
  // appended item once it renders.
  const pendingFocusRef = useRef<number | null>(null);
  useEffect(() => {
    const target = pendingFocusRef.current;
    if (target === null || isFetchingNextPage) return;
    if (target < rows.length && itemRefs.current[target]) {
      pendingFocusRef.current = null;
      focusItem(target);
      setAnnouncement(`Loaded more notifications. ${rows.length} of your notifications are shown.`);
    } else if (!isFetchingNextPage) {
      pendingFocusRef.current = null;
    }
  }, [rows.length, isFetchingNextPage, focusItem]);

  const loadMore = useCallback(
    (fromKeyboard: boolean) => {
      if (!hasNextPage || isFetchingNextPage) return;
      if (fromKeyboard) pendingFocusRef.current = rows.length;
      void fetchNextPage();
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage, rows.length],
  );


  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>, index: number, row: NotificationRow) => {
      const last = rows.length - 1;
      let next: number | null = null;
      switch (event.key) {
        case "ArrowDown":
          if (index === last && hasNextPage) {
            event.preventDefault();
            loadMore(true);
            return;
          }
          next = Math.min(index + 1, last);
          break;

        case "ArrowUp":
          next = Math.max(index - 1, 0);
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = last;
          break;
        case "PageDown":
          next = Math.min(index + 3, last);
          if (index === last && hasNextPage) {
            event.preventDefault();
            loadMore(true);
            return;
          }
          break;

        case "PageUp":
          next = Math.max(index - 3, 0);
          break;
        case "r":
        case "R":
          if (!row.read_at && !markOne.isPending) {
            markOne.mutate(row.id);
            setAnnouncement(`Marked "${row.title}" as read.`);
          }
          event.preventDefault();
          return;
        default:
          return;
      }
      event.preventDefault();
      if (next !== null) focusItem(next);
    },
    [rows.length, focusItem, markOne, hasNextPage, loadMore],
  );

  const jumpToNewest = useCallback(() => {
    setNewSinceFocus(0);
    focusItem(0);
  }, [focusItem]);

  const feedLabel = `Notifications feed, ${rows.length} item${rows.length === 1 ? "" : "s"}, ${unread} unread`;

  return (
    <SectionCard
      title="Notifications"
      accent="royal"
      action={
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              live ? "bg-emerald-mid/10 text-emerald-mid" : "bg-muted text-muted-foreground",
            )}
          >
            {live ? <Wifi className="h-3 w-3" aria-hidden="true" /> : <WifiOff className="h-3 w-3" aria-hidden="true" />}
            <span aria-hidden="true">{live ? "Live" : "Offline"}</span>
            <span className="sr-only">
              {live ? "Live updates connected" : "Live updates disconnected, reconnecting"}
            </span>
          </span>
          <span
            className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <span aria-hidden="true">{unread} unread</span>
            <span className="sr-only">
              {unread === 0 ? "No unread notifications" : `${unread} unread notification${unread === 1 ? "" : "s"}`}
            </span>
          </span>
          {unread > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> Mark all read
            </Button>
          ) : null}
        </div>
      }
    >
      {/* Polite announcer for realtime arrivals and read-state changes. */}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      {newSinceFocus > 0 ? (
        <div className="px-4 pt-3">
          <Button size="sm" variant="secondary" className="w-full" onClick={jumpToNewest}>
            {newSinceFocus} new notification{newSinceFocus === 1 ? "" : "s"} — jump to newest
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-2 p-4" role="status" aria-live="polite">
          <span className="sr-only">Loading notifications…</span>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/60" aria-hidden="true" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No notifications yet"
          hint="New alerts appear here the moment they happen."
          icon={<Bell className="h-5 w-5" aria-hidden="true" />}
        />
      ) : (
        <>
          <p className="sr-only" id="notifications-feed-help">
            Use the arrow keys to move between notifications, Home or End to jump to the first or last item, Enter to
            open a notification, and the R key to mark it as read.
          </p>
          <ul
            ref={listRef}
            role="feed"
            aria-busy={markAll.isPending}
            aria-label={feedLabel}
            aria-describedby="notifications-feed-help"
            className="divide-y divide-border"
            onFocus={() => {
              hadFocusRef.current = true;
            }}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) hadFocusRef.current = false;
            }}
          >
            {rows.map((n, index) => {
              const body = (
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      n.read_at ? "bg-muted text-muted-foreground" : "bg-emerald-mid/10 text-emerald-mid",
                    )}
                  >
                    {n.read_at ? <Bell className="h-3.5 w-3.5" /> : <BellRing className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm", n.read_at ? "text-muted-foreground" : "font-semibold")}>
                      {n.title}
                      {!n.read_at ? <span className="sr-only"> (unread)</span> : null}
                    </p>
                    {n.body ? <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p> : null}
                    <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {n.category} · {relative(n.created_at)}
                    </p>
                  </div>
                </div>
              );

              const shared = {
                role: "article" as const,
                tabIndex: index === activeIndex ? 0 : -1,
                "aria-posinset": index + 1,
                "aria-setsize": rows.length,
                "aria-label": `${n.read_at ? "Read" : "Unread"}: ${n.title}${n.body ? `. ${n.body}` : ""}. ${n.category}, ${relative(n.created_at)}`,
                onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => onKeyDown(e, index, n),
                onFocus: () => {
                  setActiveIndex(index);
                  if (!n.read_at && !markOne.isPending) markOne.mutate(n.id);
                },
                className:
                  "block px-4 py-3 outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              };

              return (
                <li key={n.id} className="contents">
                  {n.link ? (
                    <Link
                      {...shared}
                      to={n.link as string}
                      ref={(el: HTMLAnchorElement | null) => {
                        itemRefs.current[index] = el;
                      }}
                    >
                      {body}
                    </Link>
                  ) : (
                    <div
                      {...shared}
                      ref={(el) => {
                        itemRefs.current[index] = el;
                      }}
                    >
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </SectionCard>
  );
}
