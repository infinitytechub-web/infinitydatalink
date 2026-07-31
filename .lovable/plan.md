# FX historical rate chart with selectable time ranges

Add a trend chart to the admin currency dashboard (`/admin/fx`) so rates can be reviewed over time, not just as a live snapshot.

## Why new data is needed

The current `fx_rates` table stores only the latest value per currency pair — each refresh overwrites the previous row (one row per base/quote). There is no history to chart today, so the feature needs both a historical source and a place to keep it.

## What gets built

**1. Range selector + chart on `/admin/fx`**

- Range buttons: 7D, 30D, 90D, 6M, 1Y.
- Currency pair picker: base (defaults GHS) and one or more quote currencies from the existing supported list.
- Line chart (same chart library and theme tokens as the rest of the admin analytics pages) with:
  - one line per selected quote currency, using the existing chart color tokens,
  - tooltip showing date and exact rate,
  - tabular-number axis labels, dark/light mode safe,
  - compact loading skeleton and an empty state when history isn't available yet.
- Summary strip above the chart for the selected range: opening rate, latest rate, absolute change, percent change, and range high/low, with up/down coloring.
- Chart sits directly under the live rate board so the live snapshot stays the top of the page.

**2. Historical data source**

- New server function `getFxHistory({ base, quotes, range })` that reads daily closing rates from a new history table.
- The history table is filled from two directions:
  - **Backfill on demand:** when a requested range has gaps, fetch the provider's daily time-series for that window once and store it, so later views are instant and stay available if the provider is unreachable.
  - **Ongoing:** each live rate refresh also records that day's value, so history keeps accumulating.
- If the provider is unavailable and no stored history exists for the window, the chart shows a clear "history not available for this range yet" state rather than an error page.

**3. Range persistence and export**

- Selected range and currency pair live in the URL so a chart view can be bookmarked or shared with another admin.
- "Export CSV" button for the visible series (date, base, quote, rate), using the existing sanitized CSV export helper.

## Technical notes

- Migration: new `public.fx_rate_history` table keyed on `(base, quote, rate_date)` with a numeric rate and source column, plus an index on `(base, quote, rate_date desc)` for range queries. Grants for `authenticated` read and `service_role` full access, RLS enabled, read policy limited to staff roles via the existing `has_role` helper (rates are operational data, not member data). Writes happen server-side only.
- Fetching and backfill live in `src/lib/fx.functions.ts` alongside the existing rate logic: provider call inside the handler, in-memory cache keyed by base+range, privileged writes through the admin client loaded inside the handler.
- Route work is confined to `src/routes/_admin.admin.fx.tsx`: `validateSearch` for `base`, `quotes`, and `range`, TanStack Query for the history read, and the shared `SectionCard`/`KPIStat` primitives so density and typography match the refreshed theme.
- Daily granularity for all ranges; intraday points are not stored.
