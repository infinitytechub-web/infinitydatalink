import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { listMyNotifications, markNotificationsRead } from "@/lib/notifications.functions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function timeAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/**
 * Header bell shared by both portals: unread badge, newest items, mark-read on
 * open and a link into the full notifications centre.
 */
export function NotificationBell() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const load = useServerFn(listMyNotifications);
  const markRead = useServerFn(markNotificationsRead);
  const [open, setOpen] = useState(false);

  const query = useQuery({
    queryKey: ["notification-bell", user?.id],
    queryFn: () => load({ data: { status: "all", page: 1, page_size: 8 } }),
    enabled: !!user,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const mark = useMutation({
    mutationFn: (ids: string[]) => markRead({ data: { ids } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notification-bell"] });
      void qc.invalidateQueries({ queryKey: ["my-notifications"] });
    },
  });

  const rows = useMemo(() => (query.data?.rows ?? []).slice(0, 8), [query.data]);
  const unread = query.data?.unread ?? 0;

  if (!user) return null;

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          const ids = rows.filter((r: any) => !r.read_at).map((r: any) => r.id);
          if (ids.length > 0) mark.mutate(ids);
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative grid size-9 place-items-center rounded-full border border-border bg-muted/60 text-muted-foreground transition hover:text-foreground"
        >
          <Bell className="size-4" />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          <span className="text-xs font-normal text-muted-foreground">{unread} unread</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {rows.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">You are all caught up.</div>
        ) : (
          rows.map((n: any) => (
            <DropdownMenuItem key={n.id} asChild className="flex-col items-start gap-0.5">
              <a href={n.link || "/app/inbox"} className="w-full">
                <span className={cn("text-xs font-semibold", !n.read_at && "text-primary")}>{n.title}</span>
                {n.body ? (
                  <span className="line-clamp-2 text-[11px] text-muted-foreground">{n.body}</span>
                ) : null}
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {timeAgo(n.created_at)}
                </span>
              </a>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/app/inbox" className="w-full text-xs font-semibold">
            View all notifications
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
