import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRightLeft, RefreshCw, TrendingUp } from "lucide-react";
import {
  EmptyState,
  ErrorState,
  KPIStat,
  PageHeader,
  SectionCard,
} from "@/components/primitives";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FxConverterWidget } from "@/components/fx-converter-widget";
import { getFxRates, DEFAULT_BASE, SUPPORTED_QUOTES, FX_RANGES, type FxRangeKey } from "@/lib/fx.functions";
import { FxHistoryChart } from "@/components/fx-history-chart";

const searchSchema = z.object({
  base: fallback(z.string(), DEFAULT_BASE).default(DEFAULT_BASE),
  range: fallback(z.string(), "30D").default("30D"),
  quotes: fallback(z.string(), "USD,EUR,GBP").default("USD,EUR,GBP"),
});

const INTERVALS = [
  { label: "30s", ms: 30_000 },
  { label: "1m", ms: 60_000 },
  { label: "5m", ms: 5 * 60_000 },
  { label: "Off", ms: 0 },
] as const;

export const Route = createFileRoute("/_admin/admin/fx")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Live currency converter — IT-360 Admin" },
      {
        name: "description",
        content:
          "Real-time multi-currency converter and live exchange-rate board for administrators, with auto-refresh and cross rates.",
      },
      { property: "og:title", content: "Live currency converter — IT-360 Admin" },
      {
        property: "og:description",
        content: "Real-time exchange-rate board and converter for administrators.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FxDashboard,
  errorComponent: ({ error }) => (
    <div className="p-6">
      <ErrorState title="Rates unavailable" message={error.message} />
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm text-muted-foreground">Not found.</div>,
});

function FxDashboard() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const base = (SUPPORTED_QUOTES as readonly string[]).includes(search.base.toUpperCase())
    ? search.base.toUpperCase()
    : DEFAULT_BASE;
  const range = (Object.keys(FX_RANGES).includes(search.range) ? search.range : "30D") as FxRangeKey;
  const chartQuotes = useMemo(() => {
    const list = String(search.quotes)
      .split(",")
      .map((c: string) => c.trim().toUpperCase())
      .filter((c: string) => (SUPPORTED_QUOTES as readonly string[]).includes(c) && c !== base);
    return (list.length ? list : ["USD", "EUR", "GBP"].filter((c) => c !== base)).slice(0, 5);
  }, [search.quotes, base]);

  const setBase = (value: string) =>
    void navigate({ search: (prev: typeof search) => ({ ...prev, base: value.toUpperCase() }) });
  const [intervalMs, setIntervalMs] = useState<number>(60_000);
  const [amount, setAmount] = useState<string>("1000");

  const fetchRates = useServerFn(getFxRates);
  const q = useQuery({
    queryKey: ["fx", "board", base],
    queryFn: () => fetchRates({ data: { base } }),
    refetchInterval: intervalMs || false,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
  });

  const rows = useMemo(() => {
    const list = (q.data?.rates ?? []).filter((r) => r.quote.toUpperCase() !== base.toUpperCase());
    return list.slice().sort((a, b) => a.quote.localeCompare(b.quote));
  }, [q.data, base]);

  const numAmount = Number(amount);
  const amountValid = Number.isFinite(numAmount) && numAmount >= 0;
  const strongest = rows.reduce<null | (typeof rows)[number]>(
    (best, r) => (best == null || r.rate > best.rate ? r : best),
    null,
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Treasury"
        title="Live currency converter"
        description="Real-time exchange rates with auto-refresh, conversion table and cross rates for every supported currency."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-md border border-border">
              {INTERVALS.map((i) => (
                <button
                  key={i.label}
                  type="button"
                  onClick={() => setIntervalMs(i.ms)}
                  aria-pressed={intervalMs === i.ms}
                  className={
                    "px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors " +
                    (intervalMs === i.ms
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted")
                  }
                >
                  {i.label}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => void q.refetch()} disabled={q.isFetching}>
              <RefreshCw className={`mr-1 size-3.5 ${q.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        }
      />

      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat label="Base currency" value={base} accent hint="Institution reporting currency" />
        <KPIStat label="Currencies tracked" value={<span className="tabular">{rows.length}</span>} />
        <KPIStat
          label="Rate source"
          value={<span className="capitalize">{q.data?.source ?? "…"}</span>}
          hint={q.data?.fetched_at ? new Date(q.data.fetched_at).toLocaleString() : undefined}
        />
        <KPIStat
          label="Auto-refresh"
          value={intervalMs ? INTERVALS.find((i) => i.ms === intervalMs)!.label : "Off"}
          hint={q.isFetching ? "Syncing…" : "Live"}
        />
      </section>

      <FxConverterWidget />

      <FxHistoryChart
        base={base}
        quotes={chartQuotes}
        range={range}
        onRangeChange={(next) => void navigate({ search: (prev: typeof search) => ({ ...prev, range: next }) })}
        onQuotesChange={(next) =>
          void navigate({ search: (prev: typeof search) => ({ ...prev, quotes: next.join(",") }) })
        }
      />

      <SectionCard
        title="Live rate board"
        action={
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Base</Label>
              <select
                value={base}
                onChange={(e) => setBase(e.target.value)}
                className="mt-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                aria-label="Base currency"
              >
                {SUPPORTED_QUOTES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Amount</Label>
              <Input
                className="mt-1 h-8 w-28 text-xs"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-label="Amount to convert"
              />
            </div>
          </div>
        }
      >
        {rows.length === 0 ? (
          <EmptyState
            title={q.isLoading ? "Loading rates…" : "No rates available"}
            hint="Rates refresh automatically once the provider responds."
            icon={<ArrowRightLeft className="h-5 w-5" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Live exchange rates against {base}</caption>
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="px-4 py-2.5">Currency</th>
                  <th scope="col" className="px-4 py-2.5 text-right">1 {base} =</th>
                  <th scope="col" className="px-4 py-2.5 text-right">
                    {amountValid ? `${numAmount.toLocaleString()} ${base} =` : "Converted"}
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right">Inverse</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.quote} className="hover:bg-muted/40">
                    <th scope="row" className="px-4 py-2.5 text-left font-semibold">
                      {r.quote}
                    </th>
                    <td className="tabular px-4 py-2.5 text-right">
                      {r.rate.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                    </td>
                    <td className="tabular px-4 py-2.5 text-right font-medium">
                      {amountValid
                        ? (numAmount * r.rate).toLocaleString(undefined, { maximumFractionDigits: 2 })
                        : "—"}
                    </td>
                    <td className="tabular px-4 py-2.5 text-right text-muted-foreground">
                      {r.rate > 0
                        ? (1 / r.rate).toLocaleString(undefined, { maximumFractionDigits: 6 })
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[11px] text-muted-foreground">
                      {new Date(r.fetched_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Highlights" accent="gold">
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="rounded-md border border-border/60 bg-muted/30 p-4">
            <p className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" /> Highest quoted rate
            </p>
            <p className="mt-1 text-lg font-semibold">
              {strongest
                ? `1 ${base} = ${strongest.rate.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${strongest.quote}`
                : "—"}
            </p>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/30 p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Live user activity</p>
            <p className="mt-1 text-sm text-muted-foreground">
              See who is using the platform right now on the{" "}
              <Link to="/admin/live-users" className="font-medium text-primary hover:underline">
                live users panel
              </Link>
              .
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
