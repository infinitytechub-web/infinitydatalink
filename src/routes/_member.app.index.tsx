import { createFileRoute } from "@tanstack/react-router";
import { KPIStat, Money, StatusPill } from "@/components/primitives";

export const Route = createFileRoute("/_member/app/")({
  component: Dashboard,
});

const transactions = [
  { icon: "S", label: "Monthly Share Contribution", ref: "REF-902341", date: "Sep 28, 2025", amount: 2500, kind: "Savings Wallet", status: "cleared" as const },
  { icon: "L", label: "Business Expansion Loan Repayment", ref: "REF-812399", date: "Sep 15, 2025", amount: -1200, kind: "Direct Debit", status: "cleared" as const },
  { icon: "I", label: "Quarterly Dividend Payout", ref: "DIV-440212", date: "Sep 10, 2025", amount: 8420, kind: "Investment Account", status: "cleared" as const },
  { icon: "M", label: "MTN Mobile Money Deposit", ref: "MOMO-77812", date: "Sep 05, 2025", amount: 500, kind: "Wallet", status: "pending" as const },
];

function Dashboard() {
  return (
    <>
      {/* KPI row */}
      <section className="grid gap-6 md:grid-cols-3">
        <KPIStat
          label="Total Net Worth"
          value={
            <>
              GH₵ <span className="tabular">242,500.00</span>
            </>
          }
          hint={
            <div className="flex items-center gap-2">
              <span className="rounded bg-emerald-mid/10 px-1.5 py-0.5 font-medium text-emerald-mid">+12.4%</span>
              <span>vs last month</span>
            </div>
          }
        />
        <KPIStat
          label="Active Loan Balance"
          value={
            <>
              GH₵ <span className="tabular">18,400.00</span>
            </>
          }
          hint={
            <>
              Next payment:{" "}
              <span className="tabular font-bold text-emerald-deep">GH₵ 1,200</span> on Oct 15
            </>
          }
        />
        <KPIStat
          label="Savings Goal: Real Estate"
          accent
          value={
            <>
              72%{" "}
              <span className="font-sans text-xs text-emerald-deep/50">Complete</span>
            </>
          }
          hint={
            <>
              <div className="mb-2 mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gold/20">
                <div className="h-full w-[72%] bg-gold" />
              </div>
              <span className="tabular">GH₵ 144,000 / GH₵ 200,000</span>
            </>
          }
        />
      </section>

      {/* Main grid */}
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Recent transactions */}
          <div className="overflow-hidden border border-emerald-deep/5 bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-emerald-deep/5 p-6">
              <h3 className="font-serif text-lg">Recent Transactions</h3>
              <button className="border-b border-emerald-mid/40 text-[10px] font-bold uppercase tracking-wider text-emerald-mid">
                View All Statement
              </button>
            </div>
            <div className="divide-y divide-emerald-deep/5">
              {transactions.map((t) => (
                <div key={t.ref} className="flex items-center justify-between p-4 transition-colors hover:bg-cream/30">
                  <div className="flex items-center gap-4">
                    <div className="flex size-10 items-center justify-center rounded bg-cream font-serif text-emerald-deep">
                      {t.icon}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{t.label}</p>
                      <p className="tabular text-[11px] text-emerald-deep/50">
                        {t.ref} • {t.date}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`tabular text-sm font-bold ${t.amount < 0 ? "text-destructive" : "text-emerald-mid"}`}>
                      <Money amount={t.amount} signed />
                    </p>
                    <p className="text-[10px] text-emerald-deep/40">{t.kind}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <QuickAction label="Deposit" variant="primary" />
            <QuickAction label="Withdraw" />
            <QuickAction label="Transfer" />
            <QuickAction label="Apply Loan" variant="gold" />
          </div>
        </div>

        {/* Right column */}
        <aside className="space-y-6">
          {/* AI insight */}
          <div className="relative overflow-hidden rounded bg-emerald-deep p-6 text-cream shadow-lg">
            <div className="pointer-events-none absolute right-0 top-0 p-8 opacity-10">
              <div className="font-serif text-8xl">AI</div>
            </div>
            <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
              Wealth Insight
            </p>
            <p className="mb-6 font-serif text-lg leading-relaxed">
              "Your current savings trajectory suggests you will meet your Real Estate goal{" "}
              <span className="text-gold">4 months earlier</span> than projected."
            </p>
            <div className="rounded bg-white/10 p-4 text-xs text-white/80">
              <p className="mb-2 font-medium">Recommendation</p>
              <p>Consider re-allocating GH₵ 500 from your low-yield checking to the high-yield Prosperity Fund.</p>
            </div>
            <button className="mt-6 w-full rounded bg-gold py-3 text-[10px] font-bold uppercase tracking-widest text-emerald-deep hover:opacity-90">
              Optimize Portfolio
            </button>
          </div>

          {/* Security */}
          <div className="rounded border border-emerald-deep/5 bg-card p-6 shadow-sm">
            <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/40">
              Account Security
            </p>
            <div className="flex items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-full bg-cream">
                <div className="size-4 rounded-full border-2 border-emerald-mid" />
              </div>
              <div>
                <p className="text-sm font-semibold">Identity Verified</p>
                <p className="text-[11px] text-emerald-deep/50">Level 3 verification complete</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-emerald-deep/5 pt-3 text-[11px] text-emerald-deep/60">
              <span>2FA</span>
              <StatusPill status="active" />
            </div>
          </div>

          {/* Upcoming repayment */}
          <div className="rounded border border-emerald-deep/5 bg-card p-6 shadow-sm">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/40">
              Upcoming Repayment
            </p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm font-semibold">Oct 15, 2025</p>
                <p className="text-[11px] text-emerald-deep/60">Business Expansion II</p>
              </div>
              <p className="tabular font-serif text-xl text-emerald-deep">GH₵ 1,200</p>
            </div>
            <button className="mt-4 w-full rounded bg-emerald-deep py-2.5 text-[10px] font-bold uppercase tracking-widest text-cream hover:bg-emerald-mid">
              Authorize Payment
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}

function QuickAction({ label, variant }: { label: string; variant?: "primary" | "gold" }) {
  const base = "flex flex-col items-center justify-center gap-3 rounded p-6 shadow-sm transition-transform hover:-translate-y-0.5";
  const style =
    variant === "primary"
      ? "bg-emerald-deep text-white"
      : variant === "gold"
        ? "bg-gold text-emerald-deep"
        : "border border-emerald-deep/10 bg-card text-emerald-deep";
  return (
    <button className={`${base} ${style}`}>
      <div className={`size-5 rounded-sm border-2 ${variant === "primary" ? "border-gold" : variant === "gold" ? "border-white/50" : "border-emerald-deep/20"}`} />
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
    </button>
  );
}
