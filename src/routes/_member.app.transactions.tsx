import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Money, PageHeader, SectionCard, StatusPill } from "@/components/primitives";

export const Route = createFileRoute("/_member/app/transactions")({
  component: TxPage,
});

const all = [
  { ref: "REF-902341", label: "Monthly Share Contribution", date: "Sep 28, 2025", amount: 2500, channel: "Savings Wallet", status: "cleared" as const },
  { ref: "REF-812399", label: "Business Loan Repayment", date: "Sep 15, 2025", amount: -1200, channel: "Direct Debit", status: "cleared" as const },
  { ref: "DIV-440212", label: "Quarterly Dividend Payout", date: "Sep 10, 2025", amount: 8420, channel: "Investment Account", status: "cleared" as const },
  { ref: "MOMO-77812", label: "MTN MoMo Deposit", date: "Sep 05, 2025", amount: 500, channel: "MTN Mobile Money", status: "pending" as const },
  { ref: "TRF-661201", label: "Transfer to Ama Serwaa", date: "Aug 30, 2025", amount: -300, channel: "Peer transfer", status: "cleared" as const },
];

function TxPage() {
  const [q, setQ] = useState("");
  const rows = all.filter((r) =>
    (r.label + r.ref + r.channel).toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        eyebrow="Member portal"
        title="Transactions"
        description="Search, filter and export your full ledger of deposits, withdrawals and transfers."
        action={
          <div className="flex gap-2">
            <button className="rounded border border-emerald-deep/15 bg-card px-3 py-2 text-[11px] font-semibold uppercase tracking-widest hover:bg-cream">
              Export CSV
            </button>
            <button className="rounded bg-emerald-deep px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-cream hover:bg-emerald-mid">
              Export PDF
            </button>
          </div>
        }
      />

      <SectionCard
        title="Ledger"
        action={
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search transactions…"
            className="rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs outline-none focus:border-emerald-mid"
          />
        }
      >
        <table className="w-full">
          <thead>
            <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
              <th className="px-6 py-3 font-medium">Reference</th>
              <th className="px-6 py-3 font-medium">Description</th>
              <th className="px-6 py-3 font-medium">Channel</th>
              <th className="px-6 py-3 font-medium">Date</th>
              <th className="px-6 py-3 text-right font-medium">Amount</th>
              <th className="px-6 py-3 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-deep/5">
            {rows.map((r) => (
              <tr key={r.ref} className="hover:bg-cream/30">
                <td className="tabular px-6 py-4 text-sm font-semibold">{r.ref}</td>
                <td className="px-6 py-4 text-sm">{r.label}</td>
                <td className="px-6 py-4 text-sm text-emerald-deep/60">{r.channel}</td>
                <td className="tabular px-6 py-4 text-sm">{r.date}</td>
                <td className={`px-6 py-4 text-right font-bold ${r.amount < 0 ? "text-destructive" : "text-emerald-mid"}`}>
                  <Money amount={r.amount} signed />
                </td>
                <td className="px-6 py-4 text-right"><StatusPill status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </>
  );
}
