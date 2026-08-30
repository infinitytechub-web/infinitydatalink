import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, KPIStat, PageHeader, SectionCard } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Pagination, SortHeader, type SortState } from "@/components/table-controls";
import { SupportTicketThread, TicketPill } from "@/components/support-ticket-thread";
import {
  adminGetTicket,
  adminListAssignees,
  adminListTickets,
  adminReplyTicket,
  adminUpdateTicket,
} from "@/lib/support.functions";
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
  slaState,
  type SupportPriority,
  type SupportStatus,
} from "@/lib/support.shared";

type Search = {
  status: string;
  category: string;
  priority: string;
  assignee: "all" | "me" | "unassigned";
  search?: string;
  sort_by: "created_at" | "updated_at" | "priority" | "status";
  sort_dir: "asc" | "desc";
  page: number;
  page_size: number;
  ticket?: string;
};

const str = (v: unknown, fallback: string) => (typeof v === "string" && v ? v : fallback);
const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const Route = createFileRoute("/_admin/admin/support")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    status: str(s.status, "active"),
    category: str(s.category, "all"),
    priority: str(s.priority, "all"),
    assignee: (["all", "me", "unassigned"].includes(String(s.assignee))
      ? String(s.assignee)
      : "all") as Search["assignee"],
    search: typeof s.search === "string" && s.search ? s.search : undefined,
    sort_by: (["created_at", "updated_at", "priority", "status"].includes(String(s.sort_by))
      ? String(s.sort_by)
      : "created_at") as Search["sort_by"],
    sort_dir: s.sort_dir === "asc" ? "asc" : "desc",
    page: num(s.page, 1),
    page_size: num(s.page_size, 20),
    ticket: typeof s.ticket === "string" && s.ticket ? s.ticket : undefined,
  }),
  head: () => ({
    meta: [{ title: "Support queue — IT-360 CashApp" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminSupportPage,
});

function AdminSupportPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const listFn = useServerFn(adminListTickets);

  const query = useQuery({
    queryKey: ["admin-tickets", search],
    queryFn: () =>
      listFn({
        data: {
          status: search.status as never,
          category: search.category as never,
          priority: search.priority as never,
          assignee: search.assignee,
          search: search.search,
          sort_by: search.sort_by,
          sort_dir: search.sort_dir,
          page: search.page,
          page_size: search.page_size,
        },
      }),
    refetchInterval: 60_000,
  });

  const set = (patch: Partial<Search>) =>
    navigate({ search: (prev) => ({ ...prev, page: 1, ...patch }) });

  const sort: SortState = { sortBy: search.sort_by, sortDir: search.sort_dir };
  const counts = query.data?.counts;

  return (
    <>
      <PageHeader
        eyebrow="Support centre"
        title="Support queue"
        description="Work member tickets end to end: assign an owner, reply, keep internal notes, and resolve with an auditable note."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPIStat label="Open" value={counts?.open ?? "—"} tone="royal" />
        <KPIStat label="In progress" value={counts?.in_progress ?? "—"} tone="gold" />
        <KPIStat label="Awaiting member" value={counts?.awaiting_member ?? "—"} tone="teal" />
        <KPIStat label="Assigned to me" value={query.data?.mine ?? "—"} tone="teal" />
      </div>

      <SectionCard title="Filters">
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-5">
          <Select
            label="Status"
            value={search.status}
            onChange={(v) => set({ status: v })}
            options={[
              ["active", "Active"],
              ["all", "All"],
              ...SUPPORT_STATUSES.map((s) => [s, STATUS_LABELS[s]] as [string, string]),
            ]}
          />
          <Select
            label="Category"
            value={search.category}
            onChange={(v) => set({ category: v })}
            options={[
              ["all", "All"],
              ...SUPPORT_CATEGORIES.map((c) => [c, CATEGORY_LABELS[c]] as [string, string]),
            ]}
          />
          <Select
            label="Priority"
            value={search.priority}
            onChange={(v) => set({ priority: v })}
            options={[
              ["all", "All"],
              ...SUPPORT_PRIORITIES.map((p) => [p, PRIORITY_LABELS[p]] as [string, string]),
            ]}
          />
          <Select
            label="Assignee"
            value={search.assignee}
            onChange={(v) => set({ assignee: v as Search["assignee"] })}
            options={[
              ["all", "Anyone"],
              ["me", "Assigned to me"],
              ["unassigned", "Unassigned"],
            ]}
          />
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Search
            </label>
            <Input
              defaultValue={search.search ?? ""}
              placeholder="Subject or TKT reference"
              onKeyDown={(e) => {
                if (e.key === "Enter") set({ search: (e.target as HTMLInputElement).value || undefined });
              }}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Tickets">
        {query.isLoading ? (
          <p className="p-5 text-xs text-muted-foreground">Loading queue…</p>
        ) : (query.data?.rows ?? []).length === 0 ? (
          <div className="p-5">
            <EmptyState title="No tickets match these filters" hint="Try widening the status filter." />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium">Ref</th>
                    <th className="px-6 py-3 text-left font-medium">Member</th>
                    <th className="px-6 py-3 text-left font-medium">Subject</th>
                    <SortHeader label="Priority" field="priority" sort={sort} onSort={(n) => set({ sort_by: n.sortBy as Search["sort_by"], sort_dir: n.sortDir })} />
                    <SortHeader label="Status" field="status" sort={sort} onSort={(n) => set({ sort_by: n.sortBy as Search["sort_by"], sort_dir: n.sortDir })} />
                    <th className="px-6 py-3 text-left font-medium">SLA</th>
                    <th className="px-6 py-3 text-left font-medium">Owner</th>
                    <SortHeader label="Opened" field="created_at" sort={sort} onSort={(n) => set({ sort_by: n.sortBy as Search["sort_by"], sort_dir: n.sortDir })} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {(query.data?.rows ?? []).map((t) => (
                    <tr
                      key={t.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => navigate({ search: (prev) => ({ ...prev, ticket: t.id }) })}
                    >
                      <td className="px-6 py-3 font-mono text-[11px]">{t.ref}</td>
                      <td className="px-6 py-3">{t.member_label}</td>
                      <td className="max-w-[22rem] truncate px-6 py-3">{t.subject}</td>
                      <td className="px-6 py-3">
                        <TicketPill value={t.priority} label={PRIORITY_LABELS[t.priority]} />
                      </td>
                      <td className="px-6 py-3">
                        <TicketPill value={t.status} />
                      </td>
                      <td className="px-6 py-3">
                        <TicketPill value={slaState(t)} />
                      </td>
                      <td className="px-6 py-3 text-xs text-muted-foreground">
                        {t.assignee_label ?? "Unassigned"}
                      </td>
                      <td className="px-6 py-3 text-xs text-muted-foreground">
                        {new Date(t.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={search.page}
              pageSize={search.page_size}
              total={query.data?.total ?? 0}
              onPage={(n) => navigate({ search: (prev) => ({ ...prev, page: n }) })}
              onPageSize={(n) => set({ page_size: n })}
            />
          </>
        )}
      </SectionCard>

      {search.ticket ? (
        <TicketWorkspace
          id={search.ticket}
          onClose={() => navigate({ search: (prev) => ({ ...prev, ticket: undefined }) })}
          onChanged={() => void query.refetch()}
        />
      ) : null}
    </>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <select
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function TicketWorkspace({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const getFn = useServerFn(adminGetTicket);
  const replyFn = useServerFn(adminReplyTicket);
  const updateFn = useServerFn(adminUpdateTicket);
  const assigneesFn = useServerFn(adminListAssignees);

  const query = useQuery({ queryKey: ["admin-ticket", id], queryFn: () => getFn({ data: { id } }) });
  const assignees = useQuery({ queryKey: ["support-assignees"], queryFn: () => assigneesFn() });

  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [note, setNote] = useState("");

  const refresh = () => {
    void query.refetch();
    onChanged();
  };

  const replyMutation = useMutation({
    mutationFn: () => replyFn({ data: { id, body, internal } }),
    onSuccess: () => {
      setBody("");
      toast.success(internal ? "Internal note added" : "Reply sent to member");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: (patch: {
      status?: SupportStatus;
      priority?: SupportPriority;
      assign_to?: string;
    }) => updateFn({ data: { id, ...patch, note: note || undefined } }),
    onSuccess: () => {
      toast.success("Ticket updated");
      setNote("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const t = query.data;

  return (
    <SectionCard
      title={t ? `${t.ref} · ${t.subject}` : "Ticket"}
      accent="gold"
      action={
        <Button variant="outline" size="sm" onClick={onClose}>
          Close panel
        </Button>
      }
    >
      {query.isLoading || !t ? (
        <p className="p-5 text-xs text-muted-foreground">Loading ticket…</p>
      ) : (
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 border-border/60 lg:border-r">
            <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-5 py-3 text-[11px] text-muted-foreground">
              <TicketPill value={t.status} />
              <TicketPill value={t.priority} label={PRIORITY_LABELS[t.priority]} />
              <TicketPill value={slaState(t)} />
              <span>{CATEGORY_LABELS[t.category]}</span>
              <span className="ml-auto">Opened {new Date(t.created_at).toLocaleString()}</span>
            </div>
            <SupportTicketThread messages={t.messages} />
            <div className="space-y-3 border-t border-border/60 p-5">
              <Textarea
                rows={4}
                value={body}
                maxLength={4000}
                onChange={(e) => setBody(e.target.value)}
                placeholder={internal ? "Internal note — never shown to the member." : "Reply to the member…"}
              />
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={internal}
                    onChange={(e) => setInternal(e.target.checked)}
                  />
                  Internal note (staff only)
                </label>
                <Button
                  disabled={body.trim().length < 2 || replyMutation.isPending}
                  onClick={() => replyMutation.mutate()}
                >
                  {replyMutation.isPending ? "Saving…" : internal ? "Add internal note" : "Send reply"}
                </Button>
              </div>
            </div>
          </div>

          <aside className="space-y-4 p-5">
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Member context
              </p>
              <p className="text-sm font-medium text-foreground">{t.member_label}</p>
              {t.member_no ? <p className="text-muted-foreground">Member no. {t.member_no}</p> : null}
              {t.member_context?.email ? <p className="text-muted-foreground">{t.member_context.email}</p> : null}
              {t.member_context?.phone ? <p className="text-muted-foreground">{t.member_context.phone}</p> : null}
              <p className="mt-2 text-muted-foreground">
                KYC: {t.member_context?.kyc_status ?? "—"} · Account: {t.member_context?.status ?? "—"}
              </p>
            </div>

            <Select
              label="Priority"
              value={t.priority}
              onChange={(v) => updateMutation.mutate({ priority: v as SupportPriority })}
              options={SUPPORT_PRIORITIES.map((p) => [p, PRIORITY_LABELS[p]] as [string, string])}
            />

            <Select
              label="Owner"
              value={t.assignee_id ?? "none"}
              onChange={(v) => updateMutation.mutate({ assign_to: v })}
              options={[
                ["none", "Unassigned"],
                ["me", "Assign to me"],
                ...(assignees.data ?? []).map((a) => [a.id, `${a.label} (${a.role.replace(/_/g, " ")})`] as [string, string]),
              ]}
            />

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Decision note (required to resolve or close)
              </label>
              <Textarea
                rows={3}
                value={note}
                maxLength={1000}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Explain the outcome — at least 10 characters."
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {SUPPORT_STATUSES.filter((s) => s !== t.status).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant="outline"
                  disabled={
                    updateMutation.isPending ||
                    ((s === "resolved" || s === "closed") && note.trim().length < 10)
                  }
                  onClick={() => updateMutation.mutate({ status: s })}
                >
                  {STATUS_LABELS[s]}
                </Button>
              ))}
            </div>
          </aside>
        </div>
      )}
    </SectionCard>
  );
}
