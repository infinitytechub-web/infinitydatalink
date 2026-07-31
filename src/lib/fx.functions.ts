// Universal FX converter — GHS default base. Rates fetched from exchangerate.host
// and cached server-side (in-memory + fx_rates DB). Falls back to last-known DB row.
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const DEFAULT_BASE = "GHS";
export const SUPPORTED_QUOTES = [
  "GHS", "USD", "EUR", "GBP", "NGN", "ZAR", "KES", "XOF", "CAD", "AUD", "JPY", "CNY", "INR",
] as const;

export type FxRate = { base: string; quote: string; rate: number; fetched_at: string };

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
type CacheEntry = { rows: FxRate[]; ts: number };
const memoryCache = new Map<string, CacheEntry>();

function serverClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function readDbRates(base: string): Promise<FxRate[]> {
  const client = serverClient();
  const { data } = await client
    .from("fx_rates")
    .select("base, quote, rate, fetched_at")
    .eq("base", base);
  return (data ?? []) as FxRate[];
}

async function writeDbRates(rows: FxRate[]) {
  if (!rows.length) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await (supabaseAdmin as any)
    .from("fx_rates")
    .upsert(rows, { onConflict: "base,quote" });
}

async function fetchLive(base: string): Promise<FxRate[] | null> {
  const symbols = SUPPORTED_QUOTES.filter((q) => q !== base).join(",");
  const url = `https://api.exchangerate.host/latest?base=${encodeURIComponent(base)}&symbols=${symbols}`;
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const json: any = await res.json();
    if (!json?.rates) return null;
    const now = new Date().toISOString();
    const rows: FxRate[] = Object.entries(json.rates as Record<string, number>).map(
      ([quote, rate]) => ({ base, quote, rate: Number(rate), fetched_at: now }),
    );
    // Self-rate
    rows.push({ base, quote: base, rate: 1, fetched_at: now });
    return rows;
  } catch {
    return null;
  }
}

async function getRates(base: string): Promise<{ rows: FxRate[]; source: "live" | "cache" | "db" | "fallback" }> {
  const B = base.toUpperCase();
  const cached = memoryCache.get(B);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { rows: cached.rows, source: "cache" };
  }
  const live = await fetchLive(B);
  if (live && live.length) {
    memoryCache.set(B, { rows: live, ts: Date.now() });
    // Fire-and-forget DB write (best-effort)
    writeDbRates(live).catch(() => {});
    return { rows: live, source: "live" };
  }
  const db = await readDbRates(B);
  if (db.length) {
    memoryCache.set(B, { rows: db, ts: Date.now() });
    return { rows: db, source: "db" };
  }
  // Last-ditch: identity only
  return {
    rows: [{ base: B, quote: B, rate: 1, fetched_at: new Date().toISOString() }],
    source: "fallback",
  };
}

export const getFxRates = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({ base: z.string().length(3).optional().default(DEFAULT_BASE) })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const { rows, source } = await getRates(data.base);
    return {
      base: data.base.toUpperCase(),
      rates: rows,
      source,
      fetched_at: rows[0]?.fetched_at ?? new Date().toISOString(),
    };
  });

export const convertFx = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        amount: z.number().finite().nonnegative(),
        from: z.string().length(3),
        to: z.string().length(3),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { rows } = await getRates(data.from);
    const row = rows.find((r) => r.quote.toUpperCase() === data.to.toUpperCase());
    if (!row) throw new Error(`Rate ${data.from}->${data.to} unavailable`);
    return {
      amount: data.amount,
      from: data.from.toUpperCase(),
      to: data.to.toUpperCase(),
      rate: row.rate,
      result: data.amount * row.rate,
      fetched_at: row.fetched_at,
    };
  });

// ---------------------------------------------------------------------------
// Historical rates
// ---------------------------------------------------------------------------
// Daily closes are persisted in `fx_rate_history` (base, quote, rate_date).
// Missing dates in a requested window are backfilled once from the provider
// (one request per date returns every quote), then served from the DB.

export const FX_RANGES = {
  "7D": { label: "7D", days: 7, stepDays: 1 },
  "30D": { label: "30D", days: 30, stepDays: 1 },
  "90D": { label: "90D", days: 90, stepDays: 2 },
  "6M": { label: "6M", days: 182, stepDays: 7 },
  "1Y": { label: "1Y", days: 365, stepDays: 7 },
} as const;

export type FxRangeKey = keyof typeof FX_RANGES;

export type FxHistoryPoint = { date: string } & Record<string, number | string>;

const MAX_BACKFILL_PER_CALL = 40;
const HISTORY_PROVIDER = "currency-api";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Sampled dates for a range, oldest → newest, always including today. */
function rangeDates(range: FxRangeKey): string[] {
  const { days, stepDays } = FX_RANGES[range];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const out: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= stepDays) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - offset);
    out.push(isoDate(d));
  }
  const todayIso = isoDate(today);
  if (out[out.length - 1] !== todayIso) out.push(todayIso);
  return out;
}

type HistoryRow = { base: string; quote: string; rate_date: string; rate: number };

async function readHistory(base: string, from: string, to: string): Promise<HistoryRow[]> {
  const client = serverClient();
  const { data } = await client
    .from("fx_rate_history")
    .select("base, quote, rate_date, rate")
    .eq("base", base)
    .gte("rate_date", from)
    .lte("rate_date", to)
    .order("rate_date", { ascending: true });
  return ((data ?? []) as any[]).map((r) => ({
    base: r.base,
    quote: r.quote,
    rate_date: r.rate_date,
    rate: Number(r.rate),
  }));
}

async function writeHistory(rows: HistoryRow[], source = HISTORY_PROVIDER) {
  if (!rows.length) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any)
      .from("fx_rate_history")
      .upsert(
        rows.map((r) => ({ ...r, source })),
        { onConflict: "base,quote,rate_date" },
      );
  } catch {
    /* best-effort — chart still renders from whatever is already stored */
  }
}

/** One dated snapshot for `base`, limited to the supported quote list. */
async function fetchHistoricalDay(base: string, date: string): Promise<HistoryRow[] | null> {
  const b = base.toLowerCase();
  const urls = [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/${b}.min.json`,
    `https://${date}.currency-api.pages.dev/v1/currencies/${b}.min.json`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) continue;
      const json: any = await res.json();
      const table = json?.[b] as Record<string, number> | undefined;
      if (!table) continue;
      const rows: HistoryRow[] = [];
      for (const quote of SUPPORTED_QUOTES) {
        const value = quote === base.toUpperCase() ? 1 : table[quote.toLowerCase()];
        if (typeof value === "number" && Number.isFinite(value)) {
          rows.push({ base: base.toUpperCase(), quote, rate_date: date, rate: value });
        }
      }
      if (rows.length) return rows;
    } catch {
      /* try next mirror */
    }
  }
  return null;
}

async function backfill(base: string, dates: string[]): Promise<HistoryRow[]> {
  const collected: HistoryRow[] = [];
  const queue = dates.slice(0, MAX_BACKFILL_PER_CALL);
  const CONCURRENCY = 6;
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (cursor < queue.length) {
        const date = queue[cursor++]!;
        const rows = await fetchHistoricalDay(base, date);
        if (rows) collected.push(...rows);
      }
    }),
  );
  await writeHistory(collected);
  return collected;
}

export const getFxHistory = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        base: z.string().length(3).optional().default(DEFAULT_BASE),
        quotes: z.array(z.string().length(3)).optional().default(["USD", "EUR", "GBP"]),
        range: z.string().optional().default("30D"),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const base = data.base.toUpperCase();
    const range = (Object.keys(FX_RANGES).includes(data.range) ? data.range : "30D") as FxRangeKey;
    const quotes = Array.from(
      new Set(
        data.quotes
          .map((q) => q.toUpperCase())
          .filter((q) => (SUPPORTED_QUOTES as readonly string[]).includes(q) && q !== base),
      ),
    ).slice(0, 5);

    const dates = rangeDates(range);
    const from = dates[0]!;
    const to = dates[dates.length - 1]!;

    let rows = await readHistory(base, from, to);
    const stored = new Set(rows.map((r) => r.rate_date));
    const missing = dates.filter((d) => !stored.has(d));

    let backfilled = 0;
    if (missing.length) {
      const fetched = await backfill(base, missing);
      backfilled = new Set(fetched.map((r) => r.rate_date)).size;
      rows = rows.concat(fetched);
    }

    // Pivot to chart rows: one entry per sampled date with a column per quote.
    const wanted = new Set(dates);
    const byDate = new Map<string, Record<string, number>>();
    for (const r of rows) {
      if (!wanted.has(r.rate_date) || !quotes.includes(r.quote)) continue;
      const bucket = byDate.get(r.rate_date) ?? {};
      bucket[r.quote] = r.rate;
      byDate.set(r.rate_date, bucket);
    }

    const points: FxHistoryPoint[] = dates
      .filter((d) => byDate.has(d))
      .map((d) => ({ date: d, ...byDate.get(d)! }));

    return {
      base,
      quotes,
      range,
      from,
      to,
      points,
      granularity_days: FX_RANGES[range].stepDays,
      backfilled_days: backfilled,
      complete: points.length === dates.length,
    };
  });
