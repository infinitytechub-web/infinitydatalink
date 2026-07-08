import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard } from "@/components/primitives";
import { getOrgConfig } from "@/lib/org-config";

export const Route = createFileRoute("/_member/app/payments")({
  component: PaymentsPage,
});

function PaymentsPage() {
  const cfg = getOrgConfig();
  return (
    <>
      <PageHeader
        eyebrow="Member portal"
        title="Payments"
        description="Deposits, withdrawals, transfers and loan repayments across every rail."
      />

      <div className="grid gap-6 md:grid-cols-3">
        {[
          { title: "Mobile Money", desc: cfg.momoProviders.join(" · ") || "Local MoMo rails" },
          { title: "Bank Transfers", desc: "Instant · Same-day · International" },
          { title: "Cards", desc: "Visa · Mastercard · Verve" },
        ].map((r) => (
          <div key={r.title} className="rounded border border-emerald-deep/5 bg-card p-6 shadow-sm">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-emerald-deep/50">
              {r.title}
            </p>
            <p className="font-serif text-lg text-emerald-deep">{r.desc}</p>
            <button className="mt-4 rounded bg-emerald-deep px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-cream hover:bg-emerald-mid">
              Initiate payment
            </button>
          </div>
        ))}
      </div>

      <SectionCard title="Saved beneficiaries">
        <div className="divide-y divide-emerald-deep/5">
          {["Ama Serwaa · MTN 024-XXX-4421", "Kojo Antwi · GCB 1023-****-8812", "Family Trust · Fidelity 4402-****-1190"].map((b) => (
            <div key={b} className="flex items-center justify-between p-4">
              <p className="text-sm">{b}</p>
              <button className="text-[11px] font-semibold uppercase tracking-widest text-emerald-mid hover:underline">
                Pay
              </button>
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  );
}
