import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type PresenceUser = {
  user_id: string;
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
  for (const u of users) sig += `${u.user_id}|${u.name}|${u.role};`;
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
  timer = setTimeout(() => {
    timer = null;
    if (pending) {
      const next = pending;
      pending = null;
      commit(next);
    }
  }, Math.max(0, THROTTLE_MS - elapsed));
}

function resetThrottle() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  pending = null;
  lastEmit = 0;
}

function acquire(me: PresenceUser) {
  refCount += 1;
  if (channel) return;
  const ch = supabase.channel("presence:online-users", {
    config: { presence: { key: me.user_id } },
  });
  channel = ch;
  ch.on("presence", { event: "sync" }, () => {
    const state = ch.presenceState<PresenceUser>();
    const flat: PresenceUser[] = [];
    for (const entries of Object.values(state)) {
      const first = entries[0];
      if (first) flat.push(first);
    }
    flat.sort((a, b) => a.name.localeCompare(b.name));
    scheduleCommit(flat);
  }).subscribe(async (status) => {
    if (status !== "SUBSCRIBED") return;
    await ch.track(me);
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
  const { user, isAdmin } = useAuth();
  const id = user?.id;
  const name = user?.fullName || user?.email || "Member";

  useEffect(() => {
    if (!id) return;
    acquire({
      user_id: id,
      name,
      role: isAdmin ? "Staff" : "Member",
      online_at: new Date().toISOString(),
    });
    return release;
  }, [id, name, isAdmin]);

  return id;
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

  return useMemo(
    () => ({ users, total: users.length, staff: stats.staff, meId }),
    [users, meId],
  );
}
