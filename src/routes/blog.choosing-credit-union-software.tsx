import { createFileRoute, Link } from "@tanstack/react-router";

const CANONICAL = "https://infinitydatalink.lovable.app/blog/choosing-credit-union-software";
const TITLE = "How to Choose Credit Union Software (2026 Buyer's Guide)";
const DESCRIPTION =
  "A practical guide for credit unions, SACCOs and cooperatives: compare loan management, savings, KYC, mobile money and reporting features before you buy.";

export const Route = createFileRoute("/blog/choosing-credit-union-software")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: CANONICAL },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: TITLE,
          description: DESCRIPTION,
          mainEntityOfPage: { "@type": "WebPage", "@id": CANONICAL },
          publisher: { "@type": "Organization", name: "IT-360 CashApp" },
          articleSection: "Financial technology",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Home",
              item: "https://infinitydatalink.lovable.app/",
            },
            {
              "@type": "ListItem",
              position: 2,
              name: "Choosing credit union software",
              item: CANONICAL,
            },
          ],
        }),
      },
    ],
  }),
  component: GuidePage,
});

const CAPABILITIES: Array<{
  area: string;
  mustHave: string;
  niceToHave: string;
  redFlag: string;
}> = [
  {
    area: "Member records & KYC",
    mustHave:
      "National ID capture and validation, document uploads, reviewer notes, approval workflow",
    niceToHave: "Minor/guardian rules, risk flags, re-submission tracking",
    redFlag: "KYC handled in spreadsheets alongside the core system",
  },
  {
    area: "Savings",
    mustHave:
      "Multiple products, scheduled contributions, withdrawals with approval, interest posting",
    niceToHave: "Goals, fixed deposits, holds, group/Susu pots, sweep rules",
    redFlag: "Balances recalculated by hand or editable without an audit trail",
  },
  {
    area: "Loan management",
    mustHave:
      "Applications, eligibility checks, multi-level approval, disbursement, amortisation schedules",
    niceToHave:
      "Guarantors, collateral, arrears ageing, restructuring, provisioning, early settlement",
    redFlag: "No repayment schedule generated at disbursement",
  },
  {
    area: "Payments",
    mustHave: "Mobile money and bank transfer rails with reconciliation",
    niceToHave: "Card rails, multi-provider routing, retry and refund handling",
    redFlag: "Only manual receipt entry with no provider reconciliation",
  },
  {
    area: "Controls & audit",
    mustHave: "Role-based access, immutable audit log, mandatory decision notes",
    niceToHave:
      "Two-person approval for sensitive changes, step-up re-authentication, retention policies",
    redFlag: "Shared admin accounts, or audit entries staff can edit or delete",
  },
  {
    area: "Reporting",
    mustHave: "Member statements, trial balance / financial summaries, exportable CSV",
    niceToHave: "Executive dashboards, arrears and portfolio-at-risk views, forecasting",
    redFlag: "Reports only available on request from the vendor",
  },
];

const QUESTIONS: Array<[string, string]> = [
  [
    "Who owns our data, and how do we get it out?",
    "Ask for a written export path (CSV or database dump) you can run yourself, without paying an exit fee.",
  ],
  [
    "How are balances changed?",
    "Every balance movement should be a posted transaction, applied atomically, and traceable to a user and a timestamp.",
  ],
  [
    "What happens when a decision is wrong?",
    "Look for reversal and restore paths (recycle bin, archived records, corrective entries) rather than silent deletes.",
  ],
  [
    "Which local rails are supported?",
    "For West African cooperatives this usually means mobile money first, bank transfer second, cards third.",
  ],
  [
    "How is access separated?",
    "Front desk, loan officer, finance, compliance and super admin should not share one permission set.",
  ],
  [
    "What does the total cost look like at our size?",
    "Model licence plus per-member fees, payment provider charges, SMS/email costs, and implementation time.",
  ],
];

function GuidePage() {
  return (
    <div className="min-h-screen bg-cream font-sans text-emerald-deep">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-6 py-6">
        <Link to="/" className="font-serif text-lg">
          IT-360 CashApp
        </Link>
        <Link
          to="/auth"
          className="rounded bg-emerald-deep px-4 py-2 text-xs font-semibold uppercase tracking-widest text-cream hover:bg-emerald-mid"
        >
          Sign in
        </Link>
      </header>

      <article className="mx-auto max-w-4xl px-6 pb-24">
        <nav
          aria-label="Breadcrumb"
          className="mb-6 text-[11px] uppercase tracking-widest text-muted-foreground"
        >
          <Link to="/" className="hover:underline">
            Home
          </Link>
          <span className="mx-2">/</span>
          <span>Choosing credit union software</span>
        </nav>

        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-gold-ink dark:text-brand-gold">
          Buyer's guide
        </p>
        <h1 className="mt-2 font-serif text-4xl leading-tight">
          How to choose credit union software
        </h1>
        <p className="mt-5 text-base text-muted-foreground">
          Credit unions, SACCOs and savings &amp; loans cooperatives all run the same core loop:
          take in savings, lend responsibly, keep books that survive an audit. Software either makes
          that loop cheaper and safer, or it quietly adds reconciliation work. This guide is the
          evaluation framework we use when institutions move off spreadsheets or replace a legacy
          core — what to require, what to treat as optional, and what should end a conversation.
        </p>

        <section className="mt-12">
          <h2 className="font-serif text-2xl">
            1. Start from your operating model, not the feature list
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Write down, in one page: your savings products and their schedules, your loan products
            and approval levels, who may approve what, and which payment rails members actually use.
            Most failed implementations come from buying a product built for a different operating
            model — a retail bank core for a group-based Susu operation, or a micro-lending tool for
            an institution that also takes deposits. Score every vendor against your page, not
            against their demo script.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="font-serif text-2xl">2. Compare the six capability areas that matter</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Use this as a scoring sheet. Ask for a live demo of each must-have row using your own
            sample data — not a pre-seeded vendor account.
          </p>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <caption className="sr-only">
                Credit union software capability comparison: must-have features, optional features
                and warning signs by area
              </caption>
              <thead>
                <tr className="border-b border-emerald-deep/15 text-[11px] uppercase tracking-widest text-muted-foreground">
                  <th scope="col" className="py-3 pr-4">
                    Area
                  </th>
                  <th scope="col" className="py-3 pr-4">
                    Must have
                  </th>
                  <th scope="col" className="py-3 pr-4">
                    Nice to have
                  </th>
                  <th scope="col" className="py-3">
                    Red flag
                  </th>
                </tr>
              </thead>
              <tbody>
                {CAPABILITIES.map((row) => (
                  <tr key={row.area} className="border-b border-emerald-deep/5 align-top">
                    <th scope="row" className="py-4 pr-4 font-serif text-base font-normal">
                      {row.area}
                    </th>
                    <td className="py-4 pr-4 text-muted-foreground">{row.mustHave}</td>
                    <td className="py-4 pr-4 text-muted-foreground">{row.niceToHave}</td>
                    <td className="py-4 text-muted-foreground">{row.redFlag}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="font-serif text-2xl">3. Test the controls before the features</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Features win demos; controls decide whether your auditor signs off. Three tests are
            enough to separate serious platforms from the rest:
          </p>
          <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
            <li>
              <span className="font-semibold text-emerald-deep">
                Approve a loan as a junior officer.
              </span>{" "}
              The system should refuse, or route it for a second approval, and record the attempt.
            </li>
            <li>
              <span className="font-semibold text-emerald-deep">
                Change a member's KYC tier from a member account.
              </span>{" "}
              This must be impossible from the member portal, not merely hidden in the UI.
            </li>
            <li>
              <span className="font-semibold text-emerald-deep">
                Delete an audit entry as an administrator.
              </span>{" "}
              Deletion should either be blocked or move the record to a retained archive with its
              own log entry.
            </li>
          </ol>
        </section>

        <section className="mt-12">
          <h2 className="font-serif text-2xl">4. Six questions to send every vendor</h2>
          <dl className="mt-4 space-y-5">
            {QUESTIONS.map(([q, a]) => (
              <div key={q} className="border-l-2 border-gold/40 pl-4">
                <dt className="font-serif text-lg">{q}</dt>
                <dd className="mt-1 text-sm text-muted-foreground">{a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-12">
          <h2 className="font-serif text-2xl">5. Plan the migration, then the launch</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Budget for data cleaning before anything else: duplicate member records, missing ID
            numbers and unreconciled balances are the usual blockers. A workable sequence is to
            migrate member records and KYC first, then opening balances as posted transactions, then
            run the old and new systems in parallel for one full reporting cycle before switching
            off the old one. Keep a signed-off reconciliation for the cut-over date — it is the
            document your auditor will ask for.
          </p>
        </section>

        <section className="mt-12 rounded-sm border border-emerald-deep/10 bg-card p-8">
          <h2 className="font-serif text-2xl">Where IT-360 CashApp fits</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            IT-360 CashApp covers the six areas above in one platform: membership and KYC with
            reviewer workflows, savings products with scheduled contributions and interest posting,
            end-to-end loan origination and servicing with arrears and provisioning, mobile money
            and bank payment rails, plus role-based access, mandatory decision notes and an
            immutable audit log with retention policies. Members and administrators use separate
            portals over the same records.
          </p>
          <Link
            to="/auth"
            className="mt-6 inline-block rounded bg-emerald-deep px-6 py-3 text-xs font-semibold uppercase tracking-widest text-cream hover:bg-emerald-mid"
          >
            Enter your portal
          </Link>
        </section>
      </article>

      <footer className="border-t border-emerald-deep/10 bg-cream">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-6 text-[11px] text-muted-foreground">
          <span>© {new Date().getFullYear()} IT-360 CashApp</span>
          <Link to="/" className="hover:underline">
            Back to home
          </Link>
        </div>
      </footer>
    </div>
  );
}
