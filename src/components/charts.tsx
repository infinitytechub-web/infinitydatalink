// Public chart API. Heavy recharts implementation is code-split into
// `charts.recharts.tsx` so admin/dashboard chunks don't pay for it on
// first paint — the module only ships once a chart actually renders.
import { lazy, Suspense, type ReactNode } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { CHART_PALETTE } from "@/lib/theme-tokens";
import type { ChartSeries, TrendChartProps } from "./charts.recharts";

export type { ChartSeries } from "./charts.recharts";
export const chartPalette = CHART_PALETTE;

const LazyTrendChart = lazy(() => import("./charts.recharts"));

function ChartSkeleton({ height, className }: { height: number; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("w-full animate-pulse rounded-lg bg-muted/40", className)}
      style={{ height }}
    />
  );
}

export function TrendChart<T extends Record<string, unknown>>(props: TrendChartProps<T>): ReactNode {
  const height = props.height ?? 320;
  return (
    <Suspense fallback={<ChartSkeleton height={height} className={props.className} />}>
      {/* Cast: generic passthrough for the lazy component. */}
      <LazyTrendChart {...(props as TrendChartProps<Record<string, unknown>>)} />
    </Suspense>
  );
}

/** Simple horizontal bar visual for status/category mixes — no recharts
 * overhead, always readable on mobile. */
export function BarList({
  rows,
  format,
  emptyLabel,
}: {
  rows: { label: string; value: number; hint?: ReactNode }[];
  format?: (v: number) => string;
  emptyLabel?: string;
}) {
  const reduced = useReducedMotion();
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) {
    return <p className="p-6 text-sm text-muted-foreground">{emptyLabel ?? "No data"}</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => {
        const pct = Math.max(2, Math.round((row.value / max) * 100));
        return (
          <li
            key={row.label}
            className="grid grid-cols-[minmax(6rem,10rem)_minmax(0,1fr)_minmax(3rem,auto)] items-center gap-3 px-6 py-3 text-sm"
          >
            <span className="truncate text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {row.label}
            </span>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={max}
              aria-valuenow={row.value}
              aria-label={row.label}
            >
              <div
                className={cn(
                  "h-full rounded-full bg-primary",
                  reduced ? undefined : "transition-[width] duration-500 ease-out",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="tabular text-right font-medium text-foreground">
              {format ? format(row.value) : row.value}
            </span>
            {row.hint ? <span className="col-span-3 text-xs text-muted-foreground">{row.hint}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
