import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getAdminInvestments,
  getAdminInvestmentSeries,
  upsertShareProduct,
  createDividendRun,
  executeDividendRun,
  cancelDividendRun,
  previewDividendRun,
  submitDividendRunForApproval,
  approveDividendRun,
  rejectDividendRun,
  getDividendRunExport,
  type AdminInvestmentsOverview,
  type DividendRun,
  type DividendRunPreview,
  type ShareProduct,
  type InvestmentSeriesPoint,
} from "@/lib/shares.functions";
import { TrendChart } from "@/components/charts";

const overviewQO = queryOptions<AdminInvestmentsOverview>({
  queryKey: ["admin", "investments"],
  queryFn: () => getAdminInvestments(),
});

const adminSeriesQO = queryOptions<InvestmentSeriesPoint[]>({
  queryKey: ["admin", "investments", "series"],
  queryFn: () => getAdminInvestmentSeries(),
});

export const Route = createFileRoute("/_admin/admin/investments")({
  head: () => ({
    meta: [{ title: "Investments & Shares — Admin — IT-360 CashApp" }, { name: "robots", content: "noindex" }],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(overviewQO);
    context.queryClient.ensureQueryData(adminSeriesQO);
  },
  component: AdminInvestments,
});

const money = (n: number, ccy = "GHS") =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: ccy }).format(n);

function AdminInvestments() {
  const { data } = useSuspenseQuery(overviewQO);
  const { data: series } = useSuspenseQuery(adminSeriesQO);
  const qc = useQueryClient();
  const upsert = useServerFn(upsertShareProduct);
  const createRun = useServerFn(createDividendRun);
  const executeRun = useServerFn(executeDividendRun);
  const cancelRun = useServerFn(cancelDividendRun);
  const submitRun = useServerFn(submitDividendRunForApproval);
  const approveRun = useServerFn(approveDividendRun);
  const rejectRun = useServerFn(rejectDividendRun);

  const [editing, setEditing] = useState<ShareProduct | null>(null);
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [showNewRun, setShowNewRun] = useState(false);
  const [reviewing, setReviewing] = useState<{ run: DividendRun; mode: "approve" | "reject" } | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "investments"] });

  const upsertMut = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (v: any) => upsert({ data: v }),
    onSuccess: async () => {
      await invalidate();
      setEditing(null);
      setShowNewProduct(false);
    },
  });
  const createRunMut = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (v: any) => createRun({ data: v }),
    onSuccess: async () => {
      await invalidate();
      setShowNewRun(false);
    },
  });
  const executeRunMut = useMutation({
    mutationFn: (run_id: string) => executeRun({ data: { run_id } }),
    onSuccess: invalidate,
  });
  const cancelRunMut = useMutation({
    mutationFn: (run_id: string) => cancelRun({ data: { run_id } }),
    onSuccess: invalidate,
  });
  const submitRunMut = useMutation({
    mutationFn: (run_id: string) => submitRun({ data: { run_id } }),
    onSuccess: invalidate,
  });
  const reviewMut = useMutation({
    mutationFn: async (v: { run_id: string; mode: "approve" | "reject"; text: string }) => {
      if (v.mode === "approve") return approveRun({ data: { run_id: v.run_id, note: v.text || null } });
      return rejectRun({ data: { run_id: v.run_id, reason: v.text } });
    },
    onSuccess: async () => {
      await invalidate();
      setReviewing(null);
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl text-emerald-deep dark:text-emerald-100">Investments & Shares</h1>
          <p className="mt-1 text-sm text-emerald-deep/60 dark:text-emerald-200/60">
            Manage share products, holdings, and dividend runs.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowNewProduct(true)}
            className="rounded-md bg-emerald-deep px-4 py-2 text-xs font-semibold uppercase tracking-widest text-cream hover:bg-emerald-mid"
          >
            + Product
          </button>
          <button
            onClick={() => setShowNewRun(true)}
            className="rounded-md bg-gold px-4 py-2 text-xs font-semibold uppercase tracking-widest text-emerald-deep hover:opacity-90"
          >
            + Dividend run
          </button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPI label="Active products" value={data.totals.active_products.toString()} />
        <KPI label="Total units held" value={data.totals.total_units.toLocaleString()} />
        <KPI label="Market value" value={money(data.totals.total_market_value)} />
        <KPI label="Dividends paid" value={money(data.totals.dividends_paid_ytd)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-emerald-deep/10 bg-white p-4 shadow-sm dark:border-emerald-100/10 dark:bg-emerald-950/40">
          <h2 className="font-serif text-base text-emerald-deep dark:text-emerald-100">Total portfolio value (12 months)</h2>
          <TrendChart
            title="Aggregate portfolio value over time"
            data={series}
            xKey="month"
            height={260}
            series={[{ key: "portfolio_value", label: "Market value", format: (v) => money(v) }]}
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
        <h2 className="font-serif text-lg text-emerald-deep dark:text-emerald-100">Share products</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-widest text-emerald-deep/60 dark:text-emerald-200/60">
              <tr>
                <th className="py-2">Code</th>
                <th>Name</th>
                <th>Unit price</th>
                <th>Div. rate</th>
                <th>Issued</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.products.map((p) => (
                <tr key={p.id} className="border-t border-emerald-deep/5 dark:border-emerald-100/10">
                  <td className="py-2 font-mono text-xs">{p.code}</td>
                  <td>{p.name}</td>
                  <td>{money(p.unit_price, p.currency)}</td>
                  <td>{(p.dividend_rate_annual * 100).toFixed(2)}%</td>
                  <td>{p.total_units_issued.toLocaleString()}</td>
                  <td>
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${p.is_active ? "bg-emerald-deep/10 text-emerald-deep dark:bg-emerald-100/10 dark:text-emerald-100" : "bg-gray-200 text-gray-700"}`}
                    >
                      {p.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => setEditing(p)}
                      className="rounded bg-emerald-deep/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-emerald-deep hover:bg-emerald-deep/20 dark:bg-emerald-100/10 dark:text-emerald-100"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {data.products.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-sm text-emerald-deep/50">
                    No products yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-deep/10 bg-white p-6 shadow-sm dark:border-emerald-100/10 dark:bg-emerald-950/40">
        <h2 className="font-serif text-lg text-emerald-deep dark:text-emerald-100">Dividend runs</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-widest text-emerald-deep/60 dark:text-emerald-200/60">
              <tr>
                <th className="py-2">Ref</th>
                <th>Product</th>
                <th>Period</th>
                <th>Per unit</th>
                <th>Members</th>
                <th>Total paid</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map((r) => (
                <tr key={r.id} className="border-t border-emerald-deep/5 dark:border-emerald-100/10">
                  <td className="py-2 font-mono text-xs">{r.ref}</td>
                  <td>{r.product_name}</td>
                  <td className="text-xs">
                    {r.period_start} → {r.period_end}
                  </td>
                  <td>{money(r.per_unit_amount)}</td>
                  <td>{r.members_paid}</td>
                  <td>{money(r.total_paid)}</td>
                  <td>
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        r.status === "executed"
                          ? "bg-emerald-deep/10 text-emerald-deep dark:bg-emerald-100/10 dark:text-emerald-100"
                          : r.status === "draft"
                            ? "bg-gold/20 text-emerald-deep"
                            : r.status === "pending_approval"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"
                              : r.status === "approved"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200"
                                : r.status === "rejected"
                                  ? "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200"
                                  : "bg-gray-200 text-gray-700"
                      }`}
                      title={
                        r.status === "rejected" && r.rejection_reason
                          ? `Rejected: ${r.rejection_reason}`
                          : r.status === "approved" && r.approval_note
                            ? `Approved: ${r.approval_note}`
                            : undefined
                      }
                    >
                      {r.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="text-right">
                    <RunActions
                      run={r}
                      viewer={data.viewer}
                      pending={
                        submitRunMut.isPending ||
                        executeRunMut.isPending ||
                        cancelRunMut.isPending ||
                        reviewMut.isPending
                      }
                      onSubmit={() => submitRunMut.mutate(r.id)}
                      onCancel={() => cancelRunMut.mutate(r.id)}
                      onExecute={() => executeRunMut.mutate(r.id)}
                      onReview={(mode) => setReviewing({ run: r, mode })}
                    />
                  </td>
                </tr>
              ))}
              {data.runs.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-sm text-emerald-deep/50">
                    No dividend runs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {(executeRunMut.error || submitRunMut.error || cancelRunMut.error) && (
          <p className="mt-3 text-sm text-red-600">
            {(
              (executeRunMut.error as Error | null) ??
              (submitRunMut.error as Error | null) ??
              (cancelRunMut.error as Error | null)
            )?.message}
          </p>
        )}
        <p className="mt-3 text-xs text-emerald-deep/60 dark:text-emerald-200/60">
          Dividend runs require dual control: after submission, an approver
          (super admin or compliance officer) other than the creator must
          approve the run before a finance officer can execute payouts, and
          the executor cannot be the same person who approved.
        </p>
      </section>

      <section className="rounded-2xl border border-emerald-deep/10 bg-white p-6 shadow-sm dark:border-emerald-100/10 dark:bg-emerald-950/40">
        <h2 className="font-serif text-lg text-emerald-deep dark:text-emerald-100">Top holders</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-widest text-emerald-deep/60 dark:text-emerald-200/60">
              <tr>
                <th className="py-2">Member</th>
                <th>Member no.</th>
                <th>Units</th>
                <th>Cost basis</th>
                <th>Market value</th>
              </tr>
            </thead>
            <tbody>
              {data.top_holders.map((h) => (
                <tr key={h.user_id} className="border-t border-emerald-deep/5 dark:border-emerald-100/10">
                  <td className="py-2">{h.full_name ?? "—"}</td>
                  <td className="font-mono text-xs">{h.member_no ?? "—"}</td>
                  <td>{h.units.toLocaleString()}</td>
                  <td>{money(h.cost_basis)}</td>
                  <td>{money(h.market_value)}</td>
                </tr>
              ))}
              {data.top_holders.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-emerald-deep/50">
                    No holdings yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {(editing || showNewProduct) && (
        <ProductDialog
          product={editing}
          onCancel={() => {
            setEditing(null);
            setShowNewProduct(false);
          }}
          onSubmit={(v) => upsertMut.mutate(v)}
          submitting={upsertMut.isPending}
          error={(upsertMut.error as Error | null)?.message ?? null}
        />
      )}
      {showNewRun && (
        <NewRunDialog
          products={data.products.filter((p) => p.is_active)}
          onCancel={() => setShowNewRun(false)}
          onSubmit={(v) => createRunMut.mutate(v)}
          submitting={createRunMut.isPending}
          error={(createRunMut.error as Error | null)?.message ?? null}
        />
      )}
      {reviewing && (
        <ReviewDialog
          run={reviewing.run}
          mode={reviewing.mode}
          onCancel={() => setReviewing(null)}
          onSubmit={(text) =>
            reviewMut.mutate({ run_id: reviewing.run.id, mode: reviewing.mode, text })
          }
          submitting={reviewMut.isPending}
          error={(reviewMut.error as Error | null)?.message ?? null}
        />
      )}
    </div>
  );
}

function RunActions({
  run,
  viewer,
  pending,
  onSubmit,
  onCancel,
  onExecute,
  onReview,
}: {
  run: DividendRun;
  viewer: AdminInvestmentsOverview["viewer"];
  pending: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  onExecute: () => void;
  onReview: (mode: "approve" | "reject") => void;
}) {
  const isCreator = run.created_by === viewer.user_id || run.submitted_by === viewer.user_id;
  const isApprover = run.approved_by === viewer.user_id;
  const btnPrimary =
    "rounded bg-emerald-deep px-3 py-1 text-xs font-semibold uppercase tracking-widest text-cream hover:bg-emerald-mid disabled:opacity-50";
  const btnGhost =
    "rounded border border-emerald-deep/20 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-emerald-deep dark:text-emerald-100 disabled:opacity-50";
  const btnDanger =
    "rounded bg-red-600 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white hover:bg-red-700 disabled:opacity-50";

  if (run.status === "draft" && viewer.can_execute) {
    return (
      <div className="inline-flex gap-1">
        <button disabled={pending} onClick={onSubmit} className={btnPrimary}>
          Submit for approval
        </button>
        <button disabled={pending} onClick={onCancel} className={btnGhost}>
          Cancel
        </button>
      </div>
    );
  }
  if (run.status === "pending_approval" && viewer.can_approve) {
    if (isCreator) {
      return (
        <span className="text-xs italic text-emerald-deep/60">Awaiting second reviewer</span>
      );
    }
    return (
      <div className="inline-flex gap-1">
        <button disabled={pending} onClick={() => onReview("approve")} className={btnPrimary}>
          Approve
        </button>
        <button disabled={pending} onClick={() => onReview("reject")} className={btnDanger}>
          Reject
        </button>
      </div>
    );
  }
  if (run.status === "approved" && viewer.can_execute) {
    if (isApprover) {
      return (
        <span className="text-xs italic text-emerald-deep/60">
          Awaiting a different officer
        </span>
      );
    }
    return (
      <button disabled={pending} onClick={onExecute} className={btnPrimary}>
        Execute payouts
      </button>
    );
  }
  return <span className="text-xs text-emerald-deep/40">—</span>;
}

function ReviewDialog({
  run,
  mode,
  onCancel,
  onSubmit,
  submitting,
  error,
}: {
  run: DividendRun;
  mode: "approve" | "reject";
  onCancel: () => void;
  onSubmit: (text: string) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [text, setText] = useState("");
  const isReject = mode === "reject";
  const canSubmit = isReject ? text.trim().length >= 3 : true;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-emerald-950">
        <h3 className="font-serif text-lg text-emerald-deep dark:text-emerald-100">
          {isReject ? "Reject" : "Approve"} dividend run {run.ref}
        </h3>
        <p className="mt-1 text-xs text-emerald-deep/60 dark:text-emerald-200/60">
          {run.product_name} · {run.period_start} → {run.period_end} · per unit{" "}
          {run.per_unit_amount}
        </p>
        <div className="mt-4 text-sm">
          <label className="block text-xs uppercase tracking-widest text-emerald-deep/60 dark:text-emerald-200/60">
            {isReject ? "Rejection reason (required)" : "Approval note (optional)"}
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={500}
            className="mt-1 w-full rounded-md border border-emerald-deep/20 bg-transparent px-3 py-2"
            placeholder={
              isReject
                ? "Explain why this run cannot proceed…"
                : "Optional context for the approval audit trail"
            }
          />
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded border border-emerald-deep/20 px-4 py-2 text-sm font-semibold uppercase tracking-widest text-emerald-deep dark:text-emerald-100"
          >
            Cancel
          </button>
          <button
            disabled={submitting || !canSubmit}
            onClick={() => onSubmit(text.trim())}
            className={`rounded px-4 py-2 text-sm font-semibold uppercase tracking-widest text-cream disabled:opacity-50 ${
              isReject ? "bg-red-600 hover:bg-red-700" : "bg-emerald-deep hover:bg-emerald-mid"
            }`}
          >
            {submitting ? "Submitting…" : isReject ? "Reject run" : "Approve run"}
          </button>
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-emerald-deep/10 bg-white p-5 shadow-sm dark:border-emerald-100/10 dark:bg-emerald-950/40">
      <p className="text-[10px] uppercase tracking-widest text-emerald-deep/60 dark:text-emerald-200/60">{label}</p>
      <p className="mt-2 font-serif text-2xl text-emerald-deep dark:text-emerald-100">{value}</p>
    </div>
  );
}

function ProductDialog({
  product,
  onCancel,
  onSubmit,
  submitting,
  error,
}: {
  product: ShareProduct | null;
  onCancel: () => void;
  onSubmit: (v: {
    id?: string;
    code: string;
    name: string;
    description: string | null;
    unit_price: number;
    currency: string;
    dividend_rate_annual: number;
    min_units: number;
    max_units_per_member: number | null;
    is_active: boolean;
  }) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState({
    code: product?.code ?? "",
    name: product?.name ?? "",
    description: product?.description ?? "",
    unit_price: product?.unit_price ?? 100,
    currency: product?.currency ?? "GHS",
    dividend_rate_annual: product?.dividend_rate_annual ?? 0.08,
    min_units: product?.min_units ?? 1,
    max_units_per_member: product?.max_units_per_member ?? null,
    is_active: product?.is_active ?? true,
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-emerald-950">
        <h3 className="font-serif text-lg text-emerald-deep dark:text-emerald-100">
          {product ? "Edit product" : "New share product"}
        </h3>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Field label="Code">
            <input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              className="w-full rounded-md border border-emerald-deep/20 bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Currency">
            <input
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              className="w-full rounded-md border border-emerald-deep/20 bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Name" span={2}>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-md border border-emerald-deep/20 bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Description" span={2}>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-md border border-emerald-deep/20 bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Unit price">
            <input
              type="number"
              step="0.01"
              value={form.unit_price}
              onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value) || 0 })}
              className="w-full rounded-md border border-emerald-deep/20 bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Dividend rate (0-1)">
            <input
              type="number"
              step="0.0001"
              value={form.dividend_rate_annual}
              onChange={(e) => setForm({ ...form, dividend_rate_annual: Number(e.target.value) || 0 })}
              className="w-full rounded-md border border-emerald-deep/20 bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Min units">
            <input
              type="number"
              value={form.min_units}
              onChange={(e) => setForm({ ...form, min_units: Number(e.target.value) || 1 })}
              className="w-full rounded-md border border-emerald-deep/20 bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Max per member (optional)">
            <input
              type="number"
              value={form.max_units_per_member ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  max_units_per_member: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              className="w-full rounded-md border border-emerald-deep/20 bg-transparent px-3 py-2"
            />
          </Field>
          <label className="col-span-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            <span>Active</span>
          </label>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-emerald-deep/20 px-4 py-2 text-sm font-semibold uppercase tracking-widest text-emerald-deep dark:text-emerald-100"
          >
            Cancel
          </button>
          <button
            disabled={submitting}
            onClick={() =>
              onSubmit({
                id: product?.id,
                code: form.code.trim(),
                name: form.name.trim(),
                description: form.description.trim() || null,
                unit_price: form.unit_price,
                currency: form.currency,
                dividend_rate_annual: form.dividend_rate_annual,
                min_units: form.min_units,
                max_units_per_member: form.max_units_per_member,
                is_active: form.is_active,
              })
            }
            className="rounded-md bg-emerald-deep px-4 py-2 text-sm font-semibold uppercase tracking-widest text-cream disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewRunDialog({
  products,
  onCancel,
  onSubmit,
  submitting,
  error,
}: {
  products: ShareProduct[];
  onCancel: () => void;
  onSubmit: (v: {
    product_id: string;
    period_start: string;
    period_end: string;
    per_unit_amount: number;
    note: string | null;
  }) => void;
  submitting: boolean;
  error: string | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const year = today.slice(0, 4);
  const [form, setForm] = useState({
    product_id: products[0]?.id ?? "",
    period_start: `${year}-01-01`,
    period_end: `${year}-12-31`,
    per_unit_amount: 5,
    note: "",
  });
  const preview = useServerFn(previewDividendRun);
  const [calc, setCalc] = useState<DividendRunPreview | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcErr, setCalcErr] = useState<string | null>(null);

  useEffect(() => {
    if (!form.product_id || form.per_unit_amount <= 0) {
      setCalc(null);
      return;
    }
    let cancelled = false;
    setCalcLoading(true);
    setCalcErr(null);
    const t = setTimeout(async () => {
      try {
        const r = await preview({
          data: { product_id: form.product_id, per_unit_amount: form.per_unit_amount },
        });
        if (!cancelled) setCalc(r);
      } catch (e) {
        if (!cancelled) setCalcErr((e as Error).message);
      } finally {
        if (!cancelled) setCalcLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [form.product_id, form.per_unit_amount, preview]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-emerald-950">
        <h3 className="font-serif text-lg text-emerald-deep dark:text-emerald-100">New dividend run</h3>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Field label="Product" span={2}>
            <select
              value={form.product_id}
              onChange={(e) => setForm({ ...form, product_id: e.target.value })}
              className="w-full rounded-md border border-emerald-deep/20 bg-transparent px-3 py-2"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Period start">
            <input
              type="date"
              value={form.period_start}
              onChange={(e) => setForm({ ...form, period_start: e.target.value })}
              className="w-full rounded-md border border-emerald-deep/20 bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Period end">
            <input
              type="date"
              value={form.period_end}
              onChange={(e) => setForm({ ...form, period_end: e.target.value })}
              className="w-full rounded-md border border-emerald-deep/20 bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Per-unit amount" span={2}>
            <input
              type="number"
              step="0.0001"
              value={form.per_unit_amount}
              onChange={(e) => setForm({ ...form, per_unit_amount: Number(e.target.value) || 0 })}
              className="w-full rounded-md border border-emerald-deep/20 bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Note (optional)" span={2}>
            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              className="w-full rounded-md border border-emerald-deep/20 bg-transparent px-3 py-2"
            />
          </Field>
        </div>
        <div className="mt-4 rounded-md bg-emerald-deep/5 p-3 text-sm dark:bg-emerald-100/5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-deep/60 dark:text-emerald-200/60">
            Payout preview
          </p>
          {calcErr ? (
            <p className="mt-1 text-red-600">{calcErr}</p>
          ) : calcLoading && !calc ? (
            <p className="mt-1 text-emerald-deep/60">Calculating…</p>
          ) : calc ? (
            <dl className="mt-1 grid grid-cols-2 gap-y-1">
              <dt className="text-emerald-deep/60 dark:text-emerald-200/60">Eligible members</dt>
              <dd className="text-right font-semibold">{calc.eligible_members}</dd>
              <dt className="text-emerald-deep/60 dark:text-emerald-200/60">Total units</dt>
              <dd className="text-right font-semibold">{calc.total_units.toLocaleString()}</dd>
              <dt className="text-emerald-deep/60 dark:text-emerald-200/60">Estimated total</dt>
              <dd className="text-right font-semibold">
                {new Intl.NumberFormat("en-GH", { style: "currency", currency: calc.currency }).format(
                  calc.estimated_total,
                )}
              </dd>
            </dl>
          ) : (
            <p className="mt-1 text-emerald-deep/60">Select a product and per-unit amount to preview.</p>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-emerald-deep/20 px-4 py-2 text-sm font-semibold uppercase tracking-widest text-emerald-deep dark:text-emerald-100"
          >
            Cancel
          </button>
          <button
            disabled={submitting || !form.product_id || form.per_unit_amount <= 0}
            onClick={() =>
              onSubmit({
                product_id: form.product_id,
                period_start: form.period_start,
                period_end: form.period_end,
                per_unit_amount: form.per_unit_amount,
                note: form.note.trim() || null,
              })
            }
            className="rounded-md bg-emerald-deep px-4 py-2 text-sm font-semibold uppercase tracking-widest text-cream disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create draft"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, span }: { label: string; children: React.ReactNode; span?: 1 | 2 }) {
  return (
    <label className={span === 2 ? "col-span-2 block" : "block"}>
      <span className="text-emerald-deep/70 dark:text-emerald-200/70">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
