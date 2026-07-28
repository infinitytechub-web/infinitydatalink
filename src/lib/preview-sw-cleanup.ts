// Preview-safe service worker cleanup.
//
// This project does NOT ship a service worker. But a returning visitor may
// still have one registered from an older build or from a different app on
// the same *.lovableproject.com origin. In the Lovable preview iframe that
// stale worker can serve cached HTML/chunks and make the pane look broken.
//
// On every load in a preview/dev/iframe context, unregister every SW
// registration for this origin and blow away Cache Storage. Production
// published builds are untouched.

function isPreviewLikeHost(): boolean {
  if (typeof window === "undefined") return false;
  const { hostname, search } = window.location;
  if (search.includes("sw=off")) return true;
  if (window.self !== window.top) return true; // inside an iframe (Lovable preview)
  if (!import.meta.env.PROD) return true;
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  if (hostname.startsWith("id-preview--") || hostname.startsWith("preview--")) return true;
  if (hostname === "lovableproject.com" || hostname.endsWith(".lovableproject.com")) return true;
  if (hostname === "lovableproject-dev.com" || hostname.endsWith(".lovableproject-dev.com")) return true;
  if (hostname === "beta.lovable.dev" || hostname.endsWith(".beta.lovable.dev")) return true;
  return false;
}

export async function cleanupPreviewServiceWorkers(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isPreviewLikeHost()) return;

  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(regs.map((r) => r.unregister()));
    }
  } catch {
    /* ignore */
  }

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.allSettled(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }
}
