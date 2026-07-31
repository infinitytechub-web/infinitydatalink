/**
 * Tiny localStorage snapshot helper so read-only screens stay viewable when
 * connectivity drops. Snapshots are namespaced per user-visible feature key and
 * carry the time they were captured.
 */
const PREFIX = "it360.offline.";

export type Snapshot<T> = { data: T; saved_at: string };

export function readSnapshot<T>(key: string): Snapshot<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot<T>;
    if (!parsed || typeof parsed.saved_at !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSnapshot<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify({ data, saved_at: new Date().toISOString() }));
  } catch {
    /* storage full or blocked — offline fallback is best-effort */
  }
}

export function clearSnapshot(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

/**
 * Runs the fetcher, caching successful results. If the fetch fails (offline,
 * flaky network, 5xx) the last snapshot is returned with `stale: true` so the
 * UI can keep rendering KPIs and progress.
 */
export async function withOfflineFallback<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<{ data: T; stale: boolean; saved_at: string | null }> {
  try {
    const data = await fetcher();
    writeSnapshot(key, data);
    return { data, stale: false, saved_at: new Date().toISOString() };
  } catch (err) {
    const snap = readSnapshot<T>(key);
    if (snap) return { data: snap.data, stale: true, saved_at: snap.saved_at };
    throw err;
  }
}
