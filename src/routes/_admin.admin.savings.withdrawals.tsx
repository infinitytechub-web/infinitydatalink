import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import { BanknoteArrowDown, Check, FileDown, Search, Settings2, X } from "lucide-react";
import {
  EmptyState,
  ErrorState,
  KPIStat,
  Money,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
  StatusPill,
} from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { useStepUp } from "@/components/step-up-dialog";
import { exportCsv, type ExportColumn } from "@/lib/exports";
import {
  adminApproveWithdrawal,
  adminListWithdrawals,
  adminPayWithdrawal,
  adminCancelWithdrawal,
  adminBulkCancelWithdrawals,
  adminRejectWithdrawal,
  adminUpdateWithdrawalSettings,
  type AdminWithdrawalList,
  type WithdrawalRequest,
  type WithdrawalStatus,
} from "@/lib/withdrawals.functions";

const STATUSES = ["pending", "approved", "paid", "rejected", "cancelled", "all"] as const;

const SearchSchema = z.object({
  status: z.enum(STATUSES).catch("pending").default("pending"),
  q: z.string().max(120).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1).default(1),
});
type SearchParams = z.infer<typeof SearchSchema>;

const PAGE_SIZE = 25;

const listQuery = (s: SearchParams) =>
  queryOptions({
    queryKey: ["admin", "withdrawals", s],
    queryFn: () =>
      adminListWithdrawals({
        data: { status: s.status, search: s.q ?? null, page: s.page, page_size: PAGE_SIZE },
      }),
    staleTime: 10_000,
  });

export const Route = createFileRoute("/_admin/admin/savings/withdrawals")({
  validateSearch: (raw) => SearchSchema.parse(raw ?? {}),
  head: () => ({
    meta: [
      { title: "Withdrawal approvals · IT-360 CashApp" },
      {
        name: "description",
        content:
          "Review, approve, reject and pay out member savings withdrawal requests with dual-control checks.",
      },
      { property: "og:title", content: "Withdrawal approvals · IT-360 CashApp" },
      {
        property: "og:description",
        content: "Finance queue for member savings withdrawal requests and payouts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ({ error }) => <ErrorState message={(error as Error).message} />,
  component: WithdrawalsPage,
});

function pillStatus(status: WithdrawalStatus) {
  if (status === "paid") return "cleared" as const;
  if (status === "cancelled") return "closed" as const;
  if (status === "approved") return "approved" as const;
  if (status === "rejected") return "rejected" as const;
  return "pending" as const;
}

function WithdrawalsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [term, setTerm] = useState(search.q ?? "");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Savings"
        title="Withdrawal approvals"
        description="Members request payouts against held funds. Approve, reject, or release payment — dual control keeps approval and payout separate."
        action={<SettingsButton />}
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <Label className="mb-1.5 block text-xs">Status</Label>
          <Select
            value={search.status}
            onValueChange={(v) =>
              navigate({ search: (p: SearchParams) => ({ ...p, status: v as SearchParams["status"], page: 1 }) })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-64">
          <Label className="mb-1.5 block text-xs">Search</Label>
          <div className="flex gap-2">
            <Input
              value={term}
              placeholder="Reference, member, account"
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  navigate({ search: (p: SearchParams) => ({ ...p, q: term || undefined, page: 1 }) });
              }}
            />
            <Button
              variant="secondary"
              onClick={() => navigate({ search: (p: SearchParams) => ({ ...p, q: term || undefined, page: 1 }) })}
            >
              <Search className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <Suspense fallback={<SectionCardSkeleton />}>
        <QueueBody search={search} />
      </Suspense>
    </div>
  );
}

function QueueBody({ search }: { search: SearchParams }) {
  const navigate = Route.useNavigate();
  const { data } = useSuspenseQuery(listQuery(search));
  const list = data as AdminWithdrawalList;
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));

  const cancellable = list.rows.filter((r) => r.status === "pending" || r.status === "approved");
  const [selected, setSelected] = useState<string[]>([]);
  const selectedRows = cancellable.filter((r) => selected.includes(r.id));
  const allSelected = cancellable.length > 0 && selectedRows.length === cancellable.length;

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => (on ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPIStat label="Pending review" value={String(list.counts.pending)} tone="gold" />
        <KPIStat label="Approved, awaiting payout" value={String(list.counts.approved)} tone="royal" />
        <KPIStat label="Paid out" value={String(list.counts.paid)} tone="emerald" />
        <KPIStat
          label="Value on hold"
          value={list.pending_value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          tone="teal"
        />
      </div>

      {selectedRows.length > 0 ? (
        <BulkCancelBar rows={selectedRows} onDone={() => setSelected([])} />
      ) : null}

      <SectionCard title={`Requests (${list.total})`} accent="gold">
        {list.rows.length === 0 ? (
          <div className="px-6 py-10">
            <EmptyState
              icon={<BanknoteArrowDown className="size-5" />}
              title="Nothing in this queue"
              hint="Try a different status filter."
            />
          </div>
        ) : (
          <div className="overflow-x-auto px-6 py-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">
                    <Checkbox
                      aria-label="Select all cancellable requests on this page"
                      checked={allSelected}
                      disabled={cancellable.length === 0}
                      onCheckedChange={(v: boolean | "indeterminate") =>
                        setSelected(v === true ? cancellable.map((r) => r.id) : [])
                      }
                    />
                  </th>
                  <th className="py-2 pr-4 font-semibold">Reference</th>
                  <th className="py-2 pr-4 font-semibold">Member</th>
                  <th className="py-2 pr-4 font-semibold">Account</th>
                  <th className="py-2 pr-4 font-semibold">Amount</th>
                  <th className="py-2 pr-4 font-semibold">Reason</th>
                  <th className="py-2 pr-4 font-semibold">Status</th>
                  <th className="py-2 font-semibold text-right">Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {list.rows.map((row) => (
                  <RequestRow
                    key={row.id}
                    row={row}
                    selectable={row.status === "pending" || row.status === "approved"}
                    selected={selected.includes(row.id)}
                    onSelectedChange={(on) => toggle(row.id, on)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Page {search.page} of {pages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={search.page <= 1}
            onClick={() => navigate({ search: (p: SearchParams) => ({ ...p, page: p.page - 1 }) })}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={search.page >= pages}
            onClick={() => navigate({ search: (p: SearchParams) => ({ ...p, page: p.page + 1 }) })}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

function RequestRow({
  row,
  selectable = false,
  selected = false,
  onSelectedChange,
}: {
  row: WithdrawalRequest;
  selectable?: boolean;
  selected?: boolean;
  onSelectedChange?: (on: boolean) => void;
}) {
  const qc = useQueryClient();
  const approve = useServerFn(adminApproveWithdrawal);
  const reject = useServerFn(adminRejectWithdrawal);
  const pay = useServerFn(adminPayWithdrawal);
  const { ensure, dialog } = useStepUp();

  const cancelReq = useServerFn(adminCancelWithdrawal);
  const [mode, setMode] = useState<null | "approve" | "reject" | "cancel">(null);
  const [note, setNote] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "withdrawals"] });

  const decide = useMutation({
    mutationFn: async () => {
      const verb = mode === "approve" ? "approve" : mode === "cancel" ? "cancel" : "reject";
      const step_up_token = await ensure(`${verb} withdrawal ${row.ref}`);
      const payload = { data: { id: row.id, note: note.trim(), step_up_token } };
      if (mode === "approve") return approve(payload);
      if (mode === "cancel") return cancelReq(payload);
      return reject(payload);
    },
    onSuccess: () => {
      toast.success(
        mode === "approve"
          ? "Request approved"
          : mode === "cancel"
            ? "Request cancelled"
            : "Request rejected",
      );
      setMode(null);
      setNote("");
      invalidate();
    },
    onError: (e) => {
      if (e instanceof Error && /cancelled/i.test(e.message)) return;
      toast.error(friendlyError(e));
    },
  });

  const payout = useMutation({
    mutationFn: async () => {
      const step_up_token = await ensure(`post payout for withdrawal ${row.ref}`);
      return pay({ data: { id: row.id, step_up_token } });
    },
    onSuccess: () => {
      toast.success("Payout posted to the member's account");
      invalidate();
    },
    onError: (e) => {
      if (e instanceof Error && /cancelled/i.test(e.message)) return;
      toast.error(friendlyError(e));
    },
  });

  return (
    <tr>
      <td className="py-3 pr-3 align-top">
        {selectable ? (
          <Checkbox
            aria-label={`Select withdrawal ${row.ref}`}
            checked={selected}
            onCheckedChange={(v: boolean | "indeterminate") => onSelectedChange?.(v === true)}
          />
        ) : null}
      </td>
      <td className="py-3 pr-4 font-mono text-xs">
        {dialog}
        {row.ref}
      </td>
      <td className="py-3 pr-4">
        <div className="font-medium">{row.member_name ?? "Member"}</div>
        <div className="text-xs text-muted-foreground">{row.member_no ?? row.user_id.slice(0, 8)}</div>
      </td>
      <td className="py-3 pr-4">
        <div>{row.account_label}</div>
        <div className="text-xs text-muted-foreground capitalize">{row.channel.replace(/_/g, " ")}</div>
      </td>
      <td className="py-3 pr-4 font-semibold">
        <Money amount={row.amount} />
      </td>
      <td className="py-3 pr-4 max-w-[16rem] truncate" title={row.reason}>
        {row.reason}
      </td>
      <td className="py-3 pr-4">
        <StatusPill status={pillStatus(row.status)} />
      </td>
      <td className="py-3 text-right">
        {row.status === "pending" ? (
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setMode("approve")}>
              <Check className="mr-1 size-4" /> Approve
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setMode("reject")}>
              <X className="mr-1 size-4" /> Reject
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("cancel")}>
              Cancel
            </Button>
          </div>
        ) : row.status === "approved" ? (
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => payout.mutate()} disabled={payout.isPending}>
              {payout.isPending ? "Paying…" : "Pay out"}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setMode("reject")}>
              Reject
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("cancel")}>
              Cancel
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            {row.status === "paid" && row.paid_at
              ? new Date(row.paid_at).toLocaleString()
              : row.status === "cancelled"
                ? `Cancelled${row.cancelled_at ? ` ${new Date(row.cancelled_at).toLocaleString()}` : ""}${
                    row.cancellation_reason ? ` — ${row.cancellation_reason}` : ""
                  }${row.cancelled_by_role && row.cancelled_by_role !== "member" ? " (staff)" : ""}`
                : row.rejection_reason ?? "—"}
          </span>
        )}

        <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {mode === "approve"
                  ? "Approve withdrawal"
                  : mode === "cancel"
                    ? "Cancel withdrawal"
                    : "Reject withdrawal"}{" "}
                · {row.ref}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-left">
              <p className="text-sm text-muted-foreground">
                <Money amount={row.amount} /> for {row.member_name ?? "member"} from{" "}
                {row.account_label}.
              </p>
              <div className="space-y-2">
                <Label htmlFor={`note-${row.id}`}>
                  {mode === "approve"
                    ? "Approval note"
                    : mode === "cancel"
                      ? "Cancellation reason"
                      : "Rejection reason"}{" "}
                  (required)
                </Label>
                <Textarea
                  id={`note-${row.id}`}
                  value={note}
                  maxLength={500}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Minimum 5 characters — recorded in the audit log"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setMode(null)}>
                Cancel
              </Button>
              <Button
                variant={mode === "approve" ? "default" : "destructive"}
                disabled={note.trim().length < 5 || decide.isPending}
                onClick={() => decide.mutate()}
              >
                {decide.isPending
                  ? "Saving…"
                  : mode === "approve"
                    ? "Approve"
                    : mode === "cancel"
                      ? "Cancel request"
                      : "Reject"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </td>
    </tr>
  );
}

function SettingsButton() {
  const qc = useQueryClient();
  const save = useServerFn(adminUpdateWithdrawalSettings);
  const [open, setOpen] = useState(false);
  const [min, setMin] = useState("10");
  const [max, setMax] = useState("50000");
  const [daily, setDaily] = useState("100000");
  const [dual, setDual] = useState(true);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          min_amount: Number(min),
          max_amount: Number(max),
          daily_limit: Number(daily),
          require_dual_control: dual,
        },
      }),
    onSuccess: () => {
      toast.success("Withdrawal policy updated");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin", "withdrawals"] });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Settings2 className="mr-2 size-4" /> Policy
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdrawal policy</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="p-min">Minimum</Label>
                <Input id="p-min" type="number" value={min} onChange={(e) => setMin(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-max">Maximum</Label>
                <Input id="p-max" type="number" value={max} onChange={(e) => setMax(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-daily">Daily cap</Label>
                <Input
                  id="p-daily"
                  type="number"
                  value={daily}
                  onChange={(e) => setDaily(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium">Require dual control</p>
                <p className="text-xs text-muted-foreground">
                  The officer who approves a request cannot also release the payout.
                </p>
              </div>
              <Switch checked={dual} onCheckedChange={setDual} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save policy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const ERRORS: Record<string, string> = {
  dual_control_required: "A different officer must release this payout.",
  request_not_approved: "Only approved requests can be paid out.",
  request_not_pending: "This request is no longer pending.",
  request_not_open: "This request is already closed.",
  insufficient_funds: "The account no longer has enough balance.",
  forbidden: "You do not have permission for this action.",
  min_must_be_below_max: "Minimum must be below the maximum.",
};

function friendlyError(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err);
  for (const key of Object.keys(ERRORS)) if (raw.includes(key)) return ERRORS[key];
  return raw;
}

const WITHDRAWAL_EXPORT_COLUMNS: ExportColumn<WithdrawalRequest>[] = [
  { header: "Reference", accessor: (r) => r.ref },
  { header: "Member", accessor: (r) => r.member_name ?? "" },
  { header: "Member No", accessor: (r) => r.member_no ?? "" },
  { header: "Account", accessor: (r) => r.account_label },
  { header: "Channel", accessor: (r) => r.channel.replace(/_/g, " ") },
  { header: "Amount", accessor: (r) => r.amount, align: "right" },
  { header: "Reason", accessor: (r) => r.reason },
  { header: "Status", accessor: (r) => r.status },
  { header: "Balance at Request", accessor: (r) => r.balance_at_request, align: "right" },
  { header: "Created at", accessor: (r) => r.created_at },
  { header: "Approved at", accessor: (r) => r.approved_at ?? "" },
  { header: "Approved by", accessor: (r) => r.approved_by ?? "" },
  { header: "Approval note", accessor: (r) => r.approval_note ?? "" },
  { header: "Paid at", accessor: (r) => r.paid_at ?? "" },
  { header: "Paid by", accessor: (r) => r.paid_by ?? "" },
  { header: "Rejected at", accessor: (r) => r.rejected_at ?? "" },
  { header: "Rejection reason", accessor: (r) => r.rejection_reason ?? "" },
  { header: "Cancelled at", accessor: (r) => r.cancelled_at ?? "" },
  { header: "Cancelled by", accessor: (r) => r.cancelled_by ?? "" },
  { header: "Cancelled by role", accessor: (r) => r.cancelled_by_role ?? "" },
  { header: "Cancellation reason", accessor: (r) => r.cancellation_reason ?? "" },
  { header: "Transaction ID", accessor: (r) => r.txn_id ?? "" },
];

function formatDate(value: string | null) {
  if (!value) return "";
  try {
    return new Date(value).toISOString();
  } catch {
    return value;
  }
}

function BulkCancelBar({ rows, onDone }: { rows: WithdrawalRequest[]; onDone: () => void }) {
  const qc = useQueryClient();
  const bulkCancel = useServerFn(adminBulkCancelWithdrawals);
  const { ensure, dialog } = useStepUp();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const MIN_REASON = 5;
  const reasonFor = (id: string) => (notes[id] ?? "").trim();
  const missing = rows.filter((r) => reasonFor(r.id).length < MIN_REASON);
  const ready = missing.length === 0;
  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  const run = useMutation({
    mutationFn: async () => {
      if (missing.length > 0) {
        throw new Error(
          `Batch blocked: ${missing.length} request(s) still need a reason of at least ${MIN_REASON} characters.`,
        );
      }
      const step_up_token = await ensure(`cancel ${rows.length} withdrawal requests`);
      return bulkCancel({
        data: {
          items: rows.map((r) => ({ id: r.id, note: reasonFor(r.id) })),
          step_up_token,
        },
      });
    },
    onSuccess: (res) => {
      if (res.ok.length) toast.success(`Cancelled ${res.ok.length} request(s)`);
      if (res.failed.length)
        toast.error(`${res.failed.length} could not be cancelled: ${friendlyError(res.failed[0].error)}`);
      setOpen(false);
      setNotes({});
      onDone();
      qc.invalidateQueries({ queryKey: ["admin", "withdrawals"] });
    },
    onError: (e) => {
      if (e instanceof Error && /cancelled/i.test(e.message)) return;
      toast.error(friendlyError(e));
    },
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
      {dialog}
      <div className="text-sm">
        <span className="font-semibold">{rows.length} selected</span>{" "}
        <span className="text-muted-foreground">
          · total <Money amount={total} />
        </span>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={onDone}>
          Clear selection
        </Button>
        <Button size="sm" variant="destructive" onClick={() => setOpen(true)}>
          <X className="mr-1 size-4" /> Cancel selected
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cancel {rows.length} withdrawal requests</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p
              className={`text-sm ${ready ? "text-muted-foreground" : "text-destructive"}`}
              role={ready ? undefined : "alert"}
            >
              {ready
                ? "Every request has its own reason — the batch is ready."
                : `${missing.length} of ${rows.length} request(s) still need a reason of at least ${MIN_REASON} characters. The batch is blocked until all are filled.`}
            </p>
            <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
              {rows.map((r) => {
                const value = notes[r.id] ?? "";
                const invalid = value.trim().length < MIN_REASON;
                return (
                  <div
                    key={r.id}
                    className={`rounded-lg border p-3 ${invalid ? "border-destructive/60" : "border-border/60"}`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                      <span className="font-mono text-xs">{r.ref}</span>
                      <span className="text-muted-foreground">
                        {r.member_name ?? "Member"} · <Money amount={r.amount} />
                      </span>
                      <StatusPill status={pillStatus(r.status)} />
                    </div>
                    <Input
                      aria-label={`Cancellation reason for ${r.ref}`}
                      aria-invalid={invalid}
                      aria-describedby={invalid ? `bulk-reason-err-${r.id}` : undefined}
                      value={value}
                      maxLength={500}
                      onChange={(e) => setNotes((p) => ({ ...p, [r.id]: e.target.value }))}
                      placeholder={`Required — reason for ${r.ref} (min ${MIN_REASON} characters)`}
                    />
                    {invalid && (
                      <p id={`bulk-reason-err-${r.id}`} className="mt-1 text-xs text-destructive">
                        Reason required (at least {MIN_REASON} characters).
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Back
            </Button>
            <Button variant="destructive" disabled={!ready || run.isPending} onClick={() => run.mutate()}>
              {run.isPending ? "Cancelling…" : `Cancel ${rows.length} requests`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
