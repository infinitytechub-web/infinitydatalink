import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import { EmptyState, SectionCard } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

type PresenceUser = {
  user_id: string;
  name: string;
  role: string;
  online_at: string;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";
}

/**
 * Live roster of everyone currently using the app, backed by a Realtime
 * presence channel. Each session tracks itself and is dropped automatically
 * when the tab closes.
 */
export function OnlineUsersWidget({ className }: { className?: string }) {
  const { user, isAdmin } = useAuth();
  const [users, setUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase.channel("presence:online-users", {
      config: { presence: { key: user.id } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceUser>();
        const flat = Object.values(state)
          .map((entries) => entries[0])
          .filter(Boolean) as PresenceUser[];
        flat.sort((a, b) => a.name.localeCompare(b.name));
        setUsers(flat);
      })
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        await channel.track({
          user_id: user.id,
          name: user.fullName || user.email || "Member",
          role: isAdmin ? "Staff" : "Member",
          online_at: new Date().toISOString(),
        } satisfies PresenceUser);
      });

    return () => {
      setUsers([]);
      void supabase.removeChannel(channel);
    };
  }, [user?.id, user?.fullName, user?.email, isAdmin]);

  const staff = useMemo(() => users.filter((u) => u.role === "Staff").length, [users]);

  return (
    <SectionCard
      title="Who's online"
      accent="emerald"
      className={className}
      action={
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-mid/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-mid">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-mid opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-mid" />
          </span>
          {users.length} online{staff ? ` · ${staff} staff` : ""}
        </span>
      }
    >
      {users.length === 0 ? (
        <EmptyState title="Connecting…" hint="Active sessions appear here in real time." icon={<Users className="h-5 w-5" />} />
      ) : (
        <ul className="divide-y divide-border">
          {users.map((u) => (
            <li key={u.user_id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="relative">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-royal/10 text-[11px] font-bold text-royal">
                  {initials(u.name)}
                </span>
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-mid" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {u.name}
                  {u.user_id === user?.id ? <span className="ml-1 text-xs text-muted-foreground">(you)</span> : null}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {u.role} · since {new Date(u.online_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                  u.role === "Staff" ? "bg-gold/15 text-gold-deep" : "bg-muted text-muted-foreground",
                )}
              >
                {u.role}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
