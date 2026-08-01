import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
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
import { ExportBar } from "@/components/export-bar";
import { formatMoney } from "@/lib/org-config";
import { ARREARS_BUCKETS } from "@/lib/loan-arrears.functions";
import {
  DEFAULT_PROVISION_RATES,
  getProvisionReport,
  type ProvisionBucketRow,
  type ProvisionExposureRow,
} from "@/lib/loan-provisions.functions";

export const Route = createFileRoute("/_admin/admin/loan-provisions")({
  head: () => ({
    meta: [
      { title: "Loan Loss Provisioning — Portfolio Coverage" },
      {
        name: "description",
        content:
          "Expected credit loss provisioning by aging bucket and product, with configurable provision rates and coverage ratios.",
      },
      { property: "og:title", content: "Loan Loss Provisioning" },
      { property: "og:description", content: "Provision rates, coverage ratios and net exposure across the loan book." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProvisionsPage,
  errorComponent: ({ error }) => <PageError error={error} />,
});

function PageError({ error }: { error: Error }) {
  const router = useRouter();
  return (
    <div className="p-6">
      <ErrorState title="Provisioning report failed to load" message={error.message} onRetry={() => router.invalidate()} />
    </div>
  );
}

type Rates = typeof DEFAULT_PROVISION_RATES;

const reportQuery = (rates: Rates) =>
  queryOptions({
    queryKey: ["admin", "loan-provisions", rates],
    queryFn: () => getProvisionReport({ data: { rates, top: 25 } }),
  });

function ProvisionsPage() {
  const [rates, setRates] = useState<Rates>({ ...DEFAULT_PROVISION_RATES });
  const [draft, setDraft] = useState<Rates>({ ...DEFAULT_PROVISION_RATES });

  return (
    <>
      <PageHeader
        eyebrow="Loan governance"
        title="Loan loss provisioning"
        description="Classify the active book into aging buckets, apply provision rates and monitor coverage of expected credit losses."
      />

      <SectionCard title="Provision rate policy (% of outstanding)">
        <div className="grid gap-4 p-6 sm:grid-cols-3 lg:grid-cols-6">
          {ARREARS_BUCKETS.map((b) => (
            <div key={b}>
              <Label htmlFor={`rate-${b}`} className="text-[10px] uppercase tracking-widest">
                {b}
              </Label>
              <Input
                id={`rate-${b}`}
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={draft[b]}
                onChange={(e) => setDraft((prev) => ({ ...prev, [b]: Number(e.target.value) }))}
              />
            </div>
          ))}
          <div className="flex items-end gap-2">
            <Button onClick={() => setRates({ ...draft })}>Apply</Button>
            <Button
              variant="outline"
              onClick={() => {
                setDraft({ ...DEFAULT_PROVISION_RATES });
                setRates({ ...DEFAULT_PROVISION_RATES });
              }}
            >
              Reset
            </Button>
          </div>
        </div>
      </SectionCard>

      <Suspense
        fallback={
          <>
            <KPIGridSkeleton count={4} />
            <SectionCardSkeleton />
          </>
        }
      >
        <Body rates={rates} />
      </Suspense>
    </>
  );
}

function Body({ rates }: { rates: Rates }) {
  const { data } = useSuspenseQuery(reportQuery(rates));
  const t = data.totals;

  return (
    <>
      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat label="Gross outstanding" value={formatMoney(t.outstanding)} hint={`${t.loans} active loans`} />
        <KPIStat label="Required provision" value={formatMoney(t.provision)} accent hint={`Coverage ${t.coverage_pct}%`} />
        <KPIStat label="Net exposure" value={formatMoney(t.net_exposure)} hint="After provisions" />
        <KPIStat label="Portfolio at risk" value={`${t.par_pct}%`} hint={`Arrears ${formatMoney(t.arrears)} · written off ${formatMoney(t.written_off)}`} />
      </section>

      <SectionCard
        title="Provision by aging bucket"
        action={
          <ExportBar
            title="Loan loss provisioning by bucket"
            subtitle={`As of ${new Date(data.as_of).toLocaleString()}`}
            filename="loan-provisions-buckets"
            permission="export:loans"
            rows={data.buckets}
            columns={bucketColumns}
          />
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream text-[10px] uppercase tracking-widest text-emerald-deep/60">
              <tr>
                <th className="px-4 py-3 text-left">Bucket</th>
                <th className="px-4 py-3 text-right">Loans</th>
                <th className="px-4 py-3 text-right">Outstanding</th>
                <th className="px-4 py-3 text-right">Share</th>
                <th className="px-4 py-3 text-right">Arrears</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-right">Provision</th>
                <th className="px-4 py-3 text-right">Net exposure</th>
              </tr>
            </thead>
            <tbody>
              {data.buckets.map((b) => (
                <tr key={b.bucket} className="border-t border-emerald-deep/10">
                  <td className="px-4 py-3 font-semibold">{b.bucket}</td>
                  <td className="px-4 py-3 text-right">{b.loans}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(b.outstanding)}</td>
                  <td className="px-4 py-3 text-right">{b.share_pct}%</td>
                  <td className="px-4 py-3 text-right">{formatMoney(b.arrears)}</td>
                  <td className="px-4 py-3 text-right">{b.rate_pct}%</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatMoney(b.provision)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(b.net_exposure)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-emerald-deep/20 bg-cream/60 font-semibold">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right">{t.loans}</td>
                <td className="px-4 py-3 text-right">{formatMoney(t.outstanding)}</td>
                <td className="px-4 py-3 text-right">100%</td>
                <td className="px-4 py-3 text-right">{formatMoney(t.arrears)}</td>
                <td className="px-4 py-3 text-right">{t.coverage_pct}%</td>
                <td className="px-4 py-3 text-right">{formatMoney(t.provision)}</td>
                <td className="px-4 py-3 text-right">{formatMoney(t.net_exposure)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Provision by product">
        {data.products.length === 0 ? (
          <EmptyState title="No active loans" hint="Provisioning appears once loans are disbursed." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-cream text-[10px] uppercase tracking-widest text-emerald-deep/60">
                <tr>
                  <th className="px-4 py-3 text-left">Product</th>
                  <th className="px-4 py-3 text-right">Loans</th>
                  <th className="px-4 py-3 text-right">Outstanding</th>
                  <th className="px-4 py-3 text-right">Provision</th>
                  <th className="px-4 py-3 text-right">Coverage</th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((p) => (
                  <tr key={p.product} className="border-t border-emerald-deep/10">
                    <td className="px-4 py-3">{p.product}</td>
                    <td className="px-4 py-3 text-right">{p.loans}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(p.outstanding)}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(p.provision)}</td>
                    <td className="px-4 py-3 text-right">{p.coverage_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Largest provisioned exposures"
        action={
          <ExportBar
            title="Largest provisioned loan exposures"
            subtitle={`As of ${new Date(data.as_of).toLocaleString()}`}
            filename="loan-provisions-exposures"
            permission="export:loans"
            rows={data.exposures}
            columns={exposureColumns}
          />
        }
      >
        {data.exposures.length === 0 ? (
          <EmptyState title="Nothing to provision" hint="No active loans carry provisionable exposure." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-cream text-[10px] uppercase tracking-widest text-emerald-deep/60">
                <tr>
                  <th className="px-4 py-3 text-left">Loan</th>
                  <th className="px-4 py-3 text-left">Member</th>
                  <th className="px-4 py-3 text-left">Bucket</th>
                  <th className="px-4 py-3 text-right">DPD</th>
                  <th className="px-4 py-3 text-right">Outstanding</th>
                  <th className="px-4 py-3 text-right">Arrears</th>
                  <th className="px-4 py-3 text-right">Provision</th>
                </tr>
              </thead>
              <tbody>
                {data.exposures.map((e) => (
                  <tr key={e.id} className="border-t border-emerald-deep/10">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{e.ref}</div>
                      <div className="text-[11px] text-emerald-deep/50">{e.product}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{e.member_name ?? "—"}</div>
                      <div className="text-[11px] text-emerald-deep/50">{e.member_no ?? ""}</div>
                    </td>
                    <td className="px-4 py-3">{e.bucket}</td>
                    <td className="px-4 py-3 text-right">{e.days_past_due}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(e.outstanding)}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(e.arrears)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatMoney(e.provision)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}

const bucketColumns = [
  { header: "Bucket", accessor: (r: ProvisionBucketRow) => r.bucket },
  { header: "Loans", accessor: (r: ProvisionBucketRow) => r.loans },
  { header: "Outstanding", accessor: (r: ProvisionBucketRow) => r.outstanding },
  { header: "Share %", accessor: (r: ProvisionBucketRow) => r.share_pct },
  { header: "Arrears", accessor: (r: ProvisionBucketRow) => r.arrears },
  { header: "Rate %", accessor: (r: ProvisionBucketRow) => r.rate_pct },
  { header: "Provision", accessor: (r: ProvisionBucketRow) => r.provision },
  { header: "Net exposure", accessor: (r: ProvisionBucketRow) => r.net_exposure },
];

const exposureColumns = [
  { header: "Loan ref", accessor: (r: ProvisionExposureRow) => r.ref },
  { header: "Product", accessor: (r: ProvisionExposureRow) => r.product },
  { header: "Member", accessor: (r: ProvisionExposureRow) => r.member_name ?? "" },
  { header: "Member no", accessor: (r: ProvisionExposureRow) => r.member_no ?? "" },
  { header: "Bucket", accessor: (r: ProvisionExposureRow) => r.bucket },
  { header: "Days past due", accessor: (r: ProvisionExposureRow) => r.days_past_due },
  { header: "Outstanding", accessor: (r: ProvisionExposureRow) => r.outstanding },
  { header: "Arrears", accessor: (r: ProvisionExposureRow) => r.arrears },
  { header: "Provision", accessor: (r: ProvisionExposureRow) => r.provision },
];
