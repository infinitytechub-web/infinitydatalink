import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useMemo } from "react";
import { useSuspenseQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { ErrorState, PageHeader, KPIStat, SectionCard, SectionCardSkeleton } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { adminRunHealthCheck, type ProbeResult, type HealthReport } from "@/lib/admin-health.functions";

const healthQuery = queryOptions({
  queryKey: ["admin", "health"],
  queryFn: () => adminRunHealthCheck(),
  staleTime: 0,
});

export const Route = createFileRoute("/_admin/admin/health")({
  head: () => ({
    meta: [
      { title: "Integration Health Check — Administrator" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(healthQuery);
  },
  component: Page,
  errorComponent: ({ error }) => (
    <div className="p-6">
      <ErrorState title="Failed to load health check" message={error.message} />
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm text-emerald-deep/70">Not found.</div>,
});

function Page() {
  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Integration Health Check"
        description="Live probes verify that schema relationships, tables, and privileged RPCs are reachable through the Data API."
      />
      <Suspense fallback={<SectionCardSkeleton title="Running probes" rows={8} cols={4} />}>
        <Body />
      </Suspense>
    </>
  );
}

function Body() {
  const { data } = useSuspenseQuery(healthQuery);
  const qc = useQueryClient();
  const groups = useMemo(() => groupByCategory(data.results), [data.results]);
  const ranAt = new Date(data.ran_at).toLocaleString();
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPIStat label="Probes run" value={String(data.total)} sub={`As of ${ranAt}`} />
        <KPIStat label="Passed" value={String(data.passed)} sub="Reachable through PostgREST" />
        <KPIStat label="Failed" value={String(data.failed)} sub={data.failed === 0 ? "All green" : "Needs attention"} tone={data.failed === 0 ? "positive" : "critical"} />
      </div>

      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ["admin", "health"] })}
        >
          <RefreshCw className="mr-2 h-4 w-4" /> Re-run probes
        </Button>
      </div>

      {(["relationship", "table", "rpc"] as const).map((cat) => (
        <SectionCard key={cat} title={LABELS[cat]} description={DESCRIPTIONS[cat]}>
          <ProbeTable results={groups[cat] ?? []} />
        </SectionCard>
      ))}
    </div>
  );
}

const LABELS: Record<ProbeResult["category"], string> = {
  relationship: "Foreign-key relationships",
  table: "Table reachability",
  rpc: "Privileged RPCs",
};
const DESCRIPTIONS: Record<ProbeResult["category"], string> = {
  relationship: "Each row runs a PostgREST embed query against the named foreign key. A failure means the UI cannot join these tables.",
  table: "A HEAD-count query per table proves the Data API grants and RLS policies permit reads for your role.",
  rpc: "Verifies that SECURITY DEFINER helpers are exposed and callable.",
};

function groupByCategory(rows: ProbeResult[]): Record<ProbeResult["category"], ProbeResult[]> {
  const out: Record<ProbeResult["category"], ProbeResult[]> = { relationship: [], table: [], rpc: [] };
  for (const r of rows) out[r.category].push(r);
  return out;
}

function ProbeTable({ results }: { results: ProbeResult[] }) {
  if (results.length === 0) return <p className="text-sm text-emerald-deep/60">No probes.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-emerald-deep/60">
          <tr>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Probe</th>
            <th className="py-2 pr-4">Detail</th>
            <th className="py-2 pr-4">Duration</th>
            <th className="py-2">Error</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-emerald-deep/10">
          {results.map((r) => (
            <tr key={r.id}>
              <td className="py-2 pr-4">
                {r.status === "pass" ? (
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Pass
                  </Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                    <XCircle className="mr-1 h-3 w-3" /> Fail
                  </Badge>
                )}
              </td>
              <td className="py-2 pr-4 font-medium">{r.name}</td>
              <td className="py-2 pr-4 text-emerald-deep/70">{r.detail}</td>
              <td className="py-2 pr-4 text-emerald-deep/60 tabular-nums">{r.duration_ms} ms</td>
              <td className="py-2 text-red-700 font-mono text-xs break-all">{r.error ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type { HealthReport };
