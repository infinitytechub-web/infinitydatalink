import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Suspense, useMemo, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  EmptyState,
  ErrorState,
  KPIGridSkeleton,
  Money,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
  StatusPill,
} from "@/components/primitives";
import {
  listMyTransferAccounts,
  listMyTransfers,
  listTransferableAccounts,
  requestTransfer,
  type MyTransferRow,
} from "@/lib/member-transfers.functions";
import { formatMoney } from "@/lib/org-config";
import {
  deleteSweep,
  listMySweeps,
  setSweepStatus,
  submitOwnAccountTransfer,
  type Sweep,
} from "@/lib/savings-sweeps.functions";
import { SweepDialog } from "@/components/sweep-dialog";
import { Button } from "@/components/ui/button";
import { Pause, Play, Trash2, Zap } from "lucide-react";

const myTransfersQuery = (status: "all" | "pending" | "cleared" | "failed") =>
  queryOptions({
    queryKey: ["member", "transfers", status],
    queryFn: () => listMyTransfers({ data: { status } }),
    staleTime: 15_000,
  });

const myAccountsQuery = queryOptions({
  queryKey: ["member", "transfer-accounts"],
  queryFn: () => listMyTransferAccounts(),
  staleTime: 30_000,
});

export const Route = createFileRoute("/_member/app/transfers")({
  head: () => ({
    meta: [
      { title: "Transfers — IT-360 CashApp" },
      {
        name: "description",
        content: "Move funds between your accounts or send to another member.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TransfersPage,
  errorComponent: ({ error }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <ErrorState
          title="Transfers unavailable"
          message={error.message}
          onRetry={() => router.invalidate()}
        />
      </div>
    );
  },
});

function TransfersPage() {
  const [status, setStatus] = useState<"all" | "pending" | "cleared" | "failed">("all");
  return (
    <>
      <PageHeader
        eyebrow="Payments"
        title="Transfers"
        description="Send funds member↔member or between your own accounts. Staff clear each transfer before it settles."
      />
      <Suspense
        fallback={
          <div className="mt-6 space-y-8">
            <KPIGridSkeleton count={2} />
            <SectionCardSkeleton title="Recent transfers" rows={5} cols={5} />
          </div>
        }
      >
        <TransfersBody status={status} setStatus={setStatus} />
      </Suspense>
    </>
  );
}

function TransfersBody({
  status,
  setStatus,
}: {
  status: "all" | "pending" | "cleared" | "failed";
  setStatus: (s: "all" | "pending" | "cleared" | "failed") => void;
}) {
  const { data: accounts } = useSuspenseQuery(myAccountsQuery);
  const { data: transfers } = useSuspenseQuery(myTransfersQuery(status));
  const qc = useQueryClient();

  const pendingCount = useMemo(
    () => transfers.filter((t) => t.status === "pending").length,
    [transfers],
  );
  const clearedCount = useMemo(
    () => transfers.filter((t) => t.status === "cleared").length,
    [transfers],
  );

  return (
    <div className="mt-6 space-y-8">
      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Pending</div>
          <div className="mt-2 font-serif text-3xl text-foreground">{pendingCount}</div>
          <p className="mt-2 text-xs text-muted-foreground">Awaiting finance clearance.</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Cleared</div>
          <div className="mt-2 font-serif text-3xl text-foreground">{clearedCount}</div>
          <p className="mt-2 text-xs text-muted-foreground">Settled in this view.</p>
        </div>
      </section>

      <NewTransferForm
        accounts={accounts}
        onDone={() => qc.invalidateQueries({ queryKey: ["member", "transfers"] })}
      />

      <SweepsSection accounts={accounts} />

      <SectionCard
        title="My transfers"
        action={
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="mt-status">
              Filter status
            </label>
            <select
              id="mt-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="cleared">Cleared</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        }
      >
        {transfers.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No transfers yet"
              hint="Create one above and watch it move through pending → cleared."
            />
          </div>
        ) : (
          <TransfersTable rows={transfers} />
        )}
      </SectionCard>
    </div>
  );
}

function TransfersTable({ rows }: { rows: MyTransferRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <caption className="sr-only">My recent transfers</caption>
        <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-widest text-muted-foreground">
          <tr>
            <th scope="col" className="px-6 py-3 text-left">
              Ref
            </th>
            <th scope="col" className="px-6 py-3 text-left">
              When
            </th>
            <th scope="col" className="px-6 py-3 text-left">
              Direction
            </th>
            <th scope="col" className="px-6 py-3 text-left">
              Counterparty
            </th>
            <th scope="col" className="px-6 py-3 text-right">
              Amount
            </th>
            <th scope="col" className="px-6 py-3 text-left">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-6 py-3 font-mono text-xs">{r.ref}</td>
              <td className="px-6 py-3 text-xs text-muted-foreground">
                {new Date(r.created_at).toLocaleString()}
                {r.cleared_at ? (
                  <div className="text-[10px]">
                    cleared {new Date(r.cleared_at).toLocaleString()}
                  </div>
                ) : null}
              </td>
              <td className="px-6 py-3 text-xs">
                <span
                  className={
                    r.direction === "out"
                      ? "rounded-md bg-destructive/10 px-2 py-0.5 text-destructive"
                      : "rounded-md bg-primary/10 px-2 py-0.5 text-primary"
                  }
                >
                  {r.direction === "out" ? "Sent" : "Received"}
                </span>
              </td>
              <td className="px-6 py-3">{r.counterparty_label}</td>
              <td className="px-6 py-3 text-right">
                <Money amount={r.amount} signed />
              </td>
              <td className="px-6 py-3">
                <StatusPill status={r.status as any} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NewTransferForm({
  accounts,
  onDone,
}: {
  accounts: Awaited<ReturnType<typeof listMyTransferAccounts>>;
  onDone: () => void;
}) {
  const [from, setFrom] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [toAccount, setToAccount] = useState("");
  const requestFn = useServerFn(requestTransfer);
  const searchFn = useServerFn(listTransferableAccounts);

  const directory = useMemo(
    () =>
      queryOptions({
        queryKey: ["member", "transfer-directory", search],
        queryFn: () => searchFn({ data: { search } }),
        staleTime: 15_000,
      }),
    [search, searchFn],
  );
  const { data: candidates = [], isFetching } = useSuspenseQuery(directory);

  const mutate = useMutation({
    mutationFn: () =>
      requestFn({
        data: {
          from_account_id: from,
          to_account_id: toAccount,
          amount: Number(amount),
          note: note || null,
        },
      }),
    onSuccess: (row) => {
      toast.success(`Transfer ${row.ref} submitted — awaiting clearance`);
      setAmount("");
      setNote("");
      setToAccount("");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Transfer failed"),
  });

  const fromAcct = accounts.find((a) => a.id === from);
  const invalid = !from || !toAccount || from === toAccount || !amount || Number(amount) <= 0;
  const overBalance = fromAcct && Number(amount) > fromAcct.balance;

  return (
    <SectionCard title="New transfer">
      <form
        className="grid gap-4 p-6 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (invalid || overBalance) return;
          mutate.mutate();
        }}
      >
        <label className="text-xs">
          <span className="mb-1 block text-[11px] uppercase tracking-widest text-muted-foreground">
            From account
          </span>
          <select
            required
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {accounts.length === 0 ? <option value="">No active savings account</option> : null}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.plan_name ?? "Savings"} — bal {formatMoney(a.balance)}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs">
          <span className="mb-1 block text-[11px] uppercase tracking-widest text-muted-foreground">
            Amount
          </span>
          <input
            required
            type="number"
            min={1}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          {overBalance ? (
            <span className="mt-1 block text-[11px] text-destructive">Exceeds source balance.</span>
          ) : null}
        </label>

        <div className="md:col-span-2">
          <span className="mb-1 block text-[11px] uppercase tracking-widest text-muted-foreground">
            Destination account
          </span>
          <input
            type="search"
            placeholder="Search member name or number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            aria-label="Search destination accounts"
          />
          <div
            className="max-h-56 overflow-y-auto rounded-md border border-border"
            role="listbox"
            aria-label="Destination accounts"
            aria-busy={isFetching}
          >
            {candidates.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">No matching accounts.</p>
            ) : (
              <ul className="divide-y divide-border">
                {candidates.map((c) => (
                  <li key={c.account_id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={toAccount === c.account_id}
                      onClick={() => setToAccount(c.account_id)}
                      className={
                        "flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 " +
                        (toAccount === c.account_id ? "bg-primary/10" : "")
                      }
                    >
                      <span>
                        <span className="font-medium">
                          {c.member_name ?? c.member_no ?? "Member"}
                        </span>
                        <span className="ml-2 text-muted-foreground">{c.plan_name}</span>
                        {c.is_self ? (
                          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                            You
                          </span>
                        ) : null}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {c.account_id.slice(0, 8)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <label className="text-xs md:col-span-2">
          <span className="mb-1 block text-[11px] uppercase tracking-widest text-muted-foreground">
            Note (optional)
          </span>
          <input
            type="text"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </label>

        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={invalid || !!overBalance || mutate.isPending}
            className="rounded-md bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mutate.isPending ? "Submitting…" : "Submit transfer"}
          </button>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Transfers are queued as <strong>pending</strong> and settle atomically once staff clear
            them.
          </p>
        </div>
      </form>
    </SectionCard>
  );
}

const sweepsQuery = queryOptions({
  queryKey: ["member", "sweeps"],
  queryFn: () => listMySweeps(),
  staleTime: 15_000,
});

function SweepsSection({
  accounts,
}: {
  accounts: Awaited<ReturnType<typeof listMyTransferAccounts>>;
}) {
  const { data: sweeps = [] } = useSuspenseQuery(sweepsQuery);
  const own = accounts.map((a) => ({
    id: a.id,
    label: `${a.plan_name ?? "Savings"} · ${formatMoney(a.balance)}`,
    balance: a.balance,
  }));
  const qc = useQueryClient();
  const owner = useServerFn(submitOwnAccountTransfer);
  const [openQuick, setOpenQuick] = useState(false);
  const [from, setFrom] = useState(own[0]?.id ?? "");
  const [to, setTo] = useState(own[1]?.id ?? "");
  const [amt, setAmt] = useState("");
  const quick = useMutation({
    mutationFn: () =>
      owner({
        data: { from_account_id: from, to_account_id: to, amount: Number(amt), note: null },
      }),
    onSuccess: async () => {
      toast.success("Transfer completed");
      setAmt("");
      setOpenQuick(false);
      await qc.invalidateQueries({ queryKey: ["member"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <SectionCard
      title="Between my accounts & scheduled sweeps"
      action={<SweepDialog accounts={own} />}
    >
      <div className="space-y-4 p-6">
        {own.length >= 2 ? (
          <div className="rounded-md border border-border bg-muted/20 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <Zap className="h-3.5 w-3.5" /> Quick own-account transfer (auto-clears)
            </div>
            <div className="grid gap-2 md:grid-cols-4">
              <select
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {own.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
              <select
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {own.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amt}
                onChange={(e) => setAmt(e.target.value)}
                placeholder="Amount"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <Button
                onClick={() => {
                  if (!from || !to || from === to || !amt || Number(amt) <= 0)
                    return toast.error("Fill all fields");
                  quick.mutate();
                }}
                disabled={quick.isPending}
                size="sm"
              >
                {quick.isPending ? "Sending…" : "Transfer now"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Enroll in a second savings plan to enable own-account transfers and sweeps.
          </p>
        )}

        {sweeps.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No scheduled sweeps yet. Use "Schedule sweep" to automate transfers between your
            accounts.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">From → To</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-left">Rules</th>
                  <th className="px-3 py-2 text-left">Frequency</th>
                  <th className="px-3 py-2 text-left">Next run</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sweeps.map((s) => (
                  <SweepRow key={s.id} s={s} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function SweepRow({ s }: { s: Sweep }) {
  const qc = useQueryClient();
  const statusFn = useServerFn(setSweepStatus);
  const delFn = useServerFn(deleteSweep);
  const toggle = useMutation({
    mutationFn: () =>
      statusFn({ data: { id: s.id, status: s.status === "active" ? "paused" : "active" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["member", "sweeps"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: () => delFn({ data: { id: s.id } }),
    onSuccess: () => {
      toast.success("Sweep deleted");
      qc.invalidateQueries({ queryKey: ["member", "sweeps"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <tr>
      <td className="px-3 py-2">
        {s.from_label} → {s.to_label}
      </td>
      <td className="px-3 py-2 text-right">
        <Money amount={s.amount} />
      </td>
      <td className="px-3 py-2 text-[11px] text-muted-foreground">
        <div>
          Keep ≥ <Money amount={s.min_balance} />
        </div>
        <div>
          {s.max_amount != null ? (
            <>
              Cap <Money amount={s.max_amount} />
            </>
          ) : (
            "No cap"
          )}
        </div>
      </td>
      <td className="px-3 py-2 capitalize">{s.frequency}</td>
      <td className="px-3 py-2 text-muted-foreground">
        {new Date(s.next_run_at).toLocaleString()}
      </td>
      <td className="px-3 py-2">
        <span
          className={
            "rounded px-2 py-0.5 text-[10px] " +
            (s.status === "active"
              ? "bg-emerald-mid/10 text-emerald-mid"
              : "bg-muted text-muted-foreground")
          }
        >
          {s.status}
        </span>
        {s.last_run_status === "skipped" ? (
          <div className="mt-1 text-[10px] text-amber-600">
            Last run skipped — balance below minimum
          </div>
        ) : s.last_run_error ? (
          <div className="mt-1 text-[10px] text-destructive">Last: {s.last_run_error}</div>
        ) : s.last_run_amount != null ? (
          <div className="mt-1 text-[10px] text-muted-foreground">
            Last swept <Money amount={s.last_run_amount} />
          </div>
        ) : null}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="inline-flex gap-1">
          <SweepDialog accounts={[]} sweep={s} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => toggle.mutate()}
            disabled={toggle.isPending}
          >
            {s.status === "active" ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => del.mutate()}
            disabled={del.isPending}
            className="text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
