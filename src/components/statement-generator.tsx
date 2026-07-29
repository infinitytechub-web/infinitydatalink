import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Money, SectionCard } from "@/components/primitives";
import { buildStatement, type CustomStatement } from "@/lib/savings-statements.functions";
import { listMyAccounts } from "@/lib/savings.functions";
import { exportCsv, exportPdf } from "@/lib/exports";
import { formatMoney } from "@/lib/org-config";

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function presetRange(key: string): { from: string; to: string } {
  const now = new Date();
  const today = iso(now);
  if (key === "this-month") {
    return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  }
  if (key === "last-month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: iso(start), to: iso(end) };
  }
  if (key === "quarter") {
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return { from: iso(start), to: today };
  }
  if (key === "ytd") {
    return { from: iso(new Date(now.getFullYear(), 0, 1)), to: today };
  }
  return { from: iso(new Date(now.getFullYear() - 1, now.getMonth(), 1)), to: today };
}

const PRESETS = [
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "quarter", label: "Last 3 months" },
  { key: "ytd", label: "Year to date" },
  { key: "12m", label: "Last 12 months" },
];

export function StatementGenerator() {
  const initial = presetRange("this-month");
  const [accountId, setAccountId] = useState<string>("all");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [applied, setApplied] = useState({ accountId: "all", from: initial.from, to: initial.to });
  const [busy, setBusy] = useState<"pdf" | "csv" | null>(null);

  const accountsFn = useServerFn(listMyAccounts);
  const buildFn = useServerFn(buildStatement);

  const { data: accounts } = useQuery({
    queryKey: ["member", "savings", "accounts", "for-statement"],
    queryFn: () => accountsFn({}),
    staleTime: 60_000,
  });

  const { data, isFetching, error } = useQuery({
    queryKey: ["member", "savings", "custom-statement", applied],
    queryFn: () =>
      buildFn({
        data: {
          account_id: applied.accountId === "all" ? null : applied.accountId,
          from: applied.from,
          to: applied.to,
        },
      }),
    staleTime: 30_000,
  });

  const invalid = useMemo(() => new Date(from) > new Date(to), [from, to]);

  function apply() {
    if (invalid) {
      toast.error("Start date must be before the end date");
      return;
    }
    setApplied({ accountId, from, to });
  }

  function usePreset(key: string) {
    const r = presetRange(key);
    setFrom(r.from);
    setTo(r.to);
    setApplied({ accountId, from: r.from, to: r.to });
  }

  async function download(kind: "pdf" | "csv") {
    if (!data) return;
    setBusy(kind);
    try {
      const s: CustomStatement = data;
      const title = "Savings Statement";
      const subtitle = `${s.account_label} · ${s.period_start} to ${s.period_end} · Opening ${formatMoney(
        s.opening_balance,
      )} · Deposits ${formatMoney(s.deposits_total)} · Withdrawals ${formatMoney(
        s.withdrawals_total,
      )} · Interest ${formatMoney(s.interest_credited)} · Closing ${formatMoney(s.closing_balance)}`;
      const columns = [
        { header: "Date", accessor: (l: (typeof s.lines)[number]) => new Date(l.created_at).toLocaleDateString() },
        { header: "Reference", accessor: (l: (typeof s.lines)[number]) => l.ref },
        { header: "Account", accessor: (l: (typeof s.lines)[number]) => l.account_label },
        { header: "Type", accessor: (l: (typeof s.lines)[number]) => l.kind.replace(/_/g, " ") },
        { header: "Status", accessor: (l: (typeof s.lines)[number]) => l.status },
        {
          header: "Amount",
          align: "right" as const,
          accessor: (l: (typeof s.lines)[number]) => formatMoney(l.signed_amount),
        },
        {
          header: "Balance",
          align: "right" as const,
          accessor: (l: (typeof s.lines)[number]) => formatMoney(l.running_balance),
        },
      ];
      const filename = `savings-statement-${s.period_start}_${s.period_end}`;
      if (kind === "pdf") {
        await exportPdf({ title, subtitle, filename, columns, rows: s.lines });
      } else {
        exportCsv({ title, subtitle, filename, columns, rows: s.lines });
      }
      toast.success(`Statement ${kind.toUpperCase()} downloaded`);
    } catch (e) {
      toast.error((e as Error).message || "Download failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <SectionCard title="Generate a statement">
      <div className="space-y-4 p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-xs">
            <span className="font-medium text-muted-foreground">Account</span>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="all">All savings accounts</option>
              {(accounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nickname || a.plan_name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="font-medium text-muted-foreground">From</span>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="font-medium text-muted-foreground">To</span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            />
          </label>
          <div className="flex items-end">
            <Button onClick={apply} disabled={invalid} className="w-full">
              Apply period
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => usePreset(p.key)}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted"
            >
              {p.label}
            </button>
          ))}
        </div>

        {error ? (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        ) : isFetching && !data ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Building statement…
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-4 text-xs sm:grid-cols-3 lg:grid-cols-6">
              <Total label="Opening" value={data.opening_balance} />
              <Total label="Deposits" value={data.deposits_total} />
              <Total label="Withdrawals" value={data.withdrawals_total} />
              <Total label="Interest" value={data.interest_credited} />
              <Total label="Net change" value={data.net_change} />
              <Total label="Closing" value={data.closing_balance} strong />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => download("pdf")} disabled={busy !== null} className="gap-1">
                {busy === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                Download PDF
              </Button>
              <Button size="sm" variant="outline" onClick={() => download("csv")} disabled={busy !== null} className="gap-1">
                <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
              </Button>
              <span className="text-xs text-muted-foreground">
                {data.txn_count} transaction{data.txn_count === 1 ? "" : "s"} in period
              </span>
            </div>

            {data.lines.length === 0 ? (
              <EmptyState title="No transactions in this period" hint="Try a wider date range or another account." />
            ) : (
              <div className="max-h-80 overflow-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/50 text-[10px] uppercase tracking-widest text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Reference</th>
                      <th className="px-3 py-2 text-left">Account</th>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {new Date(l.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-1.5 font-mono">{l.ref}</td>
                        <td className="px-3 py-1.5">{l.account_label}</td>
                        <td className="px-3 py-1.5 capitalize">{l.kind.replace(/_/g, " ")}</td>
                        <td className="px-3 py-1.5 capitalize text-muted-foreground">{l.status}</td>
                        <td
                          className={`px-3 py-1.5 text-right font-medium ${
                            l.signed_amount >= 0 ? "text-emerald-mid" : "text-destructive"
                          }`}
                        >
                          <Money amount={l.signed_amount} />
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <Money amount={l.running_balance} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </div>
    </SectionCard>
  );
}

function Total({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={strong ? "text-sm font-semibold" : "text-sm"}>
        <Money amount={value} />
      </div>
    </div>
  );
}

export default StatementGenerator;
