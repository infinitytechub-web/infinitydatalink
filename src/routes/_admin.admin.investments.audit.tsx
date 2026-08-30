import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { EmptyState, PageHeader, SectionCard, SectionCardSkeleton } from "@/components/primitives";
import { Pagination } from "@/components/table-controls";
import { listDividendAudit, type DividendAuditEntry } from "@/lib/shares.functions";

const ACTIONS = [
  "all",
  "shares.product.create",
  "shares.product.update",
  "shares.dividend_run.preview",
  "shares.dividend_run.create",
  "shares.dividend_run.submit",
  "shares.dividend_run.approve",
  "shares.dividend_run.reject",
  "shares.dividend_run.cancel",
  "shares.dividend_run.execute",
] as const;

const search = z.object({
  action: fallback(z.enum(ACTIONS), "all").default("all"),
  target: fallback(z.string(), "").default(""),
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
  page: fallback(z.number().int(), 1).default(1),
  pageSize: fallback(z.number().int(), 50).default(50),
});
type S = z.infer<typeof search>;

export const Route = createFileRoute("/_admin/admin/investments/audit")({
  head: () => ({
    meta: [
      { title: "Dividend Audit Trail — Admin — IT-360 CashApp" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content:
          "Immutable audit trail for share product configuration and dividend run lifecycle events.",
      },
    ],
  }),
  validateSearch: zodValidator(search),
  component: Page,
});

const qo = (s: S) =>
  queryOptions({
    queryKey: ["admin", "dividend-audit", s],
    queryFn: () =>
      listDividendAudit({
        data: {
          action: s.action === "all" ? undefined : s.action,
          target: s.target.trim() || undefined,
          from: s.from ? new Date(s.from).toISOString() : undefined,
          to: s.to ? new Date(new Date(s.to).getTime() + 86_400_000 - 1).toISOString() : undefined,
          page: Math.max(1, s.page),
          pageSize: s.pageSize,
        },
      }),
  });

function Page() {
  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Dividend Audit Trail"
        description="Immutable record of share product configuration changes, dividend calculations, and run lifecycle actions."
      />
      <div className="mb-3 flex justify-end">
        <Link
          to="/admin/investments"
          className="rounded border border-emerald-deep/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-cream/50"
        >
          ← Back to Investments
        </Link>
      </div>
      <Suspense fallback={<SectionCardSkeleton title="Audit entries" rows={8} cols={5} />}>
        <Content />
      </Suspense>
    </>
  );
}

function Content() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data } = useSuspenseQuery(qo(s));
  const set = (patch: Partial<S>) =>
    navigate({ search: (prev: S) => ({ ...prev, ...patch, page: patch.page ?? 1 }) });

  return (
    <SectionCard title={`Events (${data.total})`}>
      <div className="flex flex-wrap items-end gap-3 border-b border-emerald-deep/5 bg-cream/30 px-6 py-4">
        <Field label="Action">
          <select
            value={s.action}
            onChange={(e) => set({ action: e.target.value as S["action"] })}
            className="rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs outline-none"
          >
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a === "all" ? "All actions" : a}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Target ID">
          <input
            value={s.target}
            onChange={(e) => set({ target: e.target.value })}
            placeholder="Run or product ID"
            className="w-64 rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs outline-none"
          />
        </Field>
        <Field label="From">
          <input
            type="date"
            value={s.from}
            onChange={(e) => set({ from: e.target.value })}
            className="rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs outline-none"
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            value={s.to}
            onChange={(e) => set({ to: e.target.value })}
            className="rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs outline-none"
          />
        </Field>
        {(s.action !== "all" || s.target || s.from || s.to) && (
          <button
            onClick={() =>
              navigate({
                search: {
                  action: "all",
                  target: "",
                  from: "",
                  to: "",
                  page: 1,
                  pageSize: s.pageSize,
                },
              })
            }
            className="rounded border border-emerald-deep/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-cream/50"
          >
            Reset
          </button>
        )}
      </div>

      {data.rows.length === 0 ? (
        <div className="p-6">
          <EmptyState
            title="No audit entries"
            hint="Configure a product or start a dividend run to see events."
          />
        </div>
      ) : (
        <>
          <table className="w-full">
            <thead>
              <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-6 py-3 font-medium">Timestamp</th>
                <th className="px-6 py-3 font-medium">Action</th>
                <th className="px-6 py-3 font-medium">Target</th>
                <th className="px-6 py-3 font-medium">Actor</th>
                <th className="px-6 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-deep/5">
              {data.rows.map((e: DividendAuditEntry) => (
                <tr key={e.id} className="align-top">
                  <td className="tabular px-6 py-4 text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-xs font-mono">{e.action}</td>
                  <td className="px-6 py-4 text-xs font-mono break-all max-w-[14rem]">
                    {e.target ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-xs">
                    <div className="font-medium">{e.actor_email ?? "—"}</div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {e.actor_role ?? "—"}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-[11px] max-w-lg">
                    <pre className="whitespace-pre-wrap break-all rounded bg-cream/40 p-2 font-mono text-muted-foreground">
                      {e.meta ? JSON.stringify(e.meta, null, 2) : "—"}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPage={(n) => set({ page: n })}
            onPageSize={(n) => set({ pageSize: n, page: 1 })}
          />
        </>
      )}
    </SectionCard>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
