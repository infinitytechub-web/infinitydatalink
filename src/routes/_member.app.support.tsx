import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard } from "@/components/primitives";

const FAQS: Array<[string, string]> = [
  ["How do I change my savings schedule?", "Open your savings account and update the contribution frequency or amount; changes take effect on the next scheduled run."],
  ["How long does a loan application take?", "Most complete applications receive a decision within 2–3 business days after KYC and required documents are verified."],
  ["How do I link a mobile money account?", "Go to Payments, choose Add method, select your mobile money provider, and confirm the one-time verification code."],
  ["How is interest calculated on my savings?", "Interest accrues daily on your cleared balance and is credited monthly based on your plan's published rate."],
];

export const Route = createFileRoute("/_member/app/support")({
  head: () => ({
    meta: [
      { title: "Help & Support — IT-360 CashApp" },
      {
        name: "description",
        content:
          "Get help with your IT-360 CashApp account: live chat, WhatsApp, tickets, and answers to common savings, loans, and payments questions.",
      },
      { name: "robots", content: "noindex" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQS.map(([q, a]) => ({
            "@type": "Question",
            name: q,
            acceptedAnswer: { "@type": "Answer", text: a },
          })),
        }),
      },
    ],
  }),
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
          {FAQS.map(([q, a]) => (
            <details key={q} className="group p-4">
              <summary className="cursor-pointer list-none text-sm font-semibold marker:hidden">
                <span className="mr-2 text-gold">＋</span>
                {q}
              </summary>
              <p className="mt-2 pl-6 text-sm text-emerald-deep/60">{a}</p>
            </details>
          ))}
        </div>
      </SectionCard>
    </>
  );
}
