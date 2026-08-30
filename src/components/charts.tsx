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
  colorful = true,
}: {
  rows: { label: string; value: number; hint?: ReactNode }[];
  format?: (v: number) => string;
  emptyLabel?: string;
  /** Tint each bar with a distinct palette color (default) instead of primary. */
  colorful?: boolean;
}) {
  const reduced = useReducedMotion();
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) {
    return <p className="p-6 text-sm text-muted-foreground">{emptyLabel ?? "No data"}</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {rows.map((row, i) => {
        const pct = Math.max(2, Math.round((row.value / max) * 100));
        const color = CHART_PALETTE[i % CHART_PALETTE.length];
        return (
          <li
            key={row.label}
            className="grid grid-cols-[minmax(6rem,10rem)_minmax(0,1fr)_minmax(3rem,auto)] items-center gap-3 px-6 py-3 text-sm transition-colors hover:bg-muted/40"
          >
            <span className="flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {colorful ? (
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: color }}
                />
              ) : null}
              <span className="truncate">{row.label}</span>
            </span>
            <div
              className="h-2.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={max}
              aria-valuenow={row.value}
              aria-label={row.label}
            >
              <div
                className={cn(
                  "h-full rounded-full",
                  colorful ? undefined : "bg-primary",
                  reduced ? undefined : "transition-[width] duration-500 ease-out",
                )}
                style={
                  colorful
                    ? {
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, ${color} 0%, color-mix(in oklab, ${color} 62%, white) 100%)`,
                      }
                    : { width: `${pct}%` }
                }
              />
            </div>
            <span className="tabular text-right font-semibold text-foreground">
              {format ? format(row.value) : row.value}
            </span>
            {row.hint ? <span className="col-span-3 text-xs text-muted-foreground">{row.hint}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

