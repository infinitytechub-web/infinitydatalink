import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  EmptyState,
  ErrorState,
  KPIGridSkeleton,
  KPIStat,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
} from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/org-config";
import {
  ARREARS_BUCKETS,
  getArrearsSummary,
  listLoanArrears,
  listLoanPenalties,
  runArrearsRefresh,
  waiveLoanPenalty,
  type PenaltyRow,
} from "@/lib/loan-arrears.functions";

export const Route = createFileRoute("/_admin/admin/loan-arrears")({
  head: () => ({
    meta: [
      { title: "Arrears & Delinquency — Loan Collections" },
      { name: "description", content: "Aging buckets, portfolio-at-risk KPIs, collections worklist and late-fee ledger." },
      { property: "og:title", content: "Arrears & Delinquency" },
      { property: "og:description", content: "Loan aging buckets, portfolio at risk and automated late fees." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ArrearsPage,
  errorComponent: ({ error }) => <PageError error={error} />,
});

function PageError({ error }: { error: Error }) {
  const router = useRouter();
  return (
    <div className="p-6">
      <ErrorState title="Arrears failed to load" message={error.message} onRetry={() => router.invalidate()} />
    </div>
  );
}

const summaryQuery = queryOptions({
  queryKey: ["admin", "loan-arrears", "summary"],
  queryFn: () => getArrearsSummary(),
});

const arrearsQuery = (bucket: string, sort: string, dir: string, page: number, pageSize: number) =>
  queryOptions({
    queryKey: ["admin", "loan-arrears", "list", bucket, sort, dir, page, pageSize],
    queryFn: () =>
      listLoanArrears({
        data: { bucket: bucket as any, sort: sort as any, dir: dir as any, page, page_size: pageSize },
      }),
  });

const penaltiesQuery = (state: string) =>
  queryOptions({
    queryKey: ["admin", "loan-penalties", state],
    queryFn: () => listLoanPenalties({ data: { state: state as any, limit: 50 } }),
  });

function ArrearsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Collections"
        title="Arrears & delinquency"
        description="Aging buckets, portfolio at risk, the officer worklist and automated late-fee accruals."
      />
      <Suspense
        fallback={
          <div className="space-y-8">
            <KPIGridSkeleton count={4} />
            <SectionCardSkeleton title="Collections worklist" rows={6} cols={6} />
          </div>
        }
      >
        <ArrearsContent />
      </Suspense>
    </>
  );
}

function ArrearsContent() {
  const { data: summary } = useSuspenseQuery(summaryQuery);
  const [bucket, setBucket] = useState<string>("all");
  const [sort, setSort] = useState<string>("days_past_due");
  const [dir, setDir] = useState<string>("desc");
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const { data: list } = useSuspenseQuery(arrearsQuery(bucket, sort, dir, page, pageSize));

  const qc = useQueryClient();
  const refresh = useServerFn(runArrearsRefresh);
  const refreshMutation = useMutation({
    mutationFn: () => refresh(),
    onSuccess: () => {
      toast.success("Arrears re-aged and late fees assessed");
      qc.invalidateQueries({ queryKey: ["admin", "loan-arrears"] });
      qc.invalidateQueries({ queryKey: ["admin", "loan-penalties"] });
    },
    onError: (e: Error) => toast.error("Run failed", { description: e.message }),
  });

  const pages = Math.max(1, Math.ceil(list.total / pageSize));

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPIStat label="Total arrears" value={formatMoney(summary.total_arrears)} accent="rose" />
        <KPIStat label="Loans in arrears" value={String(summary.loans_in_arrears)} accent="amber" />
        <KPIStat label="Portfolio at risk" value={`${summary.portfolio_at_risk_pct}%`} accent="teal" />
        <KPIStat label="Late fees outstanding" value={formatMoney(summary.penalties_outstanding)} accent="violet" />
      </div>

      <SectionCard
        title="Aging buckets"
        action={
          <Button size="sm" disabled={refreshMutation.isPending} onClick={() => refreshMutation.mutate()}>
            {refreshMutation.isPending ? "Running…" : "Re-age & assess fees"}
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-5">
          {summary.buckets.map((b) => (
            <div key={b.bucket} className="rounded-lg border border-border/60 p-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{b.bucket}</div>
              <div className="mt-1 text-lg font-semibold">{b.loans}</div>
              <div className="text-xs text-muted-foreground">arrears {formatMoney(b.arrears)}</div>
              <div className="text-xs text-muted-foreground">outstanding {formatMoney(b.outstanding)}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title={`Collections worklist (${list.total})`}
        action={
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider">Bucket</Label>
              <Select
                value={bucket}
                onValueChange={(v) => {
                  setBucket(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All overdue</SelectItem>
                  {ARREARS_BUCKETS.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider">Sort</Label>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="h-9 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="days_past_due">Days past due</SelectItem>
                  <SelectItem value="arrears_amount">Arrears amount</SelectItem>
                  <SelectItem value="outstanding_principal">Outstanding</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={() => setDir((d) => (d === "asc" ? "desc" : "asc"))}>
              {dir === "asc" ? "Ascending" : "Descending"}
            </Button>
          </div>
        }
      >
        {list.rows.length === 0 ? (
          <EmptyState title="Nothing in arrears" hint="Every active loan is current for the selected bucket." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">Loan</th>
                    <th className="py-2 pr-4">Member</th>
                    <th className="py-2 pr-4">Bucket</th>
                    <th className="py-2 pr-4">DPD</th>
                    <th className="py-2 pr-4">Arrears</th>
                    <th className="py-2 pr-4">Outstanding</th>
                    <th className="py-2 pr-4">Late fees</th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((r) => (
                    <tr key={r.id} className="border-t border-border/60">
                      <td className="py-3 pr-4 font-mono text-xs">{r.ref}</td>
                      <td className="py-3 pr-4">
                        <div>{r.member_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.member_no ?? ""} {r.member_phone ?? ""}
                        </div>
                      </td>
                      <td className="py-3 pr-4">{r.arrears_bucket}</td>
                      <td className="py-3 pr-4">{r.days_past_due}</td>
                      <td className="py-3 pr-4">{formatMoney(r.arrears_amount)}</td>
                      <td className="py-3 pr-4">{formatMoney(r.outstanding_principal)}</td>
                      <td className="py-3 pr-4">{formatMoney(r.penalty_accrued)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Page {page} of {pages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </SectionCard>

      <PenaltiesCard />
    </div>
  );
}

function PenaltiesCard() {
  const [state, setState] = useState("outstanding");
  const { data: penalties } = useSuspenseQuery(penaltiesQuery(state));
  const [waiving, setWaiving] = useState<PenaltyRow | null>(null);

  return (
    <SectionCard
      title="Late-fee ledger"
      action={
        <Select value={state} onValueChange={setState}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="outstanding">Outstanding</SelectItem>
            <SelectItem value="waived">Waived</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      }
    >
      {penalties.length === 0 ? (
        <EmptyState title="No late fees" hint="Nothing has been accrued for this filter." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-2 pr-4">Loan</th>
                <th className="py-2 pr-4">Member</th>
                <th className="py-2 pr-4">Period</th>
                <th className="py-2 pr-4">Days late</th>
                <th className="py-2 pr-4">Fee</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {penalties.map((p) => (
                <tr key={p.id} className="border-t border-border/60">
                  <td className="py-3 pr-4 font-mono text-xs">{p.loan_ref ?? "—"}</td>
                  <td className="py-3 pr-4">{p.member_name ?? "—"}</td>
                  <td className="py-3 pr-4">{p.period_month}</td>
                  <td className="py-3 pr-4">{p.days_late}</td>
                  <td className="py-3 pr-4">{formatMoney(p.amount)}</td>
                  <td className="py-3 pr-4 text-xs">
                    {p.waived_at ? `Waived — ${p.waive_note ?? ""}` : "Outstanding"}
                  </td>
                  <td className="py-3">
                    {!p.waived_at && (
                      <Button variant="outline" size="sm" onClick={() => setWaiving(p)}>
                        Waive
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <WaiveDialog penalty={waiving} onClose={() => setWaiving(null)} />
    </SectionCard>
  );
}

function WaiveDialog({ penalty, onClose }: { penalty: PenaltyRow | null; onClose: () => void }) {
  const [note, setNote] = useState("");
  const qc = useQueryClient();
  const waive = useServerFn(waiveLoanPenalty);
  const mutation = useMutation({
    mutationFn: () => waive({ data: { penalty_id: penalty!.id, note: note.trim() } }),
    onSuccess: () => {
      toast.success("Late fee waived");
      qc.invalidateQueries({ queryKey: ["admin", "loan-penalties"] });
      qc.invalidateQueries({ queryKey: ["admin", "loan-arrears"] });
      setNote("");
      onClose();
    },
    onError: (e: Error) => toast.error("Waiver failed", { description: e.message }),
  });

  return (
    <Dialog open={penalty !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Waive late fee</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            {penalty ? `${penalty.loan_ref ?? ""} · ${formatMoney(penalty.amount)} · ${penalty.days_late} days late` : ""}
          </p>
          <Label>Waiver reason (required)</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Approved hardship relief" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={mutation.isPending || note.trim().length < 5} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Waiving…" : "Waive fee"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
