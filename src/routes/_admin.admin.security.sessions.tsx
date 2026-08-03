import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useEffect, useMemo, useState } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { EyeOff, ShieldCheck } from "lucide-react";
import { EmptyState, KPIStat, SectionCard, SectionCardSkeleton } from "@/components/primitives";
import { LiveDot } from "@/components/online-presence-indicators";
import { useOnlinePresence } from "@/lib/online-presence";
import { listLiveSessions } from "@/lib/security-centre.functions";

export const Route = createFileRoute("/_admin/admin/security/sessions")({
  component: SessionsPage,
});

const sessionsQuery = queryOptions({
  queryKey: ["admin", "security", "sessions"],
  queryFn: () => listLiveSessions(),
  // Session rows are polled; the presence roster below updates in real time.
  refetchInterval: 30_000,
});

function duration(fromIso: string) {
  const start = new Date(fromIso).getTime();
  if (!Number.isFinite(start)) return "—";
  const mins = Math.max(0, Math.floor((Date.now() - start) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function useTicker(ms = 30_000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

function SessionsPage() {
  return (
    <Suspense fallback={<SectionCardSkeleton title="Live sessions" rows={6} cols={5} />}>
      <Content />
    </Suspense>
  );
}

function Content() {
  const { data } = useSuspenseQuery(sessionsQuery);
  const { users, staff } = useOnlinePresence();
  useTicker();

  const rows = useMemo(
    () =>
      data.rows
        .slice()
        .sort((a, b) => Number(b.active) - Number(a.active) || b.last_seen_at.localeCompare(a.last_seen_at)),
    [data.rows],
  );

  return (
    <div className="space-y-6">
      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat
          label="Online now"
          value={
            <span className="inline-flex items-center gap-2">
              <LiveDot />
              <span className="tabular">{users.length}</span>
            </span>
          }
          hint="live presence channel"
        />
        <KPIStat label="Staff online" value={<span className="tabular">{staff}</span>} />
        <KPIStat label="Active sessions" value={<span className="tabular">{data.active}</span>} accent />
        <KPIStat label="Idle sessions (12h)" value={<span className="tabular">{data.idle}</span>} />
      </section>

      <SectionCard
        title="Live roster"
        action={
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-mid/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-mid"
            role="status"
            aria-live="polite"
          >
            <LiveDot />
            {users.length} online
          </span>
        }
      >
        {users.length === 0 ? (
          <EmptyState title="Nobody online" hint="The roster updates in real time as people sign in." />
        ) : (
          <ul className="divide-y divide-emerald-deep/5">
            {users.map((u) => (
              <li key={u.token} className="flex items-center justify-between px-6 py-3">
                <span className="flex items-center gap-3">
                  <LiveDot />
                  <span className="text-sm font-semibold text-emerald-deep">{u.name}</span>
                  <span className="text-[10px] uppercase tracking-widest text-emerald-deep/40">{u.role}</span>
                </span>
                <span className="tabular text-xs text-emerald-deep/55">online {duration(u.online_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Session details"
        action={
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-cream px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/60"
            title={
              data.unmasked
                ? "You hold security.manage — full addresses are shown and each unmasked read is audited."
                : "Addresses are redacted and user agents reduced to device families for privacy."
            }
          >
            {data.unmasked ? <ShieldCheck className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {data.unmasked ? "Full detail (audited)" : "Privacy mode"}
          </span>
        }
      >
        {rows.length === 0 ? (
          <EmptyState title="No recent sessions" hint="Sessions from the last 12 hours appear here." />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
                <th className="px-6 py-3 font-medium">User</th>
                <th className="px-6 py-3 font-medium">State</th>
                <th className="px-6 py-3 font-medium">IP</th>
                <th className="px-6 py-3 font-medium">Device</th>
                <th className="px-6 py-3 font-medium">Browser</th>
                <th className="px-6 py-3 text-right font-medium">Session length</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-deep/5">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-6 py-4 text-sm font-semibold">{r.name}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        r.active ? "bg-emerald-mid/10 text-emerald-mid" : "bg-cream text-emerald-deep/50"
                      }`}
                    >
                      {r.active ? <LiveDot /> : null}
                      {r.active ? "active" : "idle"}
                    </span>
                  </td>
                  <td className="tabular px-6 py-4 text-xs">{r.ip}</td>
                  <td className="px-6 py-4 text-xs text-emerald-deep/70">{r.device}</td>
                  <td className="px-6 py-4 text-xs text-emerald-deep/70">{r.browser}</td>
                  <td className="tabular px-6 py-4 text-right text-xs">
                    {duration(r.started_at)}
                    <span className="ml-2 text-emerald-deep/40">last seen {duration(r.last_seen_at)} ago</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="border-t border-emerald-deep/5 px-6 py-3 text-[11px] text-emerald-deep/50">
          Privacy note: session records are retained for security monitoring only. Redacted addresses hide the host
          portion, and user agents are reduced to device and browser families so individuals cannot be fingerprinted.
        </p>
      </SectionCard>
    </div>
  );
}
