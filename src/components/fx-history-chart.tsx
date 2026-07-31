// Historical FX trend chart for the admin currency dashboard. Range, base and
// quote selection are driven by the parent route's URL search params so a chart
// view can be bookmarked or shared.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, LineChart as LineChartIcon, TrendingDown, TrendingUp } from "lucide-react";
import { EmptyState, SectionCard } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TrendChart } from "@/components/charts";
import { exportCsv } from "@/lib/exports";
import { getFxHistory, FX_RANGES, SUPPORTED_QUOTES, type FxRangeKey } from "@/lib/fx.functions";

const RANGE_KEYS = Object.keys(FX_RANGES) as FxRangeKey[];

function fmtRate(v: number) {
  return v.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function fmtDay(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function FxHistoryChart({
  base,
  quotes,
  range,
  onRangeChange,
  onQuotesChange,
}: {
  base: string;
  quotes: string[];
  range: FxRangeKey;
  onRangeChange: (range: FxRangeKey) => void;
  onQuotesChange: (quotes: string[]) => void;
}) {
  const fetchHistory = useServerFn(getFxHistory);
  const q = useQuery({
    queryKey: ["fx", "history", base, range, quotes.join(",")],
    queryFn: () => fetchHistory({ data: { base, quotes, range } }),
    staleTime: 5 * 60_000,
  });

  const series = useMemo(
    () => (q.data?.quotes ?? quotes).map((code) => ({ key: code, label: code, format: fmtRate })),
    [q.data, quotes],
  );

  const points = useMemo(
    () => (q.data?.points ?? []).map((p) => ({ ...p, label: fmtDay(String(p.date)) })),
    [q.data],
  );

  // Per-currency open/last/high/low over the visible window.
  const stats = useMemo(() => {
    return series
      .map((s) => {
        const values = points
          .map((p) => Number(p[s.key]))
          .filter((v) => Number.isFinite(v) && v > 0);
        if (values.length === 0) return null;
        const open = values[0]!;
        const last = values[values.length - 1]!;
        const change = last - open;
        const pct = open > 0 ? (change / open) * 100 : 0;
        return {
          quote: s.key,
          open,
          last,
          change,
          pct,
          high: Math.max(...values),
          low: Math.min(...values),
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);
  }, [series, points]);

  const toggleQuote = (code: string) => {
    const next = quotes.includes(code)
      ? quotes.filter((c) => c !== code)
      : [...quotes, code].slice(0, 5);
    onQuotesChange(next.length ? next : [code]);
  };

  const handleExport = () => {
    const rows = points.flatMap((p) =>
      series
        .filter((s) => Number.isFinite(Number(p[s.key])))
        .map((s) => ({
          date: String(p.date),
          base,
          quote: s.key,
          rate: Number(p[s.key]),
        })),
    );
    exportCsv({
      title: `FX history ${base} ${range}`,
      subtitle: `${q.data?.from ?? ""} to ${q.data?.to ?? ""} · sampled every ${q.data?.granularity_days ?? 1} day(s)`,
      filename: `fx_history_${base}_${range}`,
      columns: [
        { header: "Date", accessor: (r: (typeof rows)[number]) => r.date },
        { header: "Base", accessor: (r: (typeof rows)[number]) => r.base },
        { header: "Quote", accessor: (r: (typeof rows)[number]) => r.quote },
        { header: "Rate", accessor: (r: (typeof rows)[number]) => r.rate, align: "right" },
      ],
      rows,
    });
  };

  return (
    <SectionCard
      title="Historical rate trend"
      action={
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Range</Label>
            <div className="mt-1 inline-flex overflow-hidden rounded-md border border-border">
              {RANGE_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onRangeChange(key)}
                  aria-pressed={range === key}
                  className={
                    "px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors " +
                    (range === key
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted")
                  }
                >
                  {FX_RANGES[key].label}
                </button>
              ))}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={handleExport} disabled={points.length === 0}>
            <Download className="mr-1 size-3.5" />
            Export CSV
          </Button>
        </div>
      }
    >
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Compare against {base}
          </span>
          {SUPPORTED_QUOTES.filter((c) => c !== base).map((code) => {
            const on = quotes.includes(code);
            return (
              <button
                key={code}
                type="button"
                onClick={() => toggleQuote(code)}
                aria-pressed={on}
                className={
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-colors " +
                  (on
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted")
                }
              >
                {code}
              </button>
            );
          })}
          <span className="text-[11px] text-muted-foreground">(up to 5)</span>
        </div>

        {q.isLoading ? (
          <div aria-hidden="true" className="h-[320px] w-full animate-pulse rounded-lg bg-muted/40" />
        ) : points.length === 0 ? (
          <EmptyState
            title="History not available for this range yet"
            hint="Rate history is collected as the board refreshes and backfilled from the provider when reachable. Try a shorter range or refresh again shortly."
            icon={<LineChartIcon className="h-5 w-5" />}
          />
        ) : (
          <>
            <TrendChart
              data={points}
              series={series}
              xKey="label"
              title={`${base} exchange-rate trend over ${FX_RANGES[range].label}`}
              height={320}
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {stats.map((s) => {
                const up = s.change >= 0;
                return (
                  <div key={s.quote} className="rounded-md border border-border/60 bg-muted/30 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {base} → {s.quote}
                      </p>
                      <span
                        className={
                          "inline-flex items-center gap-1 text-xs font-semibold " +
                          (up ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")
                        }
                      >
                        {up ? (
                          <TrendingUp className="size-3.5" />
                        ) : (
                          <TrendingDown className="size-3.5" />
                        )}
                        <span className="tabular">
                          {up ? "+" : ""}
                          {s.pct.toLocaleString(undefined, { maximumFractionDigits: 2 })}%
                        </span>
                      </span>
                    </div>
                    <p className="tabular mt-1 text-lg font-semibold">{fmtRate(s.last)}</p>
                    <dl className="mt-1 grid grid-cols-3 gap-1 text-[11px] text-muted-foreground">
                      <div>
                        <dt>Open</dt>
                        <dd className="tabular text-foreground">{fmtRate(s.open)}</dd>
                      </div>
                      <div>
                        <dt>High</dt>
                        <dd className="tabular text-foreground">{fmtRate(s.high)}</dd>
                      </div>
                      <div>
                        <dt>Low</dt>
                        <dd className="tabular text-foreground">{fmtRate(s.low)}</dd>
                      </div>
                    </dl>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {q.data?.from} → {q.data?.to} · sampled every{" "}
              {q.data?.granularity_days === 1 ? "day" : `${q.data?.granularity_days} days`}
              {q.data?.complete === false ? " · some days unavailable from the provider" : ""}
              {q.isFetching ? " · updating…" : ""}
            </p>
          </>
        )}
      </div>
    </SectionCard>
  );
}
