import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { EmptyState, KPIStat, SectionCard, SectionCardSkeleton } from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";
import { Pagination } from "@/components/table-controls";
import type { ExportColumn } from "@/lib/exports";
import { listUploadScans, type UploadScan } from "@/lib/security-centre.functions";

const search = z.object({
  verdict: fallback(z.enum(["all", "clean", "blocked", "quarantined"]), "all").default("all"),
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
  q: fallback(z.string(), "").default(""),
  page: fallback(z.number().int(), 1).default(1),
  pageSize: fallback(z.number().int(), 25).default(25),
});
type SearchInput = z.infer<typeof search>;

export const Route = createFileRoute("/_admin/admin/security/uploads")({
  validateSearch: zodValidator(search),
  component: UploadsPage,
});

const scansQuery = (s: SearchInput) =>
  queryOptions({
    queryKey: ["admin", "security", "uploads", s],
    queryFn: () =>
      listUploadScans({
        data: {
          verdict: s.verdict,
          from: s.from ? new Date(s.from).toISOString() : undefined,
          to: s.to ? new Date(new Date(s.to).getTime() + 86_400_000 - 1).toISOString() : undefined,
          q: s.q.trim() || undefined,
          page: Math.max(1, s.page),
          pageSize: Math.min(200, Math.max(5, s.pageSize)),
        },
      }),
  });

const VERDICT_STYLE: Record<string, string> = {
  clean: "bg-emerald-mid/10 text-emerald-mid",
  blocked: "bg-destructive/10 text-destructive",
  quarantined: "bg-gold/15 text-gold",
};

const columns: ExportColumn<UploadScan>[] = [
  { header: "Scanned (UTC)", accessor: (r) => new Date(r.created_at).toISOString() },
  { header: "File", accessor: (r) => r.filename },
  { header: "Uploader", accessor: (r) => r.uploader },
  { header: "MIME", accessor: (r) => r.mime_type ?? "" },
  { header: "Size (KB)", accessor: (r) => (r.size_bytes ? Math.round(r.size_bytes / 1024) : ""), align: "right" },
  { header: "Verdict", accessor: (r) => r.verdict.toUpperCase() },
  { header: "Reasons", accessor: (r) => r.reasons.join("; ") },
];

function sizeLabel(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadsPage() {
  return (
    <Suspense fallback={<SectionCardSkeleton title="Upload scan results" rows={8} cols={6} />}>
      <Content />
    </Suspense>
  );
}

function Content() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data } = useSuspenseQuery(scansQuery(s));
  const setSearch = (patch: Partial<SearchInput>) =>
    navigate({ search: (prev: SearchInput) => ({ ...prev, ...patch, page: patch.page ?? 1 }) });

  const field =
    "rounded border border-emerald-deep/15 bg-card px-3 py-2 text-xs text-emerald-deep focus:outline-none focus:ring-2 focus:ring-emerald-mid/30";

  return (
    <div className="space-y-6">
      <section className="grid gap-6 md:grid-cols-4">
        <KPIStat label="Files scanned" value={<span className="tabular">{data.kpis.scanned}</span>} />
        <KPIStat label="Blocked" value={<span className="tabular">{data.kpis.blocked}</span>} accent />
        <KPIStat label="Quarantined" value={<span className="tabular">{data.kpis.quarantined}</span>} />
        <KPIStat
          label="Scanner"
          value={
            <span className="inline-flex items-center gap-2 text-base">
              {data.scanning_enabled ? (
                <>
                  <ShieldCheck className="h-4 w-4 text-emerald-mid" /> Active
                </>
              ) : (
                <>
                  <ShieldOff className="h-4 w-4 text-destructive" /> Disabled
                </>
              )}
            </span>
          }
          hint={`Max ${data.policy.max_upload_mb} MB`}
        />
      </section>

      <SectionCard title="Upload policy in force">
        <div className="grid gap-4 p-6 text-sm md:grid-cols-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-deep/45">Size ceiling</p>
            <p className="tabular font-semibold">{data.policy.max_upload_mb} MB</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-deep/45">Executables</p>
            <p className="font-semibold">{data.policy.block_executables ? "Blocked" : "Allowed"}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-deep/45">Accepted types</p>
            <p className="text-xs text-emerald-deep/70">
              {data.policy.allowed_upload_mime.length ? data.policy.allowed_upload_mime.join(", ") : "Any"}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Scan results"
        action={
          <ExportBar
            permission="export:security"
            title="Upload Scan Results"
            subtitle={`${data.rows.length} scan(s) on this page`}
            filename="upload_scans"
            columns={columns}
            rows={data.rows}
          />
        }
      >
        <div className="flex flex-wrap items-end gap-3 border-b border-emerald-deep/5 px-6 py-4">
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/50">
            Verdict
            <select
              className={field}
              value={s.verdict}
              onChange={(e) => setSearch({ verdict: e.target.value as SearchInput["verdict"] })}
            >
              <option value="all">All</option>
              <option value="clean">Clean</option>
              <option value="blocked">Blocked</option>
              <option value="quarantined">Quarantined</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/50">
            From
            <input type="date" className={field} value={s.from} onChange={(e) => setSearch({ from: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/50">
            To
            <input type="date" className={field} value={s.to} onChange={(e) => setSearch({ to: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/50">
            Filename
            <input className={field} value={s.q} onChange={(e) => setSearch({ q: e.target.value })} placeholder="search" />
          </label>
        </div>

        {data.rows.length === 0 ? (
          <EmptyState title="No scan results" hint="No uploads match the current filters." />
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
                  <th className="px-6 py-3 font-medium">Scanned</th>
                  <th className="px-6 py-3 font-medium">File</th>
                  <th className="px-6 py-3 font-medium">Uploader</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 text-right font-medium">Size</th>
                  <th className="px-6 py-3 font-medium">Verdict</th>
                  <th className="px-6 py-3 font-medium">Findings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-deep/5">
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="tabular px-6 py-4 text-xs text-emerald-deep/70">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="max-w-[16rem] truncate px-6 py-4 text-sm font-semibold" title={r.filename}>
                      {r.filename}
                    </td>
                    <td className="px-6 py-4 text-sm">{r.uploader}</td>
                    <td className="px-6 py-4 text-xs text-emerald-deep/60">{r.mime_type ?? "—"}</td>
                    <td className="tabular px-6 py-4 text-right text-xs">{sizeLabel(r.size_bytes)}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          VERDICT_STYLE[r.verdict] ?? "bg-cream text-emerald-deep/70"
                        }`}
                      >
                        {r.verdict}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-emerald-deep/60">
                      {r.reasons.length ? r.reasons.join(", ") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={s.page}
              pageSize={s.pageSize}
              total={data.total}
              onPage={(n) => setSearch({ page: n })}
              onPageSize={(n) => setSearch({ pageSize: n, page: 1 })}
            />
          </>
        )}
      </SectionCard>
    </div>
  );
}
