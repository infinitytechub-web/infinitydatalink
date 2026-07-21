import { useMemo, type ReactNode } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  type TooltipProps,
} from "recharts";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

import { CHART_PALETTE } from "@/lib/theme-tokens";

/**
 * Shared chart palette — sourced from the centralized tone tokens so chart
 * series match KPI tiles, section accents, and status pills app-wide.
 */
export const chartPalette = CHART_PALETTE;


export type ChartSeries = {
  key: string;
  label: string;
  color?: string;
  format?: (value: number) => string;
};

/**
 * Accessible tooltip: renders values as a description list so screen
 * readers announce the label/value pairs coherently. Recharts owns the
 * positioning; we only theme the surface.
 */
function AccessibleTooltip({
  active,
  payload,
  label,
  series,
}: TooltipProps<number, string> & { series: ChartSeries[] }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      role="tooltip"
      className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs text-popover-foreground shadow-md backdrop-blur"
    >
      <p className="mb-1 font-semibold">{label}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {payload.map((entry) => {
          const meta = series.find((s) => s.key === entry.dataKey);
          const value = typeof entry.value === "number" ? entry.value : Number(entry.value ?? 0);
          const formatted = meta?.format ? meta.format(value) : String(entry.value ?? "");
          return (
            <div key={String(entry.dataKey)} className="contents">
              <dt className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="inline-block size-2 rounded-full"
                  style={{ background: entry.color }}
                />
                {meta?.label ?? String(entry.dataKey)}
              </dt>
              <dd className="tabular text-right font-medium text-foreground">{formatted}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

/** Renders a plain-text summary of the chart for assistive tech. */
function ChartA11ySummary({
  title,
  data,
  series,
  xKey,
}: {
  title: string;
  data: readonly Record<string, unknown>[];
  series: ChartSeries[];
  xKey: string;
}) {
  if (data.length === 0) return null;
  const first = data[0];
  const last = data[data.length - 1];
  const range = `${String(first[xKey])} to ${String(last[xKey])}`;
  const totals = series.map((s) => {
    const sum = data.reduce((acc, row) => acc + (Number(row[s.key]) || 0), 0);
    return `${s.label}: ${s.format ? s.format(sum) : sum}`;
  });
  return (
    <p className="sr-only">
      {title}. {range}. Totals — {totals.join("; ")}.
    </p>
  );
}

export function TrendChart<T extends Record<string, unknown>>({
  data,
  series,
  xKey,
  title,
  height = 320,
  className,
}: {
  data: readonly T[];
  series: ChartSeries[];
  xKey: string;
  title: string;
  height?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  // Recharts re-renders on every tooltip move; memoise the palette lookup.
  const colored = useMemo(
    () => series.map((s, i) => ({ ...s, color: s.color ?? chartPalette[i % chartPalette.length] })),
    [series],
  );

  return (
    <div
      className={cn("w-full", className)}
      style={{ height }}
      role="img"
      aria-label={title}
    >
      <ChartA11ySummary title={title} data={data} series={colored} xKey={xKey} />
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data as Record<string, unknown>[]} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey={xKey}
            fontSize={11}
            stroke="var(--chart-axis)"
            tick={{ fill: "var(--chart-axis)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--chart-grid)" }}
            minTickGap={16}
          />
          <YAxis
            fontSize={11}
            stroke="var(--chart-axis)"
            tick={{ fill: "var(--chart-axis)" }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1, strokeDasharray: "3 3" }}
            isAnimationActive={!reduced}
            animationDuration={reduced ? 0 : 120}
            content={<AccessibleTooltip series={colored} />}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8, color: "var(--muted-foreground)" }}
            iconType="circle"
            iconSize={8}
          />

          {colored.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={!reduced}
              animationDuration={reduced ? 0 : 400}
              animationEasing="ease-out"
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
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
