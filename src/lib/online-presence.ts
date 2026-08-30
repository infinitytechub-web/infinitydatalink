import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  registerPresenceSession,
  resolvePresenceIdentities,
} from "@/lib/presence-directory.functions";

/** What is actually broadcast on the (public) realtime channel — no PII. */
export type PresencePayload = {
  /** Opaque per-tab session token — never a real user id. */
  token: string;
  online_at: string;
};

export type PresenceUser = {
  token: string;
  name: string;
  role: string;
  online_at: string;
};

/**
 * Singleton presence channel shared by every widget that renders the live
 * roster (header pill, sidebar panel, dashboard card). One channel avoids
 * duplicate subscriptions and reconnection loops.
 *
 * UI updates are throttled: presence `sync` fires on every join/leave, which
 * in a busy tenant can be dozens of events per second. We coalesce them into
 * at most one commit per THROTTLE_MS (leading edge + trailing flush) and drop
 * commits whose roster signature is unchanged, so React only re-renders when
 * the visible roster actually differs.
 */
const THROTTLE_MS = 1000;
const EMPTY: PresenceUser[] = [];

let channel: ReturnType<typeof supabase.channel> | null = null;
let refCount = 0;
let snapshot: PresenceUser[] = EMPTY;
let signature = "";
let stats = { total: 0, staff: 0 };

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let lastEmit = 0;
let pending: PresenceUser[] | null = null;

function signatureOf(users: PresenceUser[]) {
  // Only fields the UI renders participate in change detection.
  let sig = "";
  for (const u of users) sig += `${u.token}|${u.name}|${u.role};`;
  return sig;
}

function commit(users: PresenceUser[]) {
  const sig = signatureOf(users);
  if (sig === signature) return; // nothing visible changed — skip re-render
  signature = sig;
  snapshot = users;
  stats = {
    total: users.length,
    staff: users.reduce((n, u) => n + (u.role === "Staff" ? 1 : 0), 0),
  };
  lastEmit = Date.now();
  listeners.forEach((l) => l());
}

/** Coalesce bursts of presence events into at most one commit per window. */
function scheduleCommit(users: PresenceUser[]) {
  pending = users;
  const elapsed = Date.now() - lastEmit;
  if (elapsed >= THROTTLE_MS && timer === null) {
    const next = pending;
    pending = null;
    commit(next);
    return;
  }
  if (timer !== null) return;
  timer = setTimeout(
    () => {
      timer = null;
      if (pending) {
        const next = pending;
        pending = null;
        commit(next);
      }
    },
    Math.max(0, THROTTLE_MS - elapsed),
  );
}

function resetThrottle() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  pending = null;
  lastEmit = 0;
}

/** Cache of resolved display identities, keyed by user id. */
const directory = new Map<string, { name: string; role: string }>();
let resolving = false;

async function enrich(ids: { token: string; online_at: string }[]) {
  const unknown = ids.filter((i) => !directory.has(i.token)).map((i) => i.token);
  if (unknown.length > 0 && !resolving) {
    resolving = true;
    try {
      const rows = await resolvePresenceIdentities({ data: { tokens: unknown } });
      for (const r of rows) directory.set(r.token, { name: r.name, role: r.role });
    } catch {
      // Unauthenticated or transient failure — fall back to opaque labels.
    } finally {
      resolving = false;
    }
  }
  const flat: PresenceUser[] = ids.map((i) => ({
    token: i.token,
    online_at: i.online_at,
    name: directory.get(i.token)?.name ?? "Member",
    role: directory.get(i.token)?.role ?? "Member",
  }));
  flat.sort((a, b) => a.name.localeCompare(b.name));
  scheduleCommit(flat);
}

function acquire(me: { token: string; online_at: string }) {
  refCount += 1;
  if (channel) return;
  const ch = supabase.channel("presence:online-users", {
    config: { presence: { key: me.token } },
  });
  channel = ch;
  ch.on("presence", { event: "sync" }, () => {
    const state = ch.presenceState<PresencePayload>();
    const ids: { token: string; online_at: string }[] = [];
    for (const entries of Object.values(state)) {
      const first = entries[0];
      if (first?.token) ids.push({ token: first.token, online_at: first.online_at });
    }
    void enrich(ids);
  }).subscribe(async (status) => {
    if (status !== "SUBSCRIBED") return;
    // Only an opaque session token and a timestamp go on the wire.
    await ch.track({ token: me.token, online_at: me.online_at } satisfies PresencePayload);
  });
}

function release() {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0 && channel) {
    const ch = channel;
    channel = null;
    resetThrottle();
    commit(EMPTY);
    void supabase.removeChannel(ch);
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Keeps the shared channel alive for the lifetime of the calling component. */
function usePresenceChannel() {
  const { user } = useAuth();
  const id = user?.id;
  const [myToken, setMyToken] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let joined = false;
    let cancelled = false;
    void (async () => {
      try {
        const { token } = await registerPresenceSession();
        if (cancelled) return;
        joined = true;
        setMyToken(token);
        acquire({ token, online_at: new Date().toISOString() });
      } catch {
        // Not signed in / transient failure — stay off the roster.
      }
    })();
    return () => {
      cancelled = true;
      setMyToken(null);
      if (joined) release();
    };
  }, [id]);

  return myToken;
}

/**
 * Counts only. Consumers (e.g. the header pill) re-render solely when the
 * numbers change, never when the roster is merely reordered.
 */
export function useOnlinePresenceCount() {
  usePresenceChannel();
  const total = useSyncExternalStore(
    subscribe,
    () => stats.total,
    () => 0,
  );
  const staff = useSyncExternalStore(
    subscribe,
    () => stats.staff,
    () => 0,
  );
  return { total, staff };
}

/** Live list of everyone currently using the app, plus derived counts. */
export function useOnlinePresence() {
  const meId = usePresenceChannel();
  const getSnapshot = useCallback(() => snapshot, []);
  const users = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  return useMemo(() => ({ users, total: users.length, staff: stats.staff, meId }), [users, meId]);
}
