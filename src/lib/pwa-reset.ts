// One-click PWA / preview cache reset.
//
// Unregisters every service worker registered for this origin and clears all
// Cache Storage buckets, then hard-reloads. Used to recover from stale bundles
// left behind by an older build or another app on the same preview origin.

export type PwaResetResult = {
  serviceWorkers: number;
  caches: number;
};

export async function resetPwaCaches(): Promise<PwaResetResult> {
  let serviceWorkers = 0;
  let cacheCount = 0;

  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      const results = await Promise.allSettled(regs.map((r) => r.unregister()));
      serviceWorkers = results.filter((r) => r.status === "fulfilled").length;
    }
  } catch {
    /* ignore */
  }

  try {
    if (typeof window !== "undefined" && "caches" in window) {
      const keys = await caches.keys();
      const results = await Promise.allSettled(keys.map((k) => caches.delete(k)));
      cacheCount = results.filter((r) => r.status === "fulfilled").length;
    }
  } catch {
    /* ignore */
  }

  return { serviceWorkers, caches: cacheCount };
}

export function reloadBypassingCache(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("cache-reset", String(Date.now()));
  window.location.replace(url.toString());
}
