// Heavy chart implementation — recharts lives here so the main
// `charts.tsx` module can lazy-load it and keep initial route chunks slim.
import { useMemo, type ReactNode } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
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

export const chartPalette = CHART_PALETTE;

export type ChartSeries = {
  key: string;
  label: string;
  color?: string;
  format?: (value: number) => string;
};

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

export type TrendChartProps<T extends Record<string, unknown>> = {
  data: readonly T[];
  series: ChartSeries[];
  xKey: string;
  title: string;
  height?: number;
  className?: string;
  /** "area" renders soft gradient fills under each series (premium look). */
  variant?: "line" | "area";
};

// Default export so React.lazy() can pick it up cleanly.
export default function TrendChartImpl<T extends Record<string, unknown>>({
  data,
  series,
  xKey,
  title,
  height = 320,
  className,
  variant = "line",
}: TrendChartProps<T>): ReactNode {
  const reduced = useReducedMotion();
  const colored = useMemo(
    () => series.map((s, i) => ({ ...s, color: s.color ?? chartPalette[i % chartPalette.length] })),
    [series],
  );
  const gradientId = (key: string) => `grad-${key.replace(/[^a-zA-Z0-9_-]/g, "")}-${variant}`;

  const axes = (
    <>
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
    </>
  );

  const rows = data as Record<string, unknown>[];
  const margin = { top: 8, right: 12, bottom: 4, left: -8 };

  return (
    <div className={cn("w-full", className)} style={{ height }} role="img" aria-label={title}>
      <ChartA11ySummary title={title} data={data} series={colored} xKey={xKey} />
      <ResponsiveContainer width="100%" height="100%">
        {variant === "area" ? (
          <AreaChart data={rows} margin={margin}>
            <defs>
              {colored.map((s) => (
                <linearGradient key={s.key} id={gradientId(s.key)} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            {axes}
            {colored.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2.25}
                fill={`url(#${gradientId(s.key)})`}
                activeDot={{ r: 4 }}
                isAnimationActive={!reduced}
                animationDuration={reduced ? 0 : 500}
                animationEasing="ease-out"
              />
            ))}
          </AreaChart>
        ) : (
          <LineChart data={rows} margin={margin}>
            {axes}
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
        )}
      </ResponsiveContainer>
    </div>
  );
}
