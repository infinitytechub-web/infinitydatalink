import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useOnlineStatus } from "@/hooks/use-online-status";

type Options = {
  /** Query key to refetch when connectivity returns. */
  queryKey: QueryKey;
  /** True when the rendered data came from an offline snapshot. */
  stale: boolean;
  /** Poll interval while online and healthy (ms). 0 disables polling. */
  intervalMs?: number;
  /** Retry cadence while data is still stale (ms). */
  retryMs?: number;
};

/**
 * Background sync for read-only screens that fall back to offline snapshots.
 *
 * Refetches when:
 *  - the browser fires `online`
 *  - the tab becomes visible again
 *  - data is still stale (short retry loop, so missed updates land as soon as
 *    the network actually works again — `navigator.onLine` lies often)
 *  - a slow heartbeat while everything is healthy
 */
export function useBackgroundSync({
  queryKey,
  stale,
  intervalMs = 60_000,
  retryMs = 8_000,
}: Options) {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const inFlight = useRef(false);

  const keyRef = useRef(queryKey);
  keyRef.current = queryKey;

  const syncNow = useCallback(async () => {
    if (inFlight.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    inFlight.current = true;
    setSyncing(true);
    try {
      await queryClient.refetchQueries({ queryKey: keyRef.current, exact: false, type: "active" });
      setLastSyncedAt(new Date().toISOString());
    } catch {
      /* offline fallback already handles failures */
    } finally {
      inFlight.current = false;
      setSyncing(false);
    }
  }, [queryClient]);

  // Reconnect + tab-focus triggers.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncNow();
    };
    window.addEventListener("online", syncNow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", syncNow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [syncNow]);

  // Immediately catch up once connectivity flips back on.
  useEffect(() => {
    if (online && stale) void syncNow();
  }, [online, stale, syncNow]);

  // Timer loop: fast while stale, slow heartbeat when healthy.
  useEffect(() => {
    if (!online) return;
    const every = stale ? retryMs : intervalMs;
    if (!every) return;
    const id = window.setInterval(() => void syncNow(), every);
    return () => window.clearInterval(id);
  }, [online, stale, retryMs, intervalMs, syncNow]);

  return { syncing, lastSyncedAt, syncNow };
}
