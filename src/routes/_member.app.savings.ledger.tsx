import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowDownLeft, ArrowUpRight, Download, Wallet } from "lucide-react";
import {
  EmptyState,
  ErrorState,
  Money,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
  StatusPill,
} from "@/components/primitives";
import { Pagination, SortHeader, type SortState } from "@/components/table-controls";
import { exportCsv } from "@/lib/exports";
import { formatMoney } from "@/lib/org-config";
import { listSavingsLedger, type LedgerEntry, type LedgerResult } from "@/lib/savings.functions";

const KINDS = [
  "deposit",
  "withdrawal",
  "interest",
  "transfer_in",
  "transfer_out",
  "fee",
  "adjustment",
] as const;

const SearchSchema = z.object({
  account: z.string().uuid().optional(),
  kind: z.enum(KINDS).optional(),
  status: z.enum(["pending", "cleared", "failed"]).optional(),
  direction: z.enum(["credit", "debit"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().max(120).optional(),
  sortBy: z.enum(["created_at", "amount"]).catch("created_at").default("created_at"),
  sortDir: z.enum(["asc", "desc"]).catch("desc").default("desc"),
  page: z.number().int().min(1).catch(1).default(1),
  pageSize: z.number().int().min(10).max(100).catch(25).default(25),
});

type Search = z.infer<typeof SearchSchema>;

function ledgerQuery(s: Search) {
  return queryOptions({
    queryKey: ["member", "savings", "ledger", s],
    queryFn: () =>
      listSavingsLedger({
        data: {
          account_id: s.account ?? null,
          kind: s.kind ?? null,
          status: s.status ?? null,
          direction: s.direction ?? null,
          from: s.from ?? null,
          to: s.to ?? null,
          search: s.q ?? null,
          sort_by: s.sortBy,
          sort_dir: s.sortDir,
          page: s.page,
          page_size: s.pageSize,
        },
      }) as Promise<LedgerResult>,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export const Route = createFileRoute("/_member/app/savings/ledger")({
  validateSearch: SearchSchema,
  head: () => ({
    meta: [
      { title: "Savings ledger — IT-360 CashApp" },
      {
        name: "description",
        content:
          "Full savings ledger of deposits, withdrawals and interest with dates, references and running balance.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LedgerPage,
  errorComponent: ({ error }) => (
    <div className="p-6">
      <ErrorState title="Ledger unavailable" message={(error as Error).message} />
    </div>
  ),
});

function LedgerPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data, isPending, isError, error, refetch, isFetching } = useQuery(ledgerQuery(search));

  const setSearch = (patch: Partial<Search>, resetPage = true) =>
    navigate({
      search: (prev: Search) => ({ ...prev, ...patch, ...(resetPage ? { page: 1 } : {}) }),
      replace: true,
    });

  const sort: SortState = { sortBy: search.sortBy, sortDir: search.sortDir };

  return (
    <>
      <PageHeader
        eyebrow="Member portal"
        title="Savings ledger"
        description="Every deposit, withdrawal and interest posting on your savings accounts, with references, dates and a running balance."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/app/savings/deposit"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <Wallet className="h-4 w-4" aria-hidden="true" /> Top up
            </Link>
            <button
              type="button"
              disabled={!data || data.rows.length === 0}
              onClick={() =>
                data &&
                exportCsv<LedgerEntry>({
                  title: "Savings ledger",
                  subtitle: `Page ${data.page} · ${data.total} entries`,
                  filename: "savings-ledger",
                  rows: data.rows,
                  columns: [
                    { header: "Date", accessor: (r) => new Date(r.created_at).toLocaleString() },
                    { header: "Reference", accessor: (r) => r.ref },
                    { header: "Account", accessor: (r) => r.account_label },
                    { header: "Type", accessor: (r) => r.kind },
                    { header: "Channel", accessor: (r) => r.channel ?? "" },
                    { header: "Note", accessor: (r) => r.note ?? "" },
                    { header: "Amount", accessor: (r) => r.signed_amount, align: "right" },
                    { header: "Status", accessor: (r) => r.status },
                    {
                      header: "Running balance",
                      accessor: (r) => (r.running_balance == null ? "" : r.running_balance),
                      align: "right",
                    },
                  ],
                })
              }
              className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-40"
            >
              <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
            </button>
          </div>
        }
      />

      {isError ? (
        <div className="mt-6">
          <ErrorState
            title="Could not load ledger"
            message={error.message}
            onRetry={() => void refetch()}
          />
        </div>
      ) : isPending || !data ? (
        <div className="mt-6">
          <SectionCardSkeleton />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <SummaryStrip data={data} />

          <SectionCard
            title="Ledger entries"
            accent="teal"
            action={
              <span className="text-[11px] text-muted-foreground">
                {isFetching ? "Refreshing…" : `${data.total} entr${data.total === 1 ? "y" : "ies"}`}
              </span>
            }
          >
            <Filters data={data} search={search} setSearch={setSearch} />

            {data.rows.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No ledger entries match these filters"
                  hint="Clear the filters, or make a deposit to start your savings history."
                />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">
                      Savings ledger entries with date, reference, type, amount, status and running
                      balance
                    </caption>
                    <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-widest text-muted-foreground">
                      <tr>
                        <SortHeader
                          label="Date"
                          field="created_at"
                          sort={sort}
                          onSort={(n) =>
                            setSearch({ sortBy: n.sortBy as Search["sortBy"], sortDir: n.sortDir })
                          }
                        />
                        <th className="px-6 py-3 text-left font-medium">Reference</th>
                        <th className="px-6 py-3 text-left font-medium">Account</th>
                        <th className="px-6 py-3 text-left font-medium">Type</th>
                        <SortHeader
                          label="Amount"
                          field="amount"
                          align="right"
                          sort={sort}
                          onSort={(n) =>
                            setSearch({ sortBy: n.sortBy as Search["sortBy"], sortDir: n.sortDir })
                          }
                        />
                        <th className="px-6 py-3 text-left font-medium">Status</th>
                        <th className="px-6 py-3 text-right font-medium">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.rows.map((r) => (
                        <tr key={r.id} className="hover:bg-muted/30">
                          <td className="whitespace-nowrap px-6 py-3 text-muted-foreground">
                            {new Date(r.created_at).toLocaleString()}
                          </td>
                          <td className="px-6 py-3 font-mono text-xs">{r.ref}</td>
                          <td className="px-6 py-3">
                            {r.account_id ? (
                              <Link
                                to="/app/savings/$accountId"
                                params={{ accountId: r.account_id }}
                                className="underline-offset-2 hover:underline"
                              >
                                {r.account_label}
                              </Link>
                            ) : (
                              r.account_label
                            )}
                          </td>
                          <td className="px-6 py-3">
                            <span className="inline-flex items-center gap-1.5 capitalize">
                              {r.direction === "credit" ? (
                                <ArrowDownLeft
                                  className="h-3.5 w-3.5 text-emerald-600"
                                  aria-hidden="true"
                                />
                              ) : (
                                <ArrowUpRight
                                  className="h-3.5 w-3.5 text-rose-500"
                                  aria-hidden="true"
                                />
                              )}
                              {r.kind.replace(/_/g, " ")}
                            </span>
                            {r.note ? (
                              <span className="block text-[11px] text-muted-foreground">
                                {r.note}
                              </span>
                            ) : null}
                          </td>
                          <td
                            className={
                              "px-6 py-3 text-right font-semibold " +
                              (r.direction === "credit" ? "text-emerald-600" : "text-rose-500")
                            }
                          >
                            <Money amount={r.signed_amount} signed />
                          </td>
                          <td className="px-6 py-3">
                            <StatusPill status={r.status} />
                          </td>
                          <td className="px-6 py-3 text-right tabular text-muted-foreground">
                            {r.running_balance == null ? "—" : formatMoney(r.running_balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={data.page}
                  pageSize={data.page_size}
                  total={data.total}
                  onPage={(n) =>
                    navigate({ search: (p: Search) => ({ ...p, page: n }), replace: true })
                  }
                  onPageSize={(n) => setSearch({ pageSize: n })}
                />
              </>
            )}
          </SectionCard>
        </div>
      )}
    </>
  );
}

function SummaryStrip({ data }: { data: LedgerResult }) {
  const cards = [
    { label: "Current balance", value: formatMoney(data.closing_balance), tone: "text-foreground" },
    {
      label: "Deposits in view",
      value: formatMoney(data.totals.deposits),
      tone: "text-emerald-600",
    },
    {
      label: "Withdrawals in view",
      value: formatMoney(data.totals.withdrawals),
      tone: "text-rose-500",
    },
    { label: "Net movement", value: formatMoney(data.totals.net), tone: "text-foreground" },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {c.label}
          </p>
          <p className={`mt-2 font-display text-xl font-bold tabular ${c.tone}`}>{c.value}</p>
        </div>
      ))}
      {data.totals.pending_count > 0 ? (
        <p className="sm:col-span-2 xl:col-span-4 text-xs text-muted-foreground">
          {data.totals.pending_count} pending entr{data.totals.pending_count === 1 ? "y" : "ies"}{" "}
          are shown but not yet included in the running balance.
        </p>
      ) : null}
    </div>
  );
}

function Filters({
  data,
  search,
  setSearch,
}: {
  data: LedgerResult;
  search: Search;
  setSearch: (patch: Partial<Search>) => void;
}) {
  const field =
    "rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary";
  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-border/60 px-6 py-4">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Account</span>
        <select
          className={field}
          value={search.account ?? ""}
          onChange={(e) => setSearch({ account: e.target.value || undefined })}
        >
          <option value="">All accounts</option>
          {data.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Type</span>
        <select
          className={field}
          value={search.kind ?? ""}
          onChange={(e) => setSearch({ kind: (e.target.value || undefined) as Search["kind"] })}
        >
          <option value="">All types</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Direction
        </span>
        <select
          className={field}
          value={search.direction ?? ""}
          onChange={(e) =>
            setSearch({ direction: (e.target.value || undefined) as Search["direction"] })
          }
        >
          <option value="">Money in & out</option>
          <option value="credit">Money in</option>
          <option value="debit">Money out</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Status</span>
        <select
          className={field}
          value={search.status ?? ""}
          onChange={(e) => setSearch({ status: (e.target.value || undefined) as Search["status"] })}
        >
          <option value="">Any status</option>
          <option value="cleared">Cleared</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">From</span>
        <input
          type="date"
          className={field}
          value={search.from ?? ""}
          onChange={(e) => setSearch({ from: e.target.value || undefined })}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">To</span>
        <input
          type="date"
          className={field}
          value={search.to ?? ""}
          onChange={(e) => setSearch({ to: e.target.value || undefined })}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Search</span>
        <input
          type="search"
          placeholder="Reference, note or channel"
          className={`${field} w-52`}
          defaultValue={search.q ?? ""}
          onKeyDown={(e) => {
            if (e.key === "Enter")
              setSearch({ q: (e.target as HTMLInputElement).value || undefined });
          }}
          onBlur={(e) => setSearch({ q: e.target.value || undefined })}
        />
      </label>
      <button
        type="button"
        onClick={() =>
          setSearch({
            account: undefined,
            kind: undefined,
            status: undefined,
            direction: undefined,
            from: undefined,
            to: undefined,
            q: undefined,
          })
        }
        className="rounded-md border border-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-muted"
      >
        Reset
      </button>
    </div>
  );
}
