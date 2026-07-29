import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, FileText } from "lucide-react";
import { EmptyState, ErrorState, Money, PageHeader, SectionCard, SectionCardSkeleton } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getStatement, listMyStatements, type Statement } from "@/lib/savings-statements.functions";
import { formatMoney } from "@/lib/org-config";
import { StatementGenerator } from "@/components/statement-generator";

const statementsQuery = queryOptions({
  queryKey: ["member", "savings", "statements"],
  queryFn: () => listMyStatements({ data: {} }),
  staleTime: 30_000,
});

export const Route = createFileRoute("/_member/app/savings/statements")({
  head: () => ({
    meta: [
      { title: "Savings statements — IT-360 CashApp" },
      { name: "description", content: "Download monthly savings statements with interest and activity totals." },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(statementsQuery),
  component: StatementsPage,
  errorComponent: ({ error }) => (
    <div className="p-6"><ErrorState title="Statements unavailable" message={error.message} /></div>
  ),
});

function StatementsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Member portal"
        title="Statements"
        description="Monthly savings statements are generated after interest is accrued."
        action={
          <Link
            to="/app/savings"
            className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted"
          >
            Back to savings
          </Link>
        }
      />
      <div className="space-y-6">
        <StatementGenerator />
        <Suspense fallback={<SectionCardSkeleton title="Statements" rows={5} cols={6} />}>
          <Body />
        </Suspense>
      </div>
    </>
  );
}

function Body() {
  const { data: rows } = useSuspenseQuery(statementsQuery);
  if (rows.length === 0) {
    return (
      <SectionCard title="Statements">
        <div className="p-6">
          <EmptyState
            title="No statements yet"
            hint="Statements appear on the 1st of each month after interest is credited."
          />
        </div>
      </SectionCard>
    );
  }
  return (
    <SectionCard title="Statements">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
              <th className="px-6 py-3 font-medium">Period</th>
              <th className="px-6 py-3 font-medium">Account</th>
              <th className="px-6 py-3 text-right font-medium">Opening</th>
              <th className="px-6 py-3 text-right font-medium">Deposits</th>
              <th className="px-6 py-3 text-right font-medium">Withdrawals</th>
              <th className="px-6 py-3 text-right font-medium">Interest</th>
              <th className="px-6 py-3 text-right font-medium">Closing</th>
              <th className="px-6 py-3 text-right font-medium">Download</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-deep/5">
            {rows.map((s) => (
              <Row key={s.id} s={s} />
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function Row({ s }: { s: Statement }) {
  const [open, setOpen] = useState(false);
  return (
    <tr>
      <td className="px-6 py-3 text-sm">
        {new Date(s.period_start).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
        <div className="text-[11px] text-emerald-deep/50">
          {s.period_start} – {s.period_end}
        </div>
      </td>
      <td className="px-6 py-3 text-sm">
        <div className="font-semibold">{s.account_label}</div>
        <div className="text-[11px] text-emerald-deep/50">{s.plan_name}</div>
      </td>
      <td className="px-6 py-3 text-right"><Money amount={s.opening_balance} /></td>
      <td className="px-6 py-3 text-right"><Money amount={s.deposits_total} /></td>
      <td className="px-6 py-3 text-right"><Money amount={s.withdrawals_total} /></td>
      <td className="px-6 py-3 text-right text-emerald-mid"><Money amount={s.interest_credited} /></td>
      <td className="px-6 py-3 text-right font-semibold"><Money amount={s.closing_balance} /></td>
      <td className="px-6 py-3 text-right">
        <Button size="sm" variant="outline" className="gap-1" onClick={() => setOpen(true)}>
          <FileText className="h-3.5 w-3.5" /> View
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{s.account_label} — {s.period_start} to {s.period_end}</DialogTitle></DialogHeader>
            <StatementDetail id={s.id} />
          </DialogContent>
        </Dialog>
      </td>
    </tr>
  );
}

function StatementDetail({ id }: { id: string }) {
  const getFn = useServerFn(getStatement);
  const { data, isLoading, error } = useQuery({
    queryKey: ["member", "statement", id],
    queryFn: () => getFn({ data: { id } }),
    staleTime: 60_000,
  });
  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
  if (error) return <div className="p-4 text-sm text-destructive">{(error as Error).message}</div>;
  if (!data) return null;
  const { statement, lines } = data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/30 p-3 text-xs sm:grid-cols-4">
        <Stat label="Opening" val={statement.opening_balance} />
        <Stat label="Deposits" val={statement.deposits_total} />
        <Stat label="Withdrawals" val={statement.withdrawals_total} />
        <Stat label="Interest" val={statement.interest_credited} />
      </div>
      <div className="max-h-64 overflow-y-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/40 text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Ref</th>
              <th className="px-3 py-2 text-left">Kind</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-1.5 text-muted-foreground">{new Date(l.created_at).toLocaleDateString()}</td>
                <td className="px-3 py-1.5 font-mono">{l.ref}</td>
                <td className="px-3 py-1.5 capitalize">{l.kind}</td>
                <td className="px-3 py-1.5 text-right"><Money amount={l.amount} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => downloadCSV(statement, lines)}>
          <Download className="mr-1 h-3.5 w-3.5" /> CSV
        </Button>
        <Button size="sm" variant="outline" onClick={() => downloadPDF(statement, lines).catch((e) => toast.error(e.message))}>
          <Download className="mr-1 h-3.5 w-3.5" /> PDF
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, val }: { label: string; val: number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-semibold"><Money amount={val} /></div>
    </div>
  );
}

function csvCell(v: string | number) {
  const s = String(v);
  if (/^[=+\-@]/.test(s)) return `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function downloadCSV(s: Statement, lines: Array<{ ref: string; kind: string; amount: number; status: string; channel: string | null; note: string | null; created_at: string }>) {
  const rows = [
    ["Statement", s.account_label],
    ["Period", `${s.period_start} to ${s.period_end}`],
    ["Opening", s.opening_balance],
    ["Deposits", s.deposits_total],
    ["Withdrawals", s.withdrawals_total],
    ["Interest", s.interest_credited],
    ["Closing", s.closing_balance],
    [],
    ["Date", "Ref", "Kind", "Amount", "Status", "Channel", "Note"],
    ...lines.map((l) => [l.created_at, l.ref, l.kind, l.amount, l.status, l.channel ?? "", l.note ?? ""]),
  ];
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `statement-${s.period_start}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadPDF(s: Statement, lines: Array<{ ref: string; kind: string; amount: number; created_at: string }>) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text("Savings Statement", 14, 20);
  doc.setFontSize(11);
  doc.text(`Account: ${s.account_label}`, 14, 30);
  doc.text(`Period: ${s.period_start} to ${s.period_end}`, 14, 37);
  doc.text(`Opening: ${formatMoney(s.opening_balance)}`, 14, 47);
  doc.text(`Deposits: ${formatMoney(s.deposits_total)}`, 14, 54);
  doc.text(`Withdrawals: ${formatMoney(s.withdrawals_total)}`, 14, 61);
  doc.text(`Interest: ${formatMoney(s.interest_credited)}`, 14, 68);
  doc.text(`Closing: ${formatMoney(s.closing_balance)}`, 14, 75);
  doc.setFontSize(9);
  let y = 90;
  doc.text("Date", 14, y);
  doc.text("Ref", 50, y);
  doc.text("Kind", 100, y);
  doc.text("Amount", 160, y);
  y += 5;
  for (const l of lines) {
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
    doc.text(new Date(l.created_at).toLocaleDateString(), 14, y);
    doc.text(l.ref, 50, y);
    doc.text(l.kind, 100, y);
    doc.text(formatMoney(l.amount), 160, y);
    y += 5;
  }
  doc.save(`statement-${s.period_start}.pdf`);
}
