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
