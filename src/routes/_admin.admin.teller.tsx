import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useMemo, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Printer, Search, Lock, Unlock } from "lucide-react";
import {
  ErrorState,
  EmptyState,
  KPIStat,
  Money,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
} from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TELLER_KINDS,
  TELLER_KIND_LABELS,
  TELLER_METHODS,
  closeTellerSession,
  getTellerWorkspace,
  lookupTellerMember,
  openTellerSession,
  postTellerTransaction,
  type TellerKind,
  type TellerMemberLookup,
  type TellerReceipt,
} from "@/lib/teller.functions";

const workspaceQuery = queryOptions({
  queryKey: ["teller", "workspace"],
  queryFn: () => getTellerWorkspace(),
  staleTime: 5_000,
});

export const Route = createFileRoute("/_admin/admin/teller")({
  head: () => ({
    meta: [
      { title: "Teller mode — IT-360 CashApp Admin" },
      {
        name: "description",
        content:
          "Open a till, post counter deposits, withdrawals and loan repayments, and reconcile at close of day.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error }) => (
    <ErrorState title="Teller mode unavailable" message={error.message} />
  ),
  notFoundComponent: () => (
    <EmptyState title="Nothing here" hint="This teller view does not exist." />
  ),
  component: TellerModePage,
});

function TellerModePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Counter operations"
        title="Teller mode"
        description="Open your till, capture counter transactions against member accounts, and reconcile cash at close of day."
      />
      <Suspense fallback={<SectionCardSkeleton />}>
        <TellerWorkspace />
      </Suspense>
    </div>
  );
}

function TellerWorkspace() {
  const { data } = useSuspenseQuery(workspaceQuery);
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["teller"] });

  const openSession = useServerFn(openTellerSession);
  const closeSession = useServerFn(closeTellerSession);

  const [float, setFloat] = useState("0");
  const [openNote, setOpenNote] = useState("");
  const [counted, setCounted] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [receipt, setReceipt] = useState<TellerReceipt | null>(null);

  const openMut = useMutation({
    mutationFn: () =>
      openSession({ data: { opening_float: Number(float) || 0, note: openNote || undefined } }),
    onSuccess: () => {
      toast.success("Till opened");
      setOpenNote("");
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const closeMut = useMutation({
    mutationFn: () =>
      closeSession({
        data: {
          session_id: data.session!.id,
          counted_close: Number(counted) || 0,
          note: closeNote || undefined,
        },
      }),
    onSuccess: (s) => {
      toast.success(
        s.variance === 0
          ? "Till closed and balanced"
          : `Till closed with a variance of ${s.variance?.toFixed(2)}`,
      );
      setCounted("");
      setCloseNote("");
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data.session) {
    return (
      <SectionCard title="Open your till">
        <div className="grid gap-4 sm:grid-cols-[200px_1fr_auto] sm:items-end">
          <label className="space-y-1 text-xs uppercase tracking-widest text-muted-foreground">
            Opening float
            <Input value={float} onChange={(e) => setFloat(e.target.value)} inputMode="decimal" />
          </label>
          <label className="space-y-1 text-xs uppercase tracking-widest text-muted-foreground">
            Note (optional)
            <Input
              value={openNote}
              onChange={(e) => setOpenNote(e.target.value)}
              placeholder="Shift, branch, till id…"
            />
          </label>
          <Button onClick={() => openMut.mutate()} disabled={openMut.isPending}>
            <Unlock className="mr-2 h-4 w-4" /> Open till
          </Button>
        </div>
        {data.recent_sessions.length > 0 ? (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="py-2">Opened</th>
                  <th className="py-2">Closed</th>
                  <th className="py-2 text-right">Expected</th>
                  <th className="py-2 text-right">Counted</th>
                  <th className="py-2 text-right">Variance</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_sessions.map((s) => (
                  <tr key={s.id} className="border-t border-border/60">
                    <td className="py-2">{new Date(s.opened_at).toLocaleString()}</td>
                    <td className="py-2">
                      {s.closed_at ? new Date(s.closed_at).toLocaleString() : "—"}
                    </td>
                    <td className="py-2 text-right">
                      {s.expected_close === null ? "—" : <Money amount={s.expected_close} />}
                    </td>
                    <td className="py-2 text-right">
                      {s.counted_close === null ? "—" : <Money amount={s.counted_close} />}
                    </td>
                    <td className="py-2 text-right">
                      {s.variance === null ? "—" : <Money amount={s.variance} signed />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPIStat
          label="Drawer position"
          value={<Money amount={data.totals.drawer} />}
          tone="teal"
          hint="Cash on hand"
        />
        <KPIStat label="Cash in" value={<Money amount={data.totals.cash_in} />} tone="royal" />
        <KPIStat label="Cash out" value={<Money amount={data.totals.cash_out} />} tone="gold" />
        <KPIStat
          label="Postings"
          value={String(data.totals.count)}
          tone="slate"
          hint={`Opened ${new Date(data.session.opened_at).toLocaleTimeString()}`}
        />
      </div>

      <PostingPanel
        onPosted={(r) => {
          setReceipt(r);
          void invalidate();
        }}
      />

      <SectionCard title="Session postings">
        {data.transactions.length === 0 ? (
          <EmptyState
            title="No postings yet"
            hint="Captured transactions appear here with their receipt reference."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="py-2">Time</th>
                  <th className="py-2">Reference</th>
                  <th className="py-2">Member</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Method</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((t) => (
                  <tr key={t.id} className="border-t border-border/60">
                    <td className="py-2">{new Date(t.created_at).toLocaleTimeString()}</td>
                    <td className="py-2 font-mono text-xs">{t.reference}</td>
                    <td className="py-2">
                      {t.member_name ?? "—"}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {t.member_no ?? ""}
                      </span>
                    </td>
                    <td className="py-2">{TELLER_KIND_LABELS[t.kind] ?? t.kind}</td>
                    <td className="py-2 capitalize">{t.method.replace("_", " ")}</td>
                    <td className="py-2 text-right">
                      <Money amount={t.amount} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Close of day reconciliation">
        <div className="grid gap-4 sm:grid-cols-[200px_1fr_auto] sm:items-end">
          <label className="space-y-1 text-xs uppercase tracking-widest text-muted-foreground">
            Counted cash
            <Input
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
            />
          </label>
          <label className="space-y-1 text-xs uppercase tracking-widest text-muted-foreground">
            Reconciliation note
            <Input
              value={closeNote}
              onChange={(e) => setCloseNote(e.target.value)}
              placeholder="Explain any variance"
            />
          </label>
          <Button
            variant="secondary"
            onClick={() => closeMut.mutate()}
            disabled={closeMut.isPending || counted === ""}
          >
            <Lock className="mr-2 h-4 w-4" /> Close till
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Expected drawer per system: <Money amount={data.totals.drawer} />. Variances are stored on
          the session and written to the audit trail.
        </p>
      </SectionCard>

      <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}

function PostingPanel({ onPosted }: { onPosted: (r: TellerReceipt) => void }) {
  const lookup = useServerFn(lookupTellerMember);
  const post = useServerFn(postTellerTransaction);

  const [term, setTerm] = useState("");
  const [results, setResults] = useState<TellerMemberLookup[] | null>(null);
  const [member, setMember] = useState<TellerMemberLookup | null>(null);
  const [kind, setKind] = useState<TellerKind>("deposit");
  const [method, setMethod] = useState<string>("cash");
  const [accountId, setAccountId] = useState("");
  const [loanId, setLoanId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const searchMut = useMutation({
    mutationFn: () => lookup({ data: { query: term } }),
    onSuccess: (rows) => {
      setResults(rows);
      if (rows.length === 0) toast.info("No member matched that search");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const postMut = useMutation({
    mutationFn: () =>
      post({
        data: {
          member_id: member!.id,
          kind,
          method: method as (typeof TELLER_METHODS)[number],
          amount: Number(amount),
          account_id: kind === "loan_repayment" ? undefined : accountId || undefined,
          loan_id: kind === "loan_repayment" ? loanId || undefined : undefined,
          note: note || undefined,
          idempotency_key: crypto.randomUUID().replace(/-/g, ""),
          device: typeof navigator === "undefined" ? undefined : navigator.userAgent.slice(0, 280),
        },
      }),
    onSuccess: (r) => {
      toast.success(`Posted ${r.reference}`);
      setAmount("");
      setNote("");
      onPosted(r);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canPost = useMemo(() => {
    if (!member || !(Number(amount) > 0)) return false;
    return kind === "loan_repayment" ? Boolean(loanId) : Boolean(accountId);
  }, [member, amount, kind, accountId, loanId]);

  return (
    <SectionCard title="Capture a transaction" accent="teal">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[240px] flex-1 space-y-1 text-xs uppercase tracking-widest text-muted-foreground">
          Find member
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && term.trim().length > 1) searchMut.mutate();
            }}
            placeholder="Member number, name or phone"
          />
        </label>
        <Button
          variant="secondary"
          onClick={() => searchMut.mutate()}
          disabled={searchMut.isPending || term.trim().length < 2}
        >
          <Search className="mr-2 h-4 w-4" /> Search
        </Button>
      </div>

      {results && results.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                setMember(r);
                setAccountId(r.accounts[0]?.id ?? "");
                setLoanId(r.loans[0]?.id ?? "");
              }}
              className={`rounded border px-3 py-2 text-left text-xs ${
                member?.id === r.id
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-muted"
              }`}
            >
              <span className="block font-semibold">{r.full_name ?? "Unnamed member"}</span>
              <span className="text-muted-foreground">
                {r.member_no ?? "no member no."} · KYC {r.kyc ?? "unknown"}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {member ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs uppercase tracking-widest text-muted-foreground">
              Transaction type
              <Select value={kind} onValueChange={(v) => setKind(v as TellerKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TELLER_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {TELLER_KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-xs uppercase tracking-widest text-muted-foreground">
              Method
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TELLER_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {kind === "loan_repayment" ? (
              <label className="space-y-1 text-xs uppercase tracking-widest text-muted-foreground sm:col-span-2">
                Loan
                <Select value={loanId} onValueChange={setLoanId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a loan" />
                  </SelectTrigger>
                  <SelectContent>
                    {member.loans.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {(l.product ?? "Loan") + ` · outstanding ${l.outstanding.toFixed(2)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            ) : (
              <label className="space-y-1 text-xs uppercase tracking-widest text-muted-foreground sm:col-span-2">
                Savings account
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an account" />
                  </SelectTrigger>
                  <SelectContent>
                    {member.accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {`${a.label} · balance ${a.balance.toFixed(2)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            )}
            <label className="space-y-1 text-xs uppercase tracking-widest text-muted-foreground">
              Amount
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
              />
            </label>
          </div>
          <div className="space-y-3">
            <label className="space-y-1 text-xs uppercase tracking-widest text-muted-foreground">
              Note
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder="Counter narrative, cheque number…"
              />
            </label>
            <Button
              onClick={() => postMut.mutate()}
              disabled={!canPost || postMut.isPending}
              className="w-full"
            >
              Post transaction
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          Search and select a member to begin capturing.
        </p>
      )}
    </SectionCard>
  );
}

function ReceiptDialog({
  receipt,
  onClose,
}: {
  receipt: TellerReceipt | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(receipt)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receipt {receipt?.reference}</DialogTitle>
        </DialogHeader>
        {receipt ? (
          <dl className="space-y-2 text-sm">
            <Row
              label="Member"
              value={`${receipt.member_name ?? "—"} ${receipt.member_no ?? ""}`}
            />
            <Row label="Type" value={TELLER_KIND_LABELS[receipt.kind]} />
            <Row label="Method" value={receipt.method.replace("_", " ")} />
            <Row label="Amount" value={receipt.amount.toFixed(2)} />
            <Row label="Posted" value={new Date(receipt.created_at).toLocaleString()} />
            {receipt.note ? <Row label="Note" value={receipt.note} /> : null}
          </dl>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 pb-1">
      <dt className="text-xs uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
