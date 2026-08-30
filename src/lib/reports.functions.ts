import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit-log";
import {
  REPORT_DATASETS,
  type ReportColumn,
  type ReportDataset,
  type ReportResult,
  type ReportRow,
} from "@/lib/reports.shared";

/**
 * Admin reports hub.
 *
 * One server function serves every dataset so filters, pagination, totals and
 * the RBAC gate behave identically across reports. Reads go through the
 * caller's RLS-scoped client; every download is written to the audit trail by
 * `logReportExport`.
 */

const Filter = z.object({
  dataset: z.enum(REPORT_DATASETS),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  status: z.string().trim().max(40).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(10).max(1000).default(50),
});

const money = (align = "right" as const) => align;

function dateBounds(from?: string, to?: string): { gte?: string; lte?: string } {
  return {
    ...(from ? { gte: `${from}T00:00:00Z` } : {}),
    ...(to ? { lte: `${to}T23:59:59Z` } : {}),
  };
}

async function memberLabels(sb: any, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return map;
  const { data } = await sb.from("profiles").select("id, full_name, member_no").in("id", unique);
  for (const p of (data ?? []) as any[]) {
    map.set(p.id, [p.full_name, p.member_no].filter(Boolean).join(" · ") || p.id);
  }
  return map;
}

const num = (v: unknown) => Number(v ?? 0);
const day = (v: unknown) => (v ? String(v).slice(0, 10) : "—");

type Spec = {
  columns: ReportColumn[];
  /** Table used for the paged query. */
  table: string;
  select: string;
  dateColumn: string;
  statuses?: string[];
  /** Extra query narrowing applied to both the page and the totals query. */
  narrow?: (q: any) => any;
  searchColumns?: string[];
  map: (rows: any[], ctx: { labels: Map<string, string>; extra: Map<string, any> }) => ReportRow[];
  ownerColumn?: string;
  summary: (rows: any[]) => Array<{ label: string; value: number; money?: boolean }>;
  /** Optional second fetch keyed by an id column (e.g. loans for repayments). */
  join?: { table: string; select: string; fromColumn: string; idColumn?: string };
};

const SPECS: Record<ReportDataset, Spec> = {
  savings: {
    table: "savings_accounts",
    select: "id, user_id, plan_id, nickname, balance, status, goal_amount, created_at",
    dateColumn: "created_at",
    statuses: ["active", "closed"],
    ownerColumn: "user_id",
    join: { table: "savings_plans", select: "id, name, interest_rate", fromColumn: "plan_id" },
    columns: [
      { key: "member", header: "Member" },
      { key: "plan", header: "Plan" },
      { key: "nickname", header: "Account name" },
      { key: "balance", header: "Balance", align: money(), money: true },
      { key: "goal", header: "Goal", align: money(), money: true },
      { key: "rate", header: "Rate %", align: money() },
      { key: "status", header: "Status" },
      { key: "opened", header: "Opened" },
    ],
    map: (rows, { labels, extra }) =>
      rows.map((r) => ({
        member: labels.get(r.user_id) ?? r.user_id,
        plan: extra.get(r.plan_id)?.name ?? "—",
        nickname: r.nickname ?? "—",
        balance: num(r.balance),
        goal: num(r.goal_amount),
        rate: num(extra.get(r.plan_id)?.interest_rate),
        status: r.status,
        opened: day(r.created_at),
      })),
    summary: (rows) => [
      { label: "Accounts", value: rows.length },
      { label: "Total balance", value: rows.reduce((s, r) => s + num(r.balance), 0), money: true },
    ],
  },

  loans: {
    table: "loans",
    select:
      "id, ref, user_id, product, amount, interest_rate, term_months, monthly_payment, outstanding_principal, arrears_amount, days_past_due, status, created_at, disbursed_at",
    dateColumn: "created_at",
    statuses: ["pending", "approved", "rejected", "active", "closed"],
    ownerColumn: "user_id",
    searchColumns: ["ref", "product"],
    columns: [
      { key: "ref", header: "Reference" },
      { key: "member", header: "Member" },
      { key: "product", header: "Product" },
      { key: "amount", header: "Principal", align: money(), money: true },
      { key: "rate", header: "Rate %", align: money() },
      { key: "term", header: "Term (m)", align: money() },
      { key: "instalment", header: "Instalment", align: money(), money: true },
      { key: "outstanding", header: "Outstanding", align: money(), money: true },
      { key: "arrears", header: "Arrears", align: money(), money: true },
      { key: "dpd", header: "DPD", align: money() },
      { key: "status", header: "Status" },
      { key: "applied", header: "Applied" },
      { key: "disbursed", header: "Disbursed" },
    ],
    map: (rows, { labels }) =>
      rows.map((r) => ({
        ref: r.ref,
        member: labels.get(r.user_id) ?? r.user_id,
        product: r.product,
        amount: num(r.amount),
        rate: num(r.interest_rate),
        term: num(r.term_months),
        instalment: num(r.monthly_payment),
        outstanding: num(r.outstanding_principal),
        arrears: num(r.arrears_amount),
        dpd: num(r.days_past_due),
        status: r.status,
        applied: day(r.created_at),
        disbursed: day(r.disbursed_at),
      })),
    summary: (rows) => [
      { label: "Loans", value: rows.length },
      { label: "Principal", value: rows.reduce((s, r) => s + num(r.amount), 0), money: true },
      {
        label: "Outstanding",
        value: rows.reduce((s, r) => s + num(r.outstanding_principal), 0),
        money: true,
      },
      { label: "Arrears", value: rows.reduce((s, r) => s + num(r.arrears_amount), 0), money: true },
    ],
  },

  repayments: {
    table: "loan_repayments",
    select:
      "id, loan_id, installment_no, due_date, principal_due, interest_due, total_due, paid_amount, paid_at, status",
    dateColumn: "due_date",
    statuses: ["due", "paid", "partial", "overdue"],
    join: { table: "loans", select: "id, ref, user_id", fromColumn: "loan_id" },
    columns: [
      { key: "loan", header: "Loan" },
      { key: "member", header: "Member" },
      { key: "installment", header: "Instalment #", align: money() },
      { key: "due_date", header: "Due date" },
      { key: "principal", header: "Principal", align: money(), money: true },
      { key: "interest", header: "Interest", align: money(), money: true },
      { key: "total_due", header: "Total due", align: money(), money: true },
      { key: "paid", header: "Paid", align: money(), money: true },
      { key: "balance", header: "Balance", align: money(), money: true },
      { key: "status", header: "Status" },
      { key: "paid_at", header: "Paid on" },
    ],
    map: (rows, { labels, extra }) =>
      rows.map((r) => {
        const loan = extra.get(r.loan_id);
        return {
          loan: loan?.ref ?? "—",
          member: labels.get(loan?.user_id) ?? "—",
          installment: num(r.installment_no),
          due_date: day(r.due_date),
          principal: num(r.principal_due),
          interest: num(r.interest_due),
          total_due: num(r.total_due),
          paid: num(r.paid_amount),
          balance: Math.max(0, num(r.total_due) - num(r.paid_amount)),
          status: r.status,
          paid_at: day(r.paid_at),
        };
      }),
    summary: (rows) => [
      { label: "Instalments", value: rows.length },
      { label: "Total due", value: rows.reduce((s, r) => s + num(r.total_due), 0), money: true },
      { label: "Collected", value: rows.reduce((s, r) => s + num(r.paid_amount), 0), money: true },
      {
        label: "Outstanding",
        value: rows.reduce((s, r) => s + Math.max(0, num(r.total_due) - num(r.paid_amount)), 0),
        money: true,
      },
    ],
  },

  withdrawals: {
    table: "savings_withdrawal_requests",
    select:
      "id, ref, user_id, amount, channel, status, reason, created_at, approved_at, paid_at, rejected_at",
    dateColumn: "created_at",
    statuses: ["pending", "approved", "rejected", "cancelled", "paid"],
    ownerColumn: "user_id",
    searchColumns: ["ref"],
    columns: [
      { key: "ref", header: "Reference" },
      { key: "member", header: "Member" },
      { key: "amount", header: "Amount", align: money(), money: true },
      { key: "channel", header: "Channel" },
      { key: "status", header: "Status" },
      { key: "requested", header: "Requested" },
      { key: "approved", header: "Approved" },
      { key: "paid", header: "Paid" },
      { key: "reason", header: "Reason" },
    ],
    map: (rows, { labels }) =>
      rows.map((r) => ({
        ref: r.ref,
        member: labels.get(r.user_id) ?? r.user_id,
        amount: num(r.amount),
        channel: r.channel,
        status: r.status,
        requested: day(r.created_at),
        approved: day(r.approved_at),
        paid: day(r.paid_at),
        reason: r.reason ?? "—",
      })),
    summary: (rows) => [
      { label: "Requests", value: rows.length },
      { label: "Requested value", value: rows.reduce((s, r) => s + num(r.amount), 0), money: true },
      {
        label: "Paid out",
        value: rows.filter((r) => r.status === "paid").reduce((s, r) => s + num(r.amount), 0),
        money: true,
      },
    ],
  },

  deposits: {
    table: "transactions",
    select: "id, ref, user_id, amount, kind, status, channel, note, created_at",
    dateColumn: "created_at",
    statuses: ["cleared", "pending", "failed"],
    ownerColumn: "user_id",
    searchColumns: ["ref"],
    narrow: (q) => q.eq("kind", "deposit"),
    columns: [
      { key: "ref", header: "Reference" },
      { key: "member", header: "Member" },
      { key: "amount", header: "Amount", align: money(), money: true },
      { key: "channel", header: "Channel" },
      { key: "status", header: "Status" },
      { key: "posted", header: "Posted" },
      { key: "note", header: "Note" },
    ],
    map: (rows, { labels }) =>
      rows.map((r) => ({
        ref: r.ref,
        member: labels.get(r.user_id) ?? r.user_id,
        amount: num(r.amount),
        channel: r.channel ?? "—",
        status: r.status,
        posted: day(r.created_at),
        note: r.note ?? "—",
      })),
    summary: (rows) => [
      { label: "Deposits", value: rows.length },
      { label: "Value", value: rows.reduce((s, r) => s + num(r.amount), 0), money: true },
    ],
  },

  income: {
    table: "transactions",
    select: "id, ref, user_id, amount, kind, status, channel, note, created_at",
    dateColumn: "created_at",
    statuses: ["cleared", "pending", "failed"],
    ownerColumn: "user_id",
    searchColumns: ["ref"],
    narrow: (q) => q.in("kind", ["fee", "interest", "loan_repayment"]),
    columns: [
      { key: "ref", header: "Reference" },
      { key: "member", header: "Member" },
      { key: "stream", header: "Income stream" },
      { key: "amount", header: "Amount", align: money(), money: true },
      { key: "status", header: "Status" },
      { key: "posted", header: "Posted" },
    ],
    map: (rows, { labels }) =>
      rows.map((r) => ({
        ref: r.ref,
        member: labels.get(r.user_id) ?? r.user_id,
        stream: String(r.kind).replace(/_/g, " "),
        amount: num(r.amount),
        status: r.status,
        posted: day(r.created_at),
      })),
    summary: (rows) => [
      { label: "Postings", value: rows.length },
      {
        label: "Fees",
        value: rows.filter((r) => r.kind === "fee").reduce((s, r) => s + num(r.amount), 0),
        money: true,
      },
      {
        label: "Interest",
        value: rows.filter((r) => r.kind === "interest").reduce((s, r) => s + num(r.amount), 0),
        money: true,
      },
      { label: "Total income", value: rows.reduce((s, r) => s + num(r.amount), 0), money: true },
    ],
  },

  expenses: {
    table: "expenses",
    select:
      "id, ref, vendor, category_code, amount, currency, status, incurred_on, paid_on, payment_channel, notes",
    dateColumn: "incurred_on",
    statuses: ["pending", "approved", "paid", "rejected"],
    searchColumns: ["ref", "vendor"],
    columns: [
      { key: "ref", header: "Reference" },
      { key: "vendor", header: "Vendor" },
      { key: "category", header: "Category" },
      { key: "amount", header: "Amount", align: money(), money: true },
      { key: "status", header: "Status" },
      { key: "incurred", header: "Incurred" },
      { key: "paid", header: "Paid" },
      { key: "channel", header: "Channel" },
      { key: "notes", header: "Notes" },
    ],
    map: (rows) =>
      rows.map((r) => ({
        ref: r.ref,
        vendor: r.vendor,
        category: r.category_code,
        amount: num(r.amount),
        status: r.status,
        incurred: day(r.incurred_on),
        paid: day(r.paid_on),
        channel: r.payment_channel ?? "—",
        notes: r.notes ?? "—",
      })),
    summary: (rows) => [
      { label: "Entries", value: rows.length },
      { label: "Total expense", value: rows.reduce((s, r) => s + num(r.amount), 0), money: true },
      {
        label: "Paid",
        value: rows.filter((r) => r.status === "paid").reduce((s, r) => s + num(r.amount), 0),
        money: true,
      },
    ],
  },

  transactions: {
    table: "transactions",
    select: "id, ref, user_id, amount, kind, status, channel, note, created_at",
    dateColumn: "created_at",
    statuses: ["cleared", "pending", "failed"],
    ownerColumn: "user_id",
    searchColumns: ["ref"],
    columns: [
      { key: "ref", header: "Reference" },
      { key: "member", header: "Member" },
      { key: "kind", header: "Type" },
      { key: "amount", header: "Amount", align: money(), money: true },
      { key: "channel", header: "Channel" },
      { key: "status", header: "Status" },
      { key: "posted", header: "Posted" },
      { key: "note", header: "Note" },
    ],
    map: (rows, { labels }) =>
      rows.map((r) => ({
        ref: r.ref,
        member: labels.get(r.user_id) ?? r.user_id,
        kind: String(r.kind).replace(/_/g, " "),
        amount: num(r.amount),
        channel: r.channel ?? "—",
        status: r.status,
        posted: day(r.created_at),
        note: r.note ?? "—",
      })),
    summary: (rows) => [
      { label: "Transactions", value: rows.length },
      { label: "Value", value: rows.reduce((s, r) => s + num(r.amount), 0), money: true },
    ],
  },
};

export function datasetStatuses(dataset: ReportDataset): string[] {
  return SPECS[dataset].statuses ?? [];
}

export const runReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Filter.parse(d))
  .handler(async ({ data, context }): Promise<ReportResult> => {
    await assertPermission(context.supabase, context.userId, "reports", "view");
    const spec = SPECS[data.dataset];
    const bounds = dateBounds(data.date_from, data.date_to);

    const build = (selectCols: string, withCount: boolean) => {
      const sb = context.supabase as any;
      let q = sb
        .from(spec.table)
        .select(selectCols, withCount ? { count: "exact" } : undefined);
      if (spec.narrow) q = spec.narrow(q);
      if (bounds.gte) q = q.gte(spec.dateColumn, bounds.gte);
      if (bounds.lte) q = q.lte(spec.dateColumn, bounds.lte);
      if (data.status && data.status !== "all") q = q.eq("status", data.status);
      if (data.search && spec.searchColumns?.length) {
        const safe = data.search.replace(/[%,()]/g, " ").trim();
        if (safe) q = q.or(spec.searchColumns.map((c) => `${c}.ilike.%${safe}%`).join(","));
      }
      return q;
    };

    const from = (data.page - 1) * data.page_size;
    const { data: rows, count, error } = await build(spec.select, true)
      .order(spec.dateColumn, { ascending: false })
      .range(from, from + data.page_size - 1);
    if (error) throw new Error(error.message);
    const pageRows = (rows ?? []) as any[];

    // Aggregates cover the whole filtered range, not just the visible page.
    const { data: allRows, error: allErr } = await build(spec.select, false).limit(5000);
    if (allErr) throw new Error(allErr.message);

    const extra = new Map<string, any>();
    if (spec.join) {
      const ids = [...new Set(pageRows.map((r) => r[spec.join!.fromColumn]).filter(Boolean))];
      if (ids.length > 0) {
        const { data: joined } = await (context.supabase as any)
          .from(spec.join.table)
          .select(spec.join.select)
          .in(spec.join.idColumn ?? "id", ids);
        for (const j of (joined ?? []) as any[]) extra.set(j.id, j);
      }
    }

    const ownerIds: string[] = [];
    if (spec.ownerColumn) ownerIds.push(...pageRows.map((r) => r[spec.ownerColumn!] as string));
    if (spec.join) {
      for (const j of extra.values()) if (j?.user_id) ownerIds.push(j.user_id as string);
    }
    const labels = await memberLabels(context.supabase, ownerIds);

    return {
      dataset: data.dataset,
      columns: spec.columns,
      rows: spec.map(pageRows, { labels, extra }),
      total: count ?? pageRows.length,
      page: data.page,
      page_size: data.page_size,
      summary: spec.summary((allRows ?? []) as any[]),
    };
  });

export const logReportExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        dataset: z.enum(REPORT_DATASETS),
        format: z.enum(["csv", "excel", "pdf", "print"]),
        rows: z.number().int().min(0),
        date_from: z.string().optional(),
        date_to: z.string().optional(),
        status: z.string().max(40).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertPermission(context.supabase, context.userId, "reports", "export");
    await writeAudit({
      actor_id: context.userId,
      action: `report.export.${data.dataset}`,
      target: data.dataset,
      meta: {
        format: data.format,
        rows: data.rows,
        date_from: data.date_from ?? null,
        date_to: data.date_to ?? null,
        status: data.status ?? "all",
      },
    });
    return { ok: true };
  });
