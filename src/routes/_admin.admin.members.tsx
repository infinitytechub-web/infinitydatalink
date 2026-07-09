import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { PageHeader, SectionCard, StatusPill } from "@/components/primitives";
import { ExportBar } from "@/components/export-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { listKycQueue, type KycQueueRow } from "@/lib/admin-kyc.functions";

const search = z.object({
  status: fallback(z.enum(["all", "pending", "active", "rejected"]), "pending").default("pending"),
  q: fallback(z.string(), "").default(""),
  page: fallback(z.number().int().min(1), 1).default(1),
});
type SearchInput = z.infer<typeof search>;

const PAGE_SIZE = 25;

const queueQuery = (s: SearchInput) =>
  queryOptions({
    queryKey: ["admin", "kyc", "queue", s.status, s.q, s.page],
    queryFn: () =>
      listKycQueue({
        data: { status: s.status, q: s.q || undefined, page: s.page, page_size: PAGE_SIZE },
      }),
    staleTime: 15_000,
  });

export const Route = createFileRoute("/_admin/admin/members")({
  validateSearch: zodValidator(search),
  head: () => ({ meta: [{ title: "Members — KYC Queue" }, { name: "robots", content: "noindex" }] }),
  component: MembersPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Members failed to load: {error.message}</div>
  ),
});

function MembersPage() {
  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Membership & KYC"
        description="Review member identity submissions and manage the compliance queue."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <MembersBody />
      </Suspense>
    </>
  );
}

function MembersBody() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data } = useSuspenseQuery(queueQuery(s));

  const setSearch = (patch: Partial<SearchInput>) =>
    navigate({ search: (prev: SearchInput) => ({ ...prev, page: 1, ...patch }) });

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <SectionCard
      title="Directory"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <input
            defaultValue={s.q}
            placeholder="Search name, member no., national ID…"
            onKeyDown={(e) => {
              if (e.key === "Enter") setSearch({ q: (e.target as HTMLInputElement).value });
            }}
            className="w-64 rounded border border-emerald-deep/15 bg-card px-3 py-1.5 text-xs outline-none focus:border-emerald-mid"
          />
          <div className="inline-flex rounded border border-emerald-deep/15 bg-card p-0.5 text-[10px] uppercase tracking-widest">
            {(["all", "pending", "active", "rejected"] as const).map((st) => (
              <button
                key={st}
                onClick={() => setSearch({ status: st })}
                className={`rounded px-2.5 py-1 font-bold ${
                  s.status === st ? "bg-emerald-deep text-cream" : "text-emerald-deep/70 hover:bg-cream/50"
                }`}
              >
                {st}
              </button>
            ))}
          </div>
          <ExportBar
            permission="export:members"
            title="Membership Directory"
            subtitle={`${data.total} member${data.total === 1 ? "" : "s"} · ${s.status}`}
            filename={`members_${s.status}`}
            columns={[
              { header: "Member No", accessor: (m: KycQueueRow) => m.member_no ?? "—" },
              { header: "Name", accessor: (m) => m.full_name ?? "—" },
              { header: "Region", accessor: (m) => m.region ?? "—" },
              { header: "Phone", accessor: (m) => m.phone ?? "—" },
              { header: "National ID", accessor: (m) => m.national_id ?? "—" },
              { header: "KYC", accessor: (m) => m.kyc },
              { header: "Pending docs", accessor: (m) => m.pending_docs, align: "right" },
            ]}
            rows={data.rows}
          />
        </div>
      }
    >
      <table className="w-full">
        <thead>
          <tr className="border-b border-emerald-deep/5 text-left text-[10px] uppercase tracking-widest text-emerald-deep/40">
            <th className="px-6 py-3 font-medium">Member</th>
            <th className="px-6 py-3 font-medium">Region</th>
            <th className="px-6 py-3 font-medium">Phone</th>
            <th className="px-6 py-3 text-right font-medium">Docs</th>
            <th className="px-6 py-3 text-right font-medium">Last activity</th>
            <th className="px-6 py-3 text-right font-medium">KYC</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-emerald-deep/5">
          {data.rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-6 py-10 text-center text-sm text-emerald-deep/50">
                No members match these filters.
              </td>
            </tr>
          ) : (
            data.rows.map((m) => (
              <tr key={m.member_id} className="cursor-pointer hover:bg-cream/30">
                <td className="px-6 py-4 text-sm">
                  <Link
                    to="/admin/members/$id"
                    params={{ id: m.member_id }}
                    className="block"
                  >
                    <div className="font-semibold">{m.full_name ?? "—"}</div>
                    <div className="tabular text-[11px] text-emerald-deep/50">{m.member_no ?? ""}</div>
                  </Link>
                </td>
                <td className="px-6 py-4 text-sm text-emerald-deep/60">{m.region ?? "—"}</td>
                <td className="px-6 py-4 text-sm tabular text-emerald-deep/60">{m.phone ?? "—"}</td>
                <td className="tabular px-6 py-4 text-right text-sm">
                  {m.pending_docs > 0 ? (
                    <span className="rounded bg-gold/10 px-2 py-0.5 text-[10px] font-bold text-gold">
                      {m.pending_docs} pending
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-6 py-4 text-right text-[11px] text-emerald-deep/50">
                  {m.last_document_at ? new Date(m.last_document_at).toLocaleDateString() : "—"}
                </td>
                <td className="px-6 py-4 text-right">
                  <StatusPill status={m.kyc as any} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="flex items-center justify-between border-t border-emerald-deep/5 px-6 py-3 text-[11px] text-emerald-deep/60">
        <span>
          Page {s.page} of {totalPages} · {data.total} total
        </span>
        <div className="flex gap-1">
          <button
            disabled={s.page <= 1}
            onClick={() => navigate({ search: (p: SearchInput) => ({ ...p, page: Math.max(1, p.page - 1) }) })}
            className="rounded border border-emerald-deep/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest hover:bg-cream disabled:opacity-40"
          >
            Prev
          </button>
          <button
            disabled={s.page >= totalPages}
            onClick={() => navigate({ search: (p: SearchInput) => ({ ...p, page: p.page + 1 }) })}
            className="rounded border border-emerald-deep/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest hover:bg-cream disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </SectionCard>
  );
}
