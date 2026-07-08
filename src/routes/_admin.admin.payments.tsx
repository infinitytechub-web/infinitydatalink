import { createFileRoute } from "@tanstack/react-router";
import { KPIStat, PageHeader, SectionCard } from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";

export const Route = createFileRoute("/_admin/admin/payments")({
  component: AdminPayments,
});

function AdminPayments() {
  return (
    <>
      <PageHeader eyebrow="Administrator" title="Payments" description="Rails, providers and volume across MoMo, bank, and cards." />
      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat label="24h volume" value={<>GH₵ <span className="tabular">218K</span></>} />
        <KPIStat label="MoMo transactions" value={<span className="tabular">1,142</span>} />
        <KPIStat label="Bank transfers" value={<span className="tabular">318</span>} />
        <KPIStat label="Failed" value={<span className="tabular">12</span>} accent />
      </section>
      <SectionCard title="Providers">
        <div className="grid gap-4 p-6 md:grid-cols-3">
          {["MTN MoMo", "Vodafone Cash", "AirtelTigo Money", "GCB Bank", "Fidelity Bank", "Visa / Mastercard"].map((p) => (
            <div key={p} className="rounded border border-emerald-deep/5 bg-cream/30 p-4">
              <p className="font-serif text-lg">{p}</p>
              <p className="text-[11px] uppercase tracking-widest text-emerald-mid">Connected</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  );
}
