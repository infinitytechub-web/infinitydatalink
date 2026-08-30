// Reports Core Web Vitals into runtime_error_logs as `severity: "info"`
// entries so we can correlate slow paints/interactions with the same
// route/user context we already capture for errors. Best-effort only —
// never throws, never blocks, no-ops during SSR.
import { logRuntimeError } from "./runtime-error-logger";

let installed = false;

// Only report metrics that materially exceed "good" thresholds to keep
// log volume sane. Thresholds mirror web.dev's public guidance.
const THRESHOLDS: Record<string, number> = {
  LCP: 2500, // ms — largest contentful paint
  INP: 200, // ms — interaction to next paint
  CLS: 0.1, // unitless — cumulative layout shift
  FCP: 1800, // ms — first contentful paint
  TTFB: 800, // ms — time to first byte
};

export function installWebVitalsReporter() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  void import("web-vitals")
    .then(({ onLCP, onINP, onCLS, onFCP, onTTFB }) => {
      const report = (metric: { name: string; value: number; rating?: string; id: string }) => {
        const threshold = THRESHOLDS[metric.name];
        // Skip "good" metrics — we only want signal on slow pages.
        if (threshold !== undefined && metric.value < threshold) return;
        void logRuntimeError({
          kind: "route",
          severity: "info",
          message: `web-vitals ${metric.name} ${Math.round(metric.value * 1000) / 1000}${metric.name === "CLS" ? "" : "ms"}`,
          meta: {
            web_vitals: true,
            name: metric.name,
            value: metric.value,
            rating: metric.rating,
            id: metric.id,
          },
        });
      };
      onLCP(report);
      onINP(report);
      onCLS(report);
      onFCP(report);
      onTTFB(report);
    })
    .catch(() => {
      // web-vitals failing to load is not fatal.
    });
}
