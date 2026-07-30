// Dev/preview-only watchdog for the Vite HMR websocket.
//
// If the live-reload socket drops (sandbox sleep, network blip, dev server
// restart) Vite stops applying updates and the preview can look frozen.
// This installs an auto-reconnect probe: while the socket is down we poll the
// dev server, and once it answers again we reload the page. A hard timeout
// fallback reloads anyway so the UI never stays stuck indefinitely.

const PROBE_INTERVAL_MS = 1500;
const MAX_WAIT_MS = 30_000;

let installed = false;

export function installHmrWatchdog(): void {
  if (installed) return;
  if (typeof window === "undefined") return;
  if (import.meta.env.PROD) return;
  const hot = import.meta.hot;
  if (!hot) return;
  installed = true;

  let timer: ReturnType<typeof setInterval> | null = null;
  let deadline = 0;

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const reload = () => {
    stop();
    window.location.reload();
  };

  const probe = async () => {
    if (document.visibilityState === "hidden") return;
    try {
      // Any 2xx/3xx/4xx answer means the dev server is back up.
      await fetch(`${window.location.origin}/?hmr-probe=${Date.now()}`, {
        method: "HEAD",
        cache: "no-store",
      });
      reload();
      return;
    } catch {
      /* still down */
    }
    if (Date.now() > deadline) reload();
  };

  const start = () => {
    if (timer) return;
    deadline = Date.now() + MAX_WAIT_MS;
    timer = setInterval(() => void probe(), PROBE_INTERVAL_MS);
  };

  hot.on("vite:ws:disconnect", start);
  hot.on("vite:ws:connect", stop);
  window.addEventListener("online", () => void probe());
}
