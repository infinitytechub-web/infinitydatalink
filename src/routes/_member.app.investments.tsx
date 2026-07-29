import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getMyInvestments,
  getMyInvestmentSeries,
  getMyHoldingBreakdown,
  purchaseShares,
  sellShares,
  transferShares,
  type MemberInvestmentSummary,
  type ShareProduct,
  type ShareHolding,
  type InvestmentSeriesPoint,
  type HoldingBreakdown,
} from "@/lib/shares.functions";
import { useQuery } from "@tanstack/react-query";
import { TrendChart } from "@/components/charts";


const investmentsQO = queryOptions<MemberInvestmentSummary>({
  queryKey: ["member", "investments"],
  queryFn: () => getMyInvestments(),
});

const seriesQO = queryOptions<InvestmentSeriesPoint[]>({
  queryKey: ["member", "investments", "series"],
  queryFn: () => getMyInvestmentSeries(),
});

export const Route = createFileRoute("/_member/app/investments")({
  head: () => ({ meta: [{ title: "Investments & Shares — IT-360 CashApp" }] }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(investmentsQO);
    context.queryClient.ensureQueryData(seriesQO);
  },
  component: InvestmentsPage,
});

const money = (n: number, ccy = "GHS") =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: ccy }).format(n);

function InvestmentsPage() {
  const { data } = useSuspenseQuery(investmentsQO);
  const { data: series } = useSuspenseQuery(seriesQO);
  const qc = useQueryClient();
  const purchase = useServerFn(purchaseShares);
  const sell = useServerFn(sellShares);
  const transfer = useServerFn(transferShares);

  const [tradeState, setTradeState] = useState<
    | { mode: "buy"; product: ShareProduct }
    | { mode: "sell"; holding: ShareHolding; product: ShareProduct }
    | null
  >(null);
  const [transferState, setTransferState] = useState<
    { holding: ShareHolding; product: ShareProduct } | null
  >(null);
  const [breakdownState, setBreakdownState] = useState<
    { holding: ShareHolding; product: ShareProduct } | null
  >(null);


  const purchaseMut = useMutation({
    mutationFn: (v: { product_id: string; savings_account_id: string; units: number; note: string | null }) =>
      purchase({ data: v }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["member", "investments"] });
      setTradeState(null);
    },
  });
  const sellMut = useMutation({
    mutationFn: (v: { product_id: string; savings_account_id: string; units: number; note: string | null }) =>
      sell({ data: v }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["member", "investments"] });
      setTradeState(null);
    },
  });
  const transferMut = useMutation({
    mutationFn: (v: { product_id: string; to_member_no: string; units: number; note: string | null }) =>
      transfer({ data: v }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["member", "investments"] });
      setTransferState(null);
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header>
        <h1 className="font-serif text-2xl text-emerald-deep dark:text-emerald-100">Investments & Shares</h1>
        <p className="mt-1 text-sm text-emerald-deep/60 dark:text-emerald-200/60">
          Buy cooperative share units and track dividends paid into your savings.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Units held" value={data.totals.units.toLocaleString()} tone="royal" />
        <SummaryCard label="Cost basis" value={money(data.totals.cost_basis)} tone="emerald" />
        <SummaryCard label="Market value" value={money(data.totals.market_value)} tone="gold" />
        <SummaryCard label="Dividends earned" value={money(data.totals.dividends)} tone="teal" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-emerald-deep/10 bg-white p-4 shadow-sm dark:border-emerald-100/10 dark:bg-emerald-950/40">
          <h2 className="font-serif text-base text-emerald-deep dark:text-emerald-100">Portfolio value (12 months)</h2>
          <TrendChart
            title="Portfolio value over time"
            data={series}
            xKey="month"
            height={260}
            series={[
              { key: "portfolio_value", label: "Market value", format: (v) => money(v) },
            ]}
          />
        </div>
        <div className="rounded-2xl border border-emerald-deep/10 bg-white p-4 shadow-sm dark:border-emerald-100/10 dark:bg-emerald-950/40">
          <h2 className="font-serif text-base text-emerald-deep dark:text-emerald-100">Contributions, returns & dividends</h2>
          <TrendChart
            title="Contributions, returns and cumulative dividends"
            data={series}
            xKey="month"
            height={260}
            series={[
              { key: "contributions", label: "Net contributions", format: (v) => money(v) },
              { key: "returns", label: "Dividends this month", format: (v) => money(v) },
              { key: "dividends_cum", label: "Cumulative dividends", format: (v) => money(v) },
            ]}
          />
        </div>
      </section>


      <section className="rounded-2xl border border-emerald-deep/10 bg-white p-6 shadow-sm dark:border-emerald-100/10 dark:bg-emerald-950/40">
        <h2 className="font-serif text-lg text-emerald-deep dark:text-emerald-100">Your holdings</h2>
        {data.holdings.length === 0 ? (
          <p className="mt-3 text-sm text-emerald-deep/60 dark:text-emerald-200/60">
            You don't hold any shares yet. Buy from a product below to get started.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-widest text-emerald-deep/60 dark:text-emerald-200/60">
                <tr>
                  <th className="py-2">Product</th>
                  <th>Units</th>
                  <th>Cost basis</th>
                  <th>Market value</th>
                  <th>Dividends</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.holdings.map((h) => {
                  const product = data.products.find((p) => p.id === h.product_id);
                  return (
                    <tr key={h.id} className="border-t border-emerald-deep/5 dark:border-emerald-100/10">
                      <td className="py-2">
                        <div className="font-medium text-emerald-deep dark:text-emerald-100">{h.product_name}</div>
                        <div className="text-xs text-emerald-deep/50">{h.product_code}</div>
                      </td>
                      <td>{h.units.toLocaleString()}</td>
                      <td>{money(h.cost_basis)}</td>
                      <td>{money(h.market_value)}</td>
                      <td>{money(h.total_dividends)}</td>
                      <td className="text-right">
                        {product && (
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setBreakdownState({ holding: h, product })}
                              className="rounded border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-gold hover:bg-gold/20 dark:bg-gold/20 dark:text-cream"
                            >
                              Details
                            </button>

                            <button
                              onClick={() => setTransferState({ holding: h, product })}
                              className="rounded bg-royal/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-royal hover:bg-royal/20 dark:bg-royal/20 dark:text-cream"
                            >
                              Transfer
                            </button>
                            <button
                              onClick={() => setTradeState({ mode: "sell", holding: h, product })}
                              className="rounded bg-emerald-deep/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-emerald-deep hover:bg-emerald-deep/20 dark:bg-emerald-100/10 dark:text-emerald-100"
                            >
                              Sell
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-serif text-lg text-emerald-deep dark:text-emerald-100">Available products</h2>
        {data.products.length === 0 ? (
          <p className="text-sm text-emerald-deep/60 dark:text-emerald-200/60">No active share products yet.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.products.map((p) => (
              <article
                key={p.id}
                className="rounded-2xl border border-emerald-deep/10 bg-white p-5 shadow-sm dark:border-emerald-100/10 dark:bg-emerald-950/40"
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="font-serif text-base text-emerald-deep dark:text-emerald-100">{p.name}</h3>
                  <span className="rounded bg-emerald-deep/10 px-2 py-0.5 text-xs font-mono text-emerald-deep dark:bg-emerald-100/10 dark:text-emerald-100">
                    {p.code}
                  </span>
                </div>
                {p.description && (
                  <p className="mt-2 text-xs text-emerald-deep/60 dark:text-emerald-200/60">{p.description}</p>
                )}
                <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-emerald-deep/60 dark:text-emerald-200/60">Unit price</dt>
                  <dd className="text-right font-semibold text-emerald-deep dark:text-emerald-100">
                    {money(p.unit_price, p.currency)}
                  </dd>
                  <dt className="text-emerald-deep/60 dark:text-emerald-200/60">Dividend rate</dt>
                  <dd className="text-right">{(p.dividend_rate_annual * 100).toFixed(2)}% / yr</dd>
                  <dt className="text-emerald-deep/60 dark:text-emerald-200/60">Min units</dt>
                  <dd className="text-right">{p.min_units}</dd>
                </dl>
                <button
                  disabled={data.savings_accounts.length === 0}
                  onClick={() => setTradeState({ mode: "buy", product: p })}
                  className="mt-4 w-full rounded-md bg-emerald-deep px-4 py-2 text-sm font-semibold uppercase tracking-widest text-cream shadow-sm hover:bg-emerald-mid disabled:opacity-50"
                >
                  {data.savings_accounts.length === 0 ? "Open a savings account first" : "Buy shares"}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-emerald-deep/10 bg-white p-6 shadow-sm dark:border-emerald-100/10 dark:bg-emerald-950/40">
        <h2 className="font-serif text-lg text-emerald-deep dark:text-emerald-100">Recent activity</h2>
        {data.recent.length === 0 ? (
          <p className="mt-3 text-sm text-emerald-deep/60 dark:text-emerald-200/60">No share transactions yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-widest text-emerald-deep/60 dark:text-emerald-200/60">
                <tr>
                  <th className="py-2">Ref</th>
                  <th>Date</th>
                  <th>Kind</th>
                  <th>Product</th>
                  <th>Units</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((t) => (
                  <tr key={t.id} className="border-t border-emerald-deep/5 dark:border-emerald-100/10">
                    <td className="py-2 font-mono text-xs">{t.ref}</td>
                    <td>{new Date(t.created_at).toLocaleDateString()}</td>
                    <td className="capitalize">{t.kind}</td>
                    <td>{t.product_name}</td>
                    <td>{t.units.toLocaleString()}</td>
                    <td className="text-right font-semibold">
                      {t.kind === "purchase" ? "-" : "+"}
                      {money(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {tradeState && (
        <TradeDialog
          state={tradeState}
          accounts={data.savings_accounts}
          onCancel={() => setTradeState(null)}
          submitting={purchaseMut.isPending || sellMut.isPending}
          error={(purchaseMut.error as Error | null)?.message ?? (sellMut.error as Error | null)?.message ?? null}
          onSubmit={(v) => {
            if (tradeState.mode === "buy") {
              purchaseMut.mutate({ product_id: tradeState.product.id, ...v });
            } else {
              sellMut.mutate({ product_id: tradeState.product.id, ...v });
            }
          }}
        />
      )}

      {transferState && (
        <TransferDialog
          state={transferState}
          onCancel={() => setTransferState(null)}
          submitting={transferMut.isPending}
          error={(transferMut.error as Error | null)?.message ?? null}
          result={transferMut.data ?? null}
          onSubmit={(v) =>
            transferMut.mutate({ product_id: transferState.product.id, ...v })
          }
        />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "royal" | "emerald" | "gold" | "teal";
}) {
  const toneClass: Record<typeof tone, string> = {
    royal: "from-royal to-royal/70",
    emerald: "from-emerald-deep to-emerald-mid",
    gold: "from-gold to-gold/70",
    teal: "from-teal-600 to-teal-500",
  };
  return (
    <div className={`rounded-2xl bg-gradient-to-br p-5 text-cream shadow-md ${toneClass[tone]}`}>
      <p className="text-[10px] uppercase tracking-widest opacity-80">{label}</p>
      <p className="mt-2 font-serif text-2xl">{value}</p>
    </div>
  );
}

function TradeDialog({
  state,
  accounts,
  onCancel,
  onSubmit,
  submitting,
  error,
}: {
  state:
    | { mode: "buy"; product: ShareProduct }
    | { mode: "sell"; holding: ShareHolding; product: ShareProduct };
  accounts: Array<{ id: string; nickname: string | null; balance: number; plan_name: string }>;
  onCancel: () => void;
  onSubmit: (v: { savings_account_id: string; units: number; note: string | null }) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [units, setUnits] = useState(state.mode === "buy" ? state.product.min_units : 1);
  const [note, setNote] = useState("");
  const [step, setStep] = useState<"edit" | "review">("edit");
  const price = state.product.unit_price;
  const maxUnits = state.mode === "sell" ? state.holding.units : undefined;

  const quote = useMemo(() => {
    const gross = Math.max(0, price * units);
    // Simple fee schedule: buys 1.0%, sells 0.5%, capped at 50 of product currency.
    const feeRate = state.mode === "buy" ? 0.01 : 0.005;
    const fee = Math.min(50, Number((gross * feeRate).toFixed(2)));
    const net = state.mode === "buy" ? gross + fee : gross - fee;
    return { gross, fee, feeRate, net };
  }, [price, units, state.mode]);

  const account = accounts.find((a) => a.id === accountId);
  const insufficient = state.mode === "buy" && account ? account.balance < quote.net : false;
  const canReview = accountId && units >= 1 && (maxUnits == null || units <= maxUnits);
  const ccy = state.product.currency;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-emerald-950">
        <h3 className="font-serif text-lg text-emerald-deep dark:text-emerald-100">
          {state.mode === "buy" ? "Buy" : "Sell"} — {state.product.name}
        </h3>
        <p className="mt-1 text-xs uppercase tracking-widest text-emerald-deep/50 dark:text-emerald-200/50">
          Step {step === "edit" ? "1 of 2 · Details" : "2 of 2 · Review & confirm"}
        </p>

        {step === "edit" ? (
          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="text-emerald-deep/70 dark:text-emerald-200/70">Savings account</span>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="mt-1 w-full rounded-md border border-emerald-deep/20 bg-transparent px-3 py-2"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nickname ?? a.plan_name} — {money(a.balance)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-emerald-deep/70 dark:text-emerald-200/70">
                Units {maxUnits != null && `(max ${maxUnits})`}
              </span>
              <input
                type="number"
                min={state.mode === "buy" ? state.product.min_units : 1}
                max={maxUnits}
                value={units}
                onChange={(e) => setUnits(Math.max(1, Number(e.target.value) || 0))}
                className="mt-1 w-full rounded-md border border-emerald-deep/20 bg-transparent px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-emerald-deep/70 dark:text-emerald-200/70">Note (optional)</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 w-full rounded-md border border-emerald-deep/20 bg-transparent px-3 py-2"
              />
            </label>
            <div className="rounded-md bg-emerald-deep/5 p-3 text-sm dark:bg-emerald-100/5">
              <div className="flex justify-between">
                <span>Unit price</span>
                <span className="font-semibold">{money(price, ccy)}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span>Estimated gross</span>
                <span className="font-semibold">{money(quote.gross, ccy)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3 text-sm">
            <div className="rounded-md border border-emerald-deep/10 p-3 dark:border-emerald-100/10">
              <div className="flex justify-between">
                <span className="text-emerald-deep/70 dark:text-emerald-200/70">Action</span>
                <span className="font-semibold">
                  {state.mode === "buy" ? "Purchase" : "Sale"} · {units.toLocaleString()} units
                </span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-emerald-deep/70 dark:text-emerald-200/70">Unit price</span>
                <span className="font-semibold">{money(price, ccy)}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-emerald-deep/70 dark:text-emerald-200/70">Savings account</span>
                <span className="font-semibold">
                  {account?.nickname ?? account?.plan_name ?? "—"}
                </span>
              </div>
            </div>
            <div className="rounded-md bg-emerald-deep/5 p-3 dark:bg-emerald-100/5">
              <div className="flex justify-between">
                <span>Gross amount</span>
                <span className="font-semibold">{money(quote.gross, ccy)}</span>
              </div>
              <div className="mt-1 flex justify-between text-emerald-deep/80 dark:text-emerald-200/80">
                <span>Transaction fee ({(quote.feeRate * 100).toFixed(2)}%)</span>
                <span>
                  {state.mode === "buy" ? "+" : "−"} {money(quote.fee, ccy)}
                </span>
              </div>
              <div className="mt-2 flex justify-between border-t border-emerald-deep/10 pt-2 dark:border-emerald-100/10">
                <span className="font-semibold">
                  {state.mode === "buy" ? "Total to debit" : "Net to credit"}
                </span>
                <span className="font-serif text-base">{money(quote.net, ccy)}</span>
              </div>
            </div>
            {note && (
              <p className="rounded-md bg-emerald-deep/5 p-3 text-xs italic dark:bg-emerald-100/5">
                Note: {note}
              </p>
            )}
            {insufficient && (
              <p className="text-sm text-amber-600">
                Selected savings account balance is below the total to debit.
              </p>
            )}
            <p className="text-xs text-emerald-deep/60 dark:text-emerald-200/60">
              Fees are estimates and applied by the system at settlement. Final posted amount may
              vary slightly if the unit price changes before confirmation.
            </p>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={step === "review" ? () => setStep("edit") : onCancel}
            disabled={submitting}
            className="rounded-md border border-emerald-deep/20 px-4 py-2 text-sm font-semibold uppercase tracking-widest text-emerald-deep dark:text-emerald-100 disabled:opacity-50"
          >
            {step === "review" ? "Back" : "Cancel"}
          </button>
          {step === "edit" ? (
            <button
              disabled={!canReview}
              onClick={() => setStep("review")}
              className="rounded-md bg-emerald-deep px-4 py-2 text-sm font-semibold uppercase tracking-widest text-cream disabled:opacity-50"
            >
              Review
            </button>
          ) : (
            <button
              disabled={submitting || insufficient}
              onClick={() =>
                onSubmit({ savings_account_id: accountId, units, note: note.trim() ? note.trim() : null })
              }
              className="rounded-md bg-emerald-deep px-4 py-2 text-sm font-semibold uppercase tracking-widest text-cream disabled:opacity-50"
            >
              {submitting ? "Working…" : state.mode === "buy" ? "Confirm purchase" : "Confirm sale"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TransferDialog({
  state,
  onCancel,
  onSubmit,
  submitting,
  error,
  result,
}: {
  state: { holding: ShareHolding; product: ShareProduct };
  onCancel: () => void;
  onSubmit: (v: { to_member_no: string; units: number; note: string | null }) => void;
  submitting: boolean;
  error: string | null;
  result: { to_full_name: string | null; to_user_id: string } | null;
}) {
  const [memberNo, setMemberNo] = useState("");
  const [units, setUnits] = useState(1);
  const [note, setNote] = useState("");
  const [step, setStep] = useState<"edit" | "review">("edit");
  const maxUnits = state.holding.units;
  const price = state.product.unit_price;
  const ccy = state.product.currency;
  const value = Math.max(0, price * units);
  const canReview = memberNo.trim().length > 0 && units >= 1 && units <= maxUnits;

  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-emerald-950">
          <h3 className="font-serif text-lg text-emerald-deep dark:text-emerald-100">
            Transfer complete
          </h3>
          <p className="mt-3 text-sm">
            {units.toLocaleString()} units of{" "}
            <span className="font-semibold">{state.product.name}</span> transferred to{" "}
            <span className="font-semibold">{result.to_full_name ?? "member"}</span>.
          </p>
          <div className="mt-5 flex justify-end">
            <button
              onClick={onCancel}
              className="rounded-md bg-emerald-deep px-4 py-2 text-sm font-semibold uppercase tracking-widest text-cream"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-emerald-950">
        <h3 className="font-serif text-lg text-emerald-deep dark:text-emerald-100">
          Transfer — {state.product.name}
        </h3>
        <p className="mt-1 text-xs uppercase tracking-widest text-emerald-deep/50 dark:text-emerald-200/50">
          Step {step === "edit" ? "1 of 2 · Recipient & units" : "2 of 2 · Review & confirm"}
        </p>

        {step === "edit" ? (
          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="text-emerald-deep/70 dark:text-emerald-200/70">
                Recipient member number
              </span>
              <input
                value={memberNo}
                onChange={(e) => setMemberNo(e.target.value)}
                placeholder="e.g. M-000123"
                className="mt-1 w-full rounded-md border border-emerald-deep/20 bg-transparent px-3 py-2 font-mono"
              />
            </label>
            <label className="block text-sm">
              <span className="text-emerald-deep/70 dark:text-emerald-200/70">
                Units (max {maxUnits.toLocaleString()})
              </span>
              <input
                type="number"
                min={1}
                max={maxUnits}
                value={units}
                onChange={(e) =>
                  setUnits(Math.min(maxUnits, Math.max(1, Number(e.target.value) || 0)))
                }
                className="mt-1 w-full rounded-md border border-emerald-deep/20 bg-transparent px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-emerald-deep/70 dark:text-emerald-200/70">Note (optional)</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 w-full rounded-md border border-emerald-deep/20 bg-transparent px-3 py-2"
              />
            </label>
            <div className="rounded-md bg-emerald-deep/5 p-3 text-sm dark:bg-emerald-100/5">
              <div className="flex justify-between">
                <span>Unit price</span>
                <span className="font-semibold">
                  {new Intl.NumberFormat("en-GH", { style: "currency", currency: ccy }).format(price)}
                </span>
              </div>
              <div className="mt-1 flex justify-between">
                <span>Reference value</span>
                <span className="font-semibold">
                  {new Intl.NumberFormat("en-GH", { style: "currency", currency: ccy }).format(value)}
                </span>
              </div>
              <p className="mt-2 text-xs text-emerald-deep/60 dark:text-emerald-200/60">
                No cash moves between savings accounts. A proportional share of your cost basis moves
                with the units.
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3 text-sm">
            <div className="rounded-md border border-emerald-deep/10 p-3 dark:border-emerald-100/10">
              <div className="flex justify-between">
                <span className="text-emerald-deep/70 dark:text-emerald-200/70">Recipient</span>
                <span className="font-mono font-semibold">{memberNo.trim()}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-emerald-deep/70 dark:text-emerald-200/70">Units</span>
                <span className="font-semibold">{units.toLocaleString()}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-emerald-deep/70 dark:text-emerald-200/70">
                  Reference value
                </span>
                <span className="font-semibold">
                  {new Intl.NumberFormat("en-GH", { style: "currency", currency: ccy }).format(value)}
                </span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-emerald-deep/70 dark:text-emerald-200/70">
                  Your remaining units
                </span>
                <span className="font-semibold">{(maxUnits - units).toLocaleString()}</span>
              </div>
            </div>
            {note && (
              <p className="rounded-md bg-emerald-deep/5 p-3 text-xs italic dark:bg-emerald-100/5">
                Note: {note}
              </p>
            )}
            <p className="text-xs text-emerald-deep/60 dark:text-emerald-200/60">
              This transfer is final. Please confirm the recipient's member number matches the
              person you intend to send units to.
            </p>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={step === "review" ? () => setStep("edit") : onCancel}
            disabled={submitting}
            className="rounded-md border border-emerald-deep/20 px-4 py-2 text-sm font-semibold uppercase tracking-widest text-emerald-deep dark:text-emerald-100 disabled:opacity-50"
          >
            {step === "review" ? "Back" : "Cancel"}
          </button>
          {step === "edit" ? (
            <button
              disabled={!canReview}
              onClick={() => setStep("review")}
              className="rounded-md bg-royal px-4 py-2 text-sm font-semibold uppercase tracking-widest text-cream disabled:opacity-50"
            >
              Review
            </button>
          ) : (
            <button
              disabled={submitting}
              onClick={() =>
                onSubmit({
                  to_member_no: memberNo.trim(),
                  units,
                  note: note.trim() ? note.trim() : null,
                })
              }
              className="rounded-md bg-royal px-4 py-2 text-sm font-semibold uppercase tracking-widest text-cream disabled:opacity-50"
            >
              {submitting ? "Transferring…" : "Confirm transfer"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
