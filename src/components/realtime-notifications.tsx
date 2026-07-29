import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
 */
export function RealtimeNotifications({ limit = 8 }: { limit?: number }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [live, setLive] = useState(false);
  const listFn = useServerFn(listNotifications);
  const markFn = useServerFn(markNotificationRead);
  const markAllFn = useServerFn(markAllNotificationsRead);

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", "feed", limit],
    queryFn: () => listFn({ data: { limit } }),
    staleTime: 30_000,
  });

  const markAll = useMutation({
    mutationFn: () => markAllFn({}),
    onSuccess: async () => {
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

  const rows = data?.rows ?? [];
  const unread = data?.unread ?? 0;

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
            title={live ? "Live updates connected" : "Reconnecting…"}
          >
            {live ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {live ? "Live" : "Offline"}
          </span>
          {unread > 0 ? (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </Button>
          ) : null}
        </div>
      }
    >
      {isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/60" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="No notifications yet" hint="New alerts appear here the moment they happen." icon={<Bell className="h-5 w-5" />} />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((n) => {
            const body = (
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                    n.read_at ? "bg-muted text-muted-foreground" : "bg-emerald-mid/10 text-emerald-mid",
                  )}
                >
                  {n.read_at ? <Bell className="h-3.5 w-3.5" /> : <BellRing className="h-3.5 w-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm", n.read_at ? "text-muted-foreground" : "font-semibold")}>{n.title}</p>
                  {n.body ? <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p> : null}
                  <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {n.category} · {relative(n.created_at)}
                  </p>
                </div>
              </div>
            );
            return (
              <li
                key={n.id}
                className="px-4 py-3 transition-colors hover:bg-muted/40"
                onMouseEnter={() => {
                  if (!n.read_at && !markOne.isPending) markOne.mutate(n.id);
                }}
              >
                {n.link ? (
                  <Link to={n.link as string} className="block">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
