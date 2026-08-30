import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRightLeft, RefreshCw } from "lucide-react";
import { SectionCard } from "@/components/primitives";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getFxRates, DEFAULT_BASE, SUPPORTED_QUOTES } from "@/lib/fx.functions";

export function FxConverterWidget() {
  const [base, setBase] = useState<string>(DEFAULT_BASE);
  const [quote, setQuote] = useState<string>("USD");
  const [amount, setAmount] = useState<string>("1000");

  const fetchRates = useServerFn(getFxRates);
  const q = useQuery({
    queryKey: ["fx", base],
    queryFn: () => fetchRates({ data: { base } }),
    staleTime: 15 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
  });

  const rate = useMemo(() => {
    const rows = q.data?.rates ?? [];
    return rows.find((r) => r.quote.toUpperCase() === quote.toUpperCase())?.rate ?? null;
  }, [q.data, quote]);

  const numAmount = Number(amount);
  const converted = rate != null && Number.isFinite(numAmount) ? numAmount * rate : null;

  return (
    <SectionCard
      title="Universal currency converter"
      action={
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1 text-[11px] text-muted-foreground md:inline-flex">
            <ArrowRightLeft className="size-3.5" />
            {q.data?.source ? `Rates: ${q.data.source}` : "Loading…"}
            {q.data?.fetched_at ? ` · ${new Date(q.data.fetched_at).toLocaleTimeString()}` : ""}
          </span>
          <Button size="sm" variant="ghost" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={`mr-1 size-3.5 ${q.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 md:grid-cols-4">
        <div>
          <Label className="text-xs">Amount</Label>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">From</Label>
          <select
            value={base}
            onChange={(e) => setBase(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {SUPPORTED_QUOTES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <select
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {SUPPORTED_QUOTES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Converted</Label>
          <div className="mt-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm font-semibold">
            {converted != null
              ? `${converted.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${quote}`
              : "—"}
          </div>
          {rate != null ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              1 {base} = {rate.toLocaleString(undefined, { maximumFractionDigits: 6 })} {quote}
            </p>
          ) : null}
        </div>
      </div>
    </SectionCard>
  );
}
