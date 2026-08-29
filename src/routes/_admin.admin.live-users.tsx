import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Users, Clock, ShieldCheck } from "lucide-react";
import {
  EmptyState,
  ErrorState,
  KPIStat,
  PageHeader,
  SectionCard,
} from "@/components/primitives";
import { useOnlinePresence } from "@/lib/online-presence";
import { LiveDot } from "@/components/online-presence-indicators";

export const Route = createFileRoute("/_admin/admin/live-users")({
  head: () => ({
    meta: [
      { title: "Live users online — IT-360 Admin" },
      {
        name: "description",
        content:
          "Administrator-only live panel showing who is online right now, when each session started and how many users are active.",
      },
      { property: "og:title", content: "Live users online — IT-360 Admin" },
      {
        property: "og:description",
        content: "Real-time roster of active sessions with sign-in times and active user counts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LiveUsersPanel,
  errorComponent: ({ error }) => (
    <div className="p-6">
      <ErrorState title="Live panel unavailable" message={error.message} />
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm text-muted-foreground">Not found.</div>,
});

function useTicker(ms = 15_000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

function duration(fromIso: string) {
  const start = new Date(fromIso).getTime();
  if (!Number.isFinite(start)) return "—";
  const mins = Math.max(0, Math.floor((Date.now() - start) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

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

function LiveUsersPanel() {
  const { users, staff, meId } = useOnlinePresence();
  useTicker();

  // Peak concurrent users observed while this panel has been open.
  const peakRef = useRef(0);
  peakRef.current = Math.max(peakRef.current, users.length);

  const members = users.length - staff;
  const earliest = useMemo(() => {
    const times = users.map((u) => new Date(u.online_at).getTime()).filter(Number.isFinite);
    return times.length ? new Date(Math.min(...times)) : null;
  }, [users]);

  const sorted = useMemo(
    () =>
      users
        .slice()
        .sort((a, b) => new Date(a.online_at).getTime() - new Date(b.online_at).getTime()),
    [users],
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administrator only"
        title="Live users online"
        description="Who is using the platform right now, when their session started and how long they have been active. Visible to administrators only."
        action={
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-mid/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-mid"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <LiveDot />
            {users.length} online
          </span>
        }
      />

      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat label="Users online now" value={<span className="tabular">{users.length}</span>} accent />
        <KPIStat label="Staff / admins" value={<span className="tabular">{staff}</span>} />
        <KPIStat label="Members" value={<span className="tabular">{Math.max(0, members)}</span>} />
        <KPIStat
          label="Peak while viewing"
          value={<span className="tabular">{peakRef.current}</span>}
          hint={earliest ? `Oldest session since ${earliest.toLocaleTimeString()}` : undefined}
        />
      </section>

      <SectionCard
        title="Active sessions"
        accent="emerald"
        action={
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> Updated live
          </span>
        }
      >
        {sorted.length === 0 ? (
          <EmptyState
            title="Connecting…"
            hint="Active sessions appear here in real time as users sign in."
            icon={<Users className="h-5 w-5" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Users currently online</caption>
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="px-4 py-2.5">User</th>
                  <th scope="col" className="px-4 py-2.5">Role</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Online since</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Active for</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sorted.map((u) => (
                  <tr key={u.token} className="hover:bg-muted/40">
                    <th scope="row" className="px-4 py-2.5 text-left font-normal">
                      <span className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-royal/10 text-[11px] font-bold text-royal">
                          {initials(u.name)}
                        </span>
                        <span className="font-medium">
                          {u.name}
                          {u.token === meId ? (
                            <span className="ml-1 text-xs text-muted-foreground">(you)</span>
                          ) : null}
                        </span>
                      </span>
                    </th>
                    <td className="px-4 py-2.5">
                      <span
                        className={
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider " +
                          (u.role === "Staff"
                            ? "bg-gold/15 text-brand-forest"
                            : "bg-muted text-muted-foreground")
                        }
                      >
                        {u.role === "Staff" ? <ShieldCheck className="h-3 w-3" /> : null}
                        {u.role}
                      </span>
                    </td>
                    <td className="tabular px-4 py-2.5 text-right">
                      {new Date(u.online_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="tabular px-4 py-2.5 text-right text-muted-foreground">
                      {duration(u.online_at)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-mid">
                        <LiveDot /> Online
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <p className="text-xs text-muted-foreground">
        Presence is session-based and disappears the moment a user closes the app. For historical sign-in
        activity see the{" "}
        <Link to="/admin/activity" className="font-medium text-primary hover:underline">
          activity timeline
        </Link>
        .
      </p>
    </div>
  );
}
