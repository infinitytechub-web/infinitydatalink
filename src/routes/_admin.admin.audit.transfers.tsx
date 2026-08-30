import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { toast } from "sonner";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
  StatusPill,
} from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";
import { Pagination } from "@/components/table-controls";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatMoney } from "@/lib/org-config";
import { listTransferAudit, type TransferAuditEntry } from "@/lib/admin-finance.functions";

const search = z.object({
  action: fallback(z.enum(["all", "cleared", "rejected", "requested"]), "all").default("all"),
  search: fallback(z.string(), "").default(""),
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
  page: fallback(z.number().int(), 1).default(1),
  pageSize: fallback(z.number().int(), 25).default(25),
  selected: fallback(z.string(), "").default(""),
});
type SearchInput = z.infer<typeof search>;

export const Route = createFileRoute("/_admin/admin/audit/transfers")({
  validateSearch: zodValidator(search),
  head: () => ({
    meta: [
      { title: "Transfer Decision Audit — IT-360 CashApp" },
      {
        name: "description",
        content: "Immutable log of every transfer approve and reject action.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TransferAuditPage,
});

const auditQuery = (s: SearchInput) =>
  queryOptions({
    queryKey: ["admin", "transfer-audit", s],
    queryFn: () =>
      listTransferAudit({
        data: {
          action: s.action,
          search: s.search.trim() || undefined,
          from: s.from ? new Date(s.from).toISOString() : undefined,
          to: s.to
            ? new Date(new Date(s.to).getTime() + 24 * 60 * 60 * 1000 - 1).toISOString()
            : undefined,
          page: Math.max(1, s.page),
          pageSize: s.pageSize,
        },
      }),
  });

function TransferAuditPage() {
  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Transfer Decision Audit"
        description="Every transfer approval, rejection, and request captured with the responsible officer, timestamp, and reference."
      />
      <Suspense fallback={<SectionCardSkeleton title="Transfer decisions" rows={8} cols={6} />}>
        <AuditContent />
      </Suspense>
    </>
  );
}

function actionStatus(action: TransferAuditEntry["action"]): "approved" | "rejected" | "pending" {
  if (action === "transfer.cleared") return "approved";
  if (action === "transfer.rejected") return "rejected";
  return "pending";
}

function actionLabel(action: TransferAuditEntry["action"]): string {
  switch (action) {
    case "transfer.cleared":
      return "APPROVED";
    case "transfer.rejected":
      return "REJECTED";
    case "transfer.requested":
      return "REQUESTED";
    default:
      return "CREATED";
  }
}

function AuditContent() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data } = useSuspenseQuery(auditQuery(s));

  const setSearch = (patch: Partial<SearchInput>) =>
    navigate({ search: (prev: SearchInput) => ({ ...prev, ...patch, page: patch.page ?? 1 }) });
  const selectEntry = (id: string | null) =>
    navigate({ search: (prev: SearchInput) => ({ ...prev, selected: id ?? "" }) });

  const rows = data.rows;
  const selected = s.selected ? (rows.find((r) => r.id === s.selected) ?? null) : null;

  return (
    <>
      <SectionCard
        title="Approve / reject log"
        action={
          <ExportBar
            permission="export:audit"
            title="Transfer Decision Audit"
            subtitle={`${data.total} events`}
            filename="transfer_audit"
            columns={[
              {
                header: "Timestamp",
                accessor: (e: TransferAuditEntry) => new Date(e.created_at).toISOString(),
              },
              { header: "Action", accessor: (e) => actionLabel(e.action) },
              { header: "Transfer Ref", accessor: (e) => e.transfer_ref ?? "—" },
              { header: "Transfer ID", accessor: (e) => e.transfer_id ?? "—" },
              {
                header: "Amount",
                accessor: (e) => (e.amount != null ? formatMoney(e.amount) : "—"),
                align: "right",
              },
              {
                header: "From member",
                accessor: (e) => e.from_member_name ?? e.from_account_id ?? "—",
              },
              { header: "From member no", accessor: (e) => e.from_member_no ?? "—" },
              { header: "To member", accessor: (e) => e.to_member_name ?? e.to_account_id ?? "—" },
              { header: "To member no", accessor: (e) => e.to_member_no ?? "—" },
              { header: "Officer", accessor: (e) => e.actor_email ?? e.actor_id ?? "—" },
              { header: "Role", accessor: (e) => e.actor_role ?? "—" },
              { header: "Reason", accessor: (e) => e.reason ?? "" },
            ]}
            rows={rows}
          />
        }
      >
        <div className="flex flex-wrap items-end gap-3 border-b border-emerald-deep/5 bg-cream/30 px-6 py-4">
          <Field label="Action">
            <select
              value={s.action}
              onChange={(e) => setSearch({ action: e.target.value as SearchInput["action"] })}
              className="rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs outline-none focus:border-emerald-mid"
            >
              <option value="all">All events</option>
              <option value="cleared">Approved (cleared)</option>
              <option value="rejected">Rejected</option>
              <option value="requested">Requested / created</option>
            </select>
          </Field>
          <Field label="Search">
            <input
              value={s.search}
              onChange={(e) => setSearch({ search: e.target.value })}
              placeholder="Ref, member no, officer, reason…"
              className="w-64 rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs outline-none focus:border-emerald-mid"
            />
          </Field>
          <Field label="From">
            <input
              type="date"
              value={s.from}
              onChange={(e) => setSearch({ from: e.target.value })}
              className="rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs outline-none focus:border-emerald-mid"
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={s.to}
              onChange={(e) => setSearch({ to: e.target.value })}
              className="rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs outline-none focus:border-emerald-mid"
            />
          </Field>
          {(s.search || s.from || s.to || s.action !== "all") && (
            <button
              onClick={() =>
                navigate({
                  search: {
                    action: "all",
                    search: "",
                    from: "",
                    to: "",
                    page: 1,
                    pageSize: s.pageSize,
                    selected: "",
                  },
                })
              }
              className="rounded border border-emerald-deep/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-cream/50"
            >
              Reset
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No matching transfer decisions"
              hint="Adjust filters or approve / reject a pending transfer to see entries."
            />
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Timestamp</th>
                  <th className="px-6 py-3 font-medium">Action</th>
                  <th className="px-6 py-3 font-medium">Transfer</th>
                  <th className="px-6 py-3 font-medium">From → To</th>
                  <th className="px-6 py-3 text-right font-medium">Amount</th>
                  <th className="px-6 py-3 font-medium">Officer</th>
                  <th className="px-6 py-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-deep/5">
                {rows.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => selectEntry(e.id)}
                    className="align-top cursor-pointer hover:bg-cream/40"
                  >
                    <td className="tabular px-6 py-4 text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <StatusPill status={actionStatus(e.action)} />
                      <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                        {actionLabel(e.action)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="tabular font-semibold">{e.transfer_ref ?? "—"}</div>
                      <div className="truncate max-w-[10rem] text-[11px] text-muted-foreground">
                        {e.transfer_id ?? ""}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs">
                      <div className="font-medium">
                        {e.from_member_name ?? e.from_account_id?.slice(0, 8) ?? "—"}
                      </div>
                      <div className="text-muted-foreground">
                        → {e.to_member_name ?? e.to_account_id?.slice(0, 8) ?? "—"}
                      </div>
                    </td>
                    <td className="tabular px-6 py-4 text-right text-sm">
                      {e.amount != null ? formatMoney(e.amount) : "—"}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="font-medium">{e.actor_email ?? "—"}</div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        {e.actor_role ?? "—"}
                      </div>
                    </td>
                    <td className="px-6 py-4 max-w-md whitespace-pre-wrap text-xs text-muted-foreground">
                      <div className="line-clamp-2">
                        {e.reason ?? <span className="text-muted-foreground">—</span>}
                      </div>
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          selectEntry(e.id);
                        }}
                        className="mt-1 text-[10px] font-bold uppercase tracking-widest text-emerald-mid hover:underline"
                      >
                        View details →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onPage={(n) => setSearch({ page: n })}
              onPageSize={(n) => setSearch({ pageSize: n, page: 1 })}
            />
          </>
        )}
      </SectionCard>
      <DetailsDialog entry={selected} onClose={() => selectEntry(null)} />
    </>
  );
}

function DetailsDialog({
  entry,
  onClose,
}: {
  entry: TransferAuditEntry | null;
  onClose: () => void;
}) {
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl text-emerald-deep">
            Transfer decision details
          </DialogTitle>
          <DialogDescription>
            Immutable audit entry recorded at the moment the transfer action was written.
          </DialogDescription>
        </DialogHeader>

        {entry && (
          <div className="space-y-5 text-sm">
            <div className="flex items-center justify-between rounded border border-emerald-deep/10 bg-cream/30 px-4 py-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Action
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <StatusPill status={actionStatus(entry.action)} />
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {actionLabel(entry.action)}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Timestamp
                </div>
                <div className="tabular mt-1 text-xs text-muted-foreground">
                  {new Date(entry.created_at).toLocaleString()}
                </div>
              </div>
            </div>

            <Section title="Transfer">
              <Row
                label="Reference"
                value={entry.transfer_ref ?? "—"}
                mono
                onCopy={
                  entry.transfer_ref ? () => copy(entry.transfer_ref!, "Reference") : undefined
                }
              />
              <Row
                label="Transfer ID"
                value={entry.transfer_id ?? "—"}
                mono
                onCopy={
                  entry.transfer_id ? () => copy(entry.transfer_id!, "Transfer ID") : undefined
                }
              />
              <Row label="Amount" value={entry.amount != null ? formatMoney(entry.amount) : "—"} />
              <Row label="Action code" value={entry.action} mono />
              {entry.out_txn_ref && <Row label="Outbound txn" value={entry.out_txn_ref} mono />}
              {entry.in_txn_ref && <Row label="Inbound txn" value={entry.in_txn_ref} mono />}
            </Section>

            <Section title="From account">
              <Row label="Member" value={entry.from_member_name ?? "—"} />
              <Row label="Member no" value={entry.from_member_no ?? "—"} mono />
              <Row
                label="Account ID"
                value={entry.from_account_id ?? "—"}
                mono
                onCopy={
                  entry.from_account_id
                    ? () => copy(entry.from_account_id!, "Account ID")
                    : undefined
                }
              />
            </Section>

            <Section title="To account">
              <Row label="Member" value={entry.to_member_name ?? "—"} />
              <Row label="Member no" value={entry.to_member_no ?? "—"} mono />
              <Row
                label="Account ID"
                value={entry.to_account_id ?? "—"}
                mono
                onCopy={
                  entry.to_account_id ? () => copy(entry.to_account_id!, "Account ID") : undefined
                }
              />
            </Section>

            <Section title="Officer">
              <Row label="Email" value={entry.actor_email ?? "—"} />
              <Row label="Role" value={entry.actor_role ?? "—"} />
              <Row
                label="Actor ID"
                value={entry.actor_id ?? "—"}
                mono
                onCopy={entry.actor_id ? () => copy(entry.actor_id!, "Actor ID") : undefined}
              />
            </Section>

            {entry.reason && (
              <Section title="Reason / note">
                <div className="whitespace-pre-wrap rounded border border-emerald-deep/10 bg-cream/30 px-3 py-2 text-xs text-muted-foreground">
                  {entry.reason}
                </div>
              </Section>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => copy(JSON.stringify(entry.meta, null, 2), "Full metadata")}
                className="rounded border border-emerald-deep/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-cream/50"
              >
                Copy full metadata JSON
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  onCopy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onCopy?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded px-3 py-1.5 hover:bg-cream/30">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2">
        <div
          className={
            mono
              ? "tabular text-right text-xs text-emerald-deep/90"
              : "text-right text-xs text-emerald-deep/90"
          }
        >
          {value}
        </div>
        {onCopy && (
          <button
            type="button"
            onClick={onCopy}
            className="text-[10px] font-bold uppercase tracking-widest text-emerald-mid hover:underline"
          >
            copy
          </button>
        )}
      </div>
    </div>
  );
}
