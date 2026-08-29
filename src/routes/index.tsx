import { createFileRoute, Link } from "@tanstack/react-router";
import { useBranding } from "@/components/branding-provider";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IT-360 CashApp — Enterprise Financial Management Platform" },
      {
        name: "description",
        content:
          "One platform for savings, loans, payments, and investment — built for cooperatives, SACCOs, and membership organisations.",
      },
      { property: "og:title", content: "IT-360 CashApp — Enterprise Financial Management Platform" },
      {
        property: "og:description",
        content:
          "One platform for savings, loans, payments, and investment — built for cooperatives, SACCOs, and membership organisations.",
      },
      { property: "og:url", content: "https://infinity-wealth360.lovable.app/" },
      {
        property: "og:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/oKYJ4nzjn7abpsUlqLaAW6BjMb12/social-images/social-1783555926945-cyber_1.webp",
      },
      {
        name: "twitter:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/oKYJ4nzjn7abpsUlqLaAW6BjMb12/social-images/social-1783555926945-cyber_1.webp",
      },
    ],
    links: [{ rel: "canonical", href: "https://infinity-wealth360.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Service",
          serviceType: "Financial management platform",
          provider: { "@type": "Organization", name: "IT-360 CashApp" },
          areaServed: "Africa",
          description:
            "Savings, loans, payments, and investment management for cooperatives, SACCOs, and membership organisations.",
          hasOfferCatalog: {
            "@type": "OfferCatalog",
            name: "IT-360 CashApp modules",
            itemListElement: [
              { "@type": "Offer", itemOffered: { "@type": "Service", name: "Savings accounts & plans" } },
              { "@type": "Offer", itemOffered: { "@type": "Service", name: "Loan origination & servicing" } },
              { "@type": "Offer", itemOffered: { "@type": "Service", name: "Payments & reconciliation" } },
              { "@type": "Offer", itemOffered: { "@type": "Service", name: "Member KYC & compliance" } },
            ],
          },
        }),
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { branding } = useBranding();
  const appName = branding.app_name || "IT-360 CashApp";
  return (
    <div className="min-h-screen bg-cream font-sans text-emerald-deep">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          {branding.logo_url ? (
            <img
              src={branding.logo_url}
              alt={`${appName} logo`}
              className="size-8 shrink-0 rounded-sm object-contain"
            />
          ) : (
            <div className="flex size-8 items-center justify-center rounded-sm bg-emerald-deep">
              <div className="size-3 rotate-45 border-2 border-gold" />
            </div>
          )}
          <span className="font-serif text-lg">{appName}</span>
        </div>
        <Link
          to="/auth"
          className="rounded bg-emerald-deep px-4 py-2 text-xs font-semibold uppercase tracking-widest text-cream hover:bg-emerald-mid"
        >
          Sign in
        </Link>
      </header>

      <section className="mx-auto grid max-w-7xl gap-12 px-6 pb-24 pt-16 lg:grid-cols-2 lg:pt-24">
        <div>
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-brand-gold-ink dark:text-brand-gold">
            Enterprise financial platform
          </p>
          <h1 className="font-serif text-5xl leading-tight text-emerald-deep">
            Savings, loans & payments,
            <br />
            <span className="italic">managed with care.</span>
          </h1>
          <p className="mt-6 max-w-lg text-base text-muted-foreground">
            IT-360 CashApp is a secure, membership-first platform for cooperatives, SACCOs,
            savings & loans companies, and investment groups. Two portals, one source of truth.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/auth"
              className="rounded bg-emerald-deep px-6 py-3 text-xs font-semibold uppercase tracking-widest text-cream hover:bg-emerald-mid"
            >
              Enter your portal
            </Link>
            <a
              href="#modules"
              className="rounded border border-emerald-deep/20 bg-card px-6 py-3 text-xs font-semibold uppercase tracking-widest text-emerald-deep hover:bg-cream"
            >
              See what's inside
            </a>
          </div>
        </div>

        <div className="rounded-sm border border-emerald-deep/5 bg-card p-8 shadow-sm">
          <p className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Institutional summary · Sample
          </p>
          <div className="space-y-4">
            <div className="flex items-end justify-between border-b border-emerald-deep/5 pb-3">
              <span className="text-xs text-muted-foreground">Total members</span>
              <span className="font-serif text-xl">4,218</span>
            </div>
            <div className="flex items-end justify-between border-b border-emerald-deep/5 pb-3">
              <span className="text-xs text-muted-foreground">Assets under management</span>
              <span className="font-serif text-xl">GH₵ 12.4M</span>
            </div>
            <div className="flex items-end justify-between border-b border-emerald-deep/5 pb-3">
              <span className="text-xs text-muted-foreground">Active loans</span>
              <span className="font-serif text-xl">GH₵ 3.1M</span>
            </div>
            <div className="flex items-end justify-between">
              <span className="text-xs text-muted-foreground">Repayment rate</span>
              <span className="font-serif text-xl text-emerald-mid">98.2%</span>
            </div>
          </div>
        </div>
      </section>

      <section id="modules" className="border-t border-emerald-deep/10 bg-card">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-gold-ink dark:text-brand-gold">
            Everything a financial institution needs
          </p>
          <h2 className="mt-2 max-w-2xl font-serif text-3xl">
            A single platform for members, administrators, and auditors.
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              ["Membership", "Individual, group, department and institutional registration with full KYC."],
              ["Savings", "Daily to annual schedules, goals, interest and automated reminders."],
              ["Loans", "Applications, guarantors, multi-level approval, repayment tracking."],
              ["Payments", "Mobile money, bank transfers, card and international rails."],
              ["Security", "RBAC, audit logs, session monitoring, OWASP-aligned controls."],
              ["Analytics", "AI-assisted forecasts, default prediction and executive dashboards."],
              ["Notifications", "Email, push, and SMS-ready alerts across every event."],
              ["Compliance", "Print-ready statements, exports and archival workflows."],
            ].map(([title, desc]) => (
              <div key={title} className="border-l-2 border-gold/40 pl-4">
                <p className="font-serif text-lg text-emerald-deep">{title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-emerald-deep/10 bg-cream">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 text-[11px] text-muted-foreground">
          <span>© {new Date().getFullYear()} IT-360 CashApp</span>
          <span>Institutional-grade · Confidential</span>
        </div>
      </footer>
    </div>
  );
}
