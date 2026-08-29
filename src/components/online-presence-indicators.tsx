import { memo } from "react";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOnlinePresence, useOnlinePresenceCount } from "@/lib/online-presence";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

/**
 * Green presence dot. Blinks only when the user has not requested reduced
 * motion; the dot itself is decorative, so callers must supply a text status.
 */
export const LiveDot = memo(function LiveDot({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  return (
    <span className={cn("relative flex h-2.5 w-2.5", className)} aria-hidden="true">
      {!reduced && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
      )}
      <span
        className={cn(
          "relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500",
          reduced
            ? "ring-2 ring-emerald-600/60"
            : "shadow-[0_0_8px_rgba(16,185,129,0.9)]",
        )}
      />
    </span>
  );
});

function statusText(total: number, staff: number) {
  const base = total === 1 ? "1 person online now" : `${total} people online now`;
  return staff ? `${base}, including ${staff} staff` : base;
}

/** Compact header indicator: green presence dot + live online count. */
export const OnlinePresencePill = memo(function OnlinePresencePill({
  className,
}: {
  className?: string;
}) {
  const { total, staff } = useOnlinePresenceCount();
  const label = statusText(total, staff);
  return (
    <div
      className={cn(
        "flex h-9 items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-700 dark:text-emerald-300",
        className,
      )}
      title={label}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <LiveDot />
      <span className="sr-only">{label}</span>
      <span className="tabular-nums" aria-hidden="true">
        {total}
      </span>
      <span className="hidden sm:inline" aria-hidden="true">
        online
      </span>
    </div>
  );
});

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("") || "?"
  );
}

/** Live roster rendered inside the dark navigation pane. */
export const SidebarOnlinePanel = memo(function SidebarOnlinePanel({
  collapsed,
}: {
  collapsed?: boolean;
}) {
  const { users, total, meId } = useOnlinePresence();
  const reduced = useReducedMotion();
  const label = statusText(total, 0);

  if (collapsed) {
    return (
      <div
        className="mx-auto flex w-12 flex-col items-center gap-1 rounded-lg bg-white/5 py-2 text-white"
        title={label}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <LiveDot />
        <span className="sr-only">{label}</span>
        <span className="text-[11px] font-bold tabular-nums" aria-hidden="true">
          {total}
        </span>
      </div>
    );
  }

  return (
    <section
      className="rounded-xl bg-white/5 p-3 ring-1 ring-inset ring-white/10"
      aria-label="Online users"
    >
      <div className="mb-2 flex items-center gap-2" role="status" aria-live="polite" aria-atomic="true">
        <LiveDot />
        <span className="sr-only">{label}</span>
        <span
          className="text-[11px] font-semibold uppercase tracking-wider text-white/80"
          aria-hidden="true"
        >
          Online now
        </span>
        <span
          className="ml-auto rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 tabular-nums"
          aria-hidden="true"
        >
          {total}
        </span>
      </div>
      {users.length === 0 ? (
        <p className="flex items-center gap-2 py-1 text-[11px] text-white/50">
          <Users className="size-3.5" aria-hidden="true" /> Connecting…
        </p>
      ) : (
        <ul className="max-h-44 space-y-1 overflow-y-auto">
          {users.slice(0, 12).map((u) => (
            <li key={u.token} className="flex items-center gap-2 rounded-md px-1 py-1">
              <span className="relative" aria-hidden="true">
                <span className="grid size-6 place-items-center rounded-full bg-white/10 text-[9px] font-bold text-white">
                  {initials(u.name)}
                </span>
                <span
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-emerald-500 ring-2 ring-brand-forest",
                    !reduced && "animate-pulse",
                  )}
                />
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-white/85">
                {u.name}
                {u.token === meId ? <span className="text-white/40"> (you)</span> : null}
                <span className="sr-only">
                  {" "}
                  — online{u.role === "Staff" ? ", staff" : ""}
                </span>
              </span>

              {u.role === "Staff" ? (
                <span className="rounded-full bg-amber-400/20 px-1.5 text-[9px] font-semibold text-amber-200">
                  Staff
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});
