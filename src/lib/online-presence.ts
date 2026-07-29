import { useEffect, useState } from "react";
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
 * roster (header pill, sidebar panel, dashboard card). Keeping one channel
 * avoids duplicate subscriptions and reconnection loops.
 */
let channel: ReturnType<typeof supabase.channel> | null = null;
let refCount = 0;
let current: PresenceUser[] = [];
const listeners = new Set<(users: PresenceUser[]) => void>();

function emit(users: PresenceUser[]) {
  current = users;
  listeners.forEach((l) => l(users));
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
    const flat = Object.values(state)
      .map((entries) => entries[0])
      .filter(Boolean) as PresenceUser[];
    flat.sort((a, b) => a.name.localeCompare(b.name));
    emit(flat);
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
    emit([]);
    void supabase.removeChannel(ch);
  }
}

/** Live list of everyone currently using the app. */
export function useOnlinePresence() {
  const { user, isAdmin } = useAuth();
  const [users, setUsers] = useState<PresenceUser[]>(current);

  useEffect(() => {
    if (!user?.id) return;
    const me: PresenceUser = {
      user_id: user.id,
      name: user.fullName || user.email || "Member",
      role: isAdmin ? "Staff" : "Member",
      online_at: new Date().toISOString(),
    };
    listeners.add(setUsers);
    acquire(me);
    setUsers(current);
    return () => {
      listeners.delete(setUsers);
      release();
    };
  }, [user?.id, user?.fullName, user?.email, isAdmin]);

  return {
    users,
    total: users.length,
    staff: users.filter((u) => u.role === "Staff").length,
    meId: user?.id,
  };
}
