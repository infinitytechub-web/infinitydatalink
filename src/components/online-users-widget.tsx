import { Users } from "lucide-react";
import { EmptyState, SectionCard } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { useOnlinePresence } from "@/lib/online-presence";
import { LiveDot } from "@/components/online-presence-indicators";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";
}

/** Live roster of everyone currently using the app (shared presence channel). */
export function OnlineUsersWidget({ className }: { className?: string }) {
  const { users, staff, meId } = useOnlinePresence();

  return (
    <SectionCard
      title="Who's online"
      accent="emerald"
      className={className}
      action={
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-mid/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-mid"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <LiveDot />
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
                  {u.user_id === meId ? <span className="ml-1 text-xs text-muted-foreground">(you)</span> : null}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {u.role} · since {new Date(u.online_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                  u.role === "Staff" ? "bg-gold/15 text-emerald-deep" : "bg-muted text-muted-foreground",
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
