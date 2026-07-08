import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard } from "@/components/primitives";

export const Route = createFileRoute("/_member/app/support")({
  component: SupportPage,
});

function SupportPage() {
  return (
    <>
      <PageHeader
        eyebrow="Support centre"
        title="Help & Support"
        description="Live chat, WhatsApp, FAQs and ticketing to help you get answers quickly."
      />

      <div className="grid gap-6 md:grid-cols-3">
        {[
          ["Live chat", "Speak to an agent in real time"],
          ["WhatsApp", "+233 55 000 0000"],
          ["Ticket", "Open a support ticket"],
        ].map(([t, d]) => (
          <div key={t} className="rounded border border-emerald-deep/5 bg-card p-6 shadow-sm">
            <p className="font-serif text-xl text-emerald-deep">{t}</p>
            <p className="mt-1 text-xs text-emerald-deep/60">{d}</p>
          </div>
        ))}
      </div>

      <SectionCard title="Frequently asked questions">
        <div className="divide-y divide-emerald-deep/5">
          {[
            "How do I change my savings schedule?",
            "How long does a loan application take?",
            "How do I link a mobile money account?",
            "How is interest calculated on my savings?",
          ].map((q) => (
            <details key={q} className="group p-4">
              <summary className="cursor-pointer list-none text-sm font-semibold marker:hidden">
                <span className="mr-2 text-gold">＋</span>
                {q}
              </summary>
              <p className="mt-2 pl-6 text-sm text-emerald-deep/60">
                We'll answer this once support content is wired to Lovable Cloud.
              </p>
            </details>
          ))}
        </div>
      </SectionCard>
    </>
  );
}
