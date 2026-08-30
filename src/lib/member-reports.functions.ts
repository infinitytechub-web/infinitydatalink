import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit } from "@/lib/audit-log";
import {
  MEMBER_REPORT_DATASETS,
  type MemberReportColumn,
  type MemberReportDataset,
  type MemberReportResult,
  type MemberReportRow,
} from "@/lib/member-reports.shared";

/**
 * Member reports hub. Every query is scoped to the caller's own id on top of
 * RLS, so a member can only ever read their own statements. Downloads are
 * written to the audit trail like the admin exports hub.
 */

const Filter = z.object({
  dataset: z.enum(MEMBER_REPORT_DATASETS),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  status: z.string().trim().max(40).optional(),
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(10).max(200).default(25),
});

const num = (v: unknown) => Number(v ?? 0);
const day = (v: unknown) => (v ? String(v).slice(0, 10) : "—");
const pretty = (v: unknown) => (v ? String(v).replace(/_/g, " ") : "—");

export const MEMBER_DATASET_STATUSES: Record<MemberReportDataset, string[]> = {
  savings: ["active", "closed"],
  loans: ["pending", "approved", "rejected", "active", "closed"],
  repayments: ["due", "paid", "overdue", "partial"],
  withdrawals: ["pending", "approved", "rejected", "cancelled", "paid"],
  receipts: [],
  transactions: ["cleared", "pending", "failed"],
};

const COLUMNS: Record<MemberReportDataset, MemberReportColumn[]> = {
  savings: [
    { key: "account", header: "Account" },
    { key: "plan", header: "Plan" },
    { key: "balance", header: "Balance", align: "right", money: true },
    { key: "goal", header: "Goal", align: "right", money: true },
    { key: "status", header: "Status" },
    { key: "opened", header: "Opened" },
  ],
  loans: [
    { key: "ref", header: "Reference" },
    { key: "product", header: "Product" },
    { key: "amount", header: "Amount", align: "right", money: true },
    { key: "outstanding", header: "Outstanding", align: "right", money: true },
    { key: "status", header: "Status" },
    { key: "applied", header: "Applied" },
    { key: "maturity", header: "Maturity" },
  ],
  repayments: [
    { key: "loan", header: "Loan" },
    { key: "installment", header: "No.", align: "right" },
    { key: "due_date", header: "Due" },
    { key: "total_due", header: "Due amount", align: "right", money: true },
    { key: "paid_amount", header: "Paid", align: "right", money: true },
    { key: "outstanding", header: "Outstanding", align: "right", money: true },
    { key: "status", header: "Status" },
  ],
  withdrawals: [
    { key: "ref", header: "Reference" },
    { key: "amount", header: "Amount", align: "right", money: true },
    { key: "channel", header: "Channel" },
    { key: "status", header: "Status" },
    { key: "requested", header: "Requested" },
    { key: "paid", header: "Paid" },
    { key: "reason", header: "Reason" },
  ],
  receipts: [
    { key: "receipt_no", header: "Receipt" },
    { key: "reference", header: "Payment ref" },
    { key: "purpose", header: "Purpose" },
    { key: "amount", header: "Amount", align: "right", money: true },
    { key: "issued", header: "Issued" },
  ],
  transactions: [
    { key: "ref", header: "Reference" },
    { key: "kind", header: "Type" },
    { key: "amount", header: "Amount", align: "right", money: true },
    { key: "channel", header: "Channel" },
    { key: "status", header: "Status" },
    { key: "posted", header: "Posted" },
    { key: "note", header: "Note" },
  ],
};

function bounds(from?: string, to?: string) {
  return {
    gte: from ? `${from}T00:00:00Z` : undefined,
    lte: to ? `${to}T23:59:59Z` : undefined,
  };
}

export const runMyReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Filter.parse(d))
  .handler(async ({ data, context }): Promise<MemberReportResult> => {
    const sb = context.supabase as any;
    const uid = context.userId;
    const b = bounds(data.date_from, data.date_to);
    const status = data.status && data.status !== "all" ? data.status : undefined;
    const from = (data.page - 1) * data.page_size;
    const to = from + data.page_size - 1;

    const paged = async (
      table: string,
      select: string,
      dateColumn: string,
      narrow?: (q: any) => any,
    ) => {
      const build = (withCount: boolean) => {
        let q = sb.from(table).select(select, withCount ? { count: "exact" } : undefined);
        if (narrow) q = narrow(q);
        if (b.gte) q = q.gte(dateColumn, data.date_from);
        if (b.lte) q = q.lte(dateColumn, dateColumn.includes("date") ? data.date_to : b.lte);
        if (status) q = q.eq("status", status);
        return q;
      };
      const { data: rows, count, error } = await build(true)
        .order(dateColumn, { ascending: false })
        .range(from, to);
      if (error) throw new Error(error.message);
      const { data: all, error: allErr } = await build(false).limit(2000);
      if (allErr) throw new Error(allErr.message);
      return { rows: (rows ?? []) as any[], all: (all ?? []) as any[], count: count ?? 0 };
    };

    let rows: MemberReportRow[] = [];
    let total = 0;
    let summary: MemberReportResult["summary"] = [];

    if (data.dataset === "savings") {
      const r = await paged(
        "savings_accounts",
        "id, nickname, balance, goal_amount, status, created_at, plan_id, savings_plans(name)",
        "created_at",
        (q) => q.eq("user_id", uid),
      );
      total = r.count;
      rows = r.rows.map((a) => ({
        record_id: a.id,
        account: a.nickname || a.savings_plans?.name || a.id.slice(0, 8),
        plan: a.savings_plans?.name ?? "—",
        balance: num(a.balance),
        goal: num(a.goal_amount),
        status: pretty(a.status),
        opened: day(a.created_at),
      }));
      summary = [
        { label: "Accounts", value: r.all.length },
        { label: "Total balance", value: r.all.reduce((s, a) => s + num(a.balance), 0), money: true },
      ];
    } else if (data.dataset === "loans") {
      const r = await paged(
        "loans",
        "id, ref, product, amount, outstanding_principal, status, created_at, maturity_at",
        "created_at",
        (q) => q.eq("user_id", uid),
      );
      total = r.count;
      rows = r.rows.map((l) => ({
        record_id: l.id,
        ref: l.ref ?? l.id.slice(0, 8),
        product: l.product ?? "—",
        amount: num(l.amount),
        outstanding: num(l.outstanding_principal),
        status: pretty(l.status),
        applied: day(l.created_at),
        maturity: day(l.maturity_at),
      }));
      summary = [
        { label: "Loans", value: r.all.length },
        { label: "Borrowed", value: r.all.reduce((s, l) => s + num(l.amount), 0), money: true },
        {
          label: "Outstanding",
          value: r.all.reduce((s, l) => s + num(l.outstanding_principal), 0),
          money: true,
        },
      ];
    } else if (data.dataset === "repayments") {
      const { data: myLoans, error: loanErr } = await sb
        .from("loans")
        .select("id, ref")
        .eq("user_id", uid);
      if (loanErr) throw new Error(loanErr.message);
      const loanIds = ((myLoans ?? []) as any[]).map((l) => l.id);
      const refs = new Map(((myLoans ?? []) as any[]).map((l) => [l.id, l.ref]));
      if (loanIds.length === 0) {
        return {
          dataset: data.dataset,
          columns: COLUMNS[data.dataset],
          rows: [],
          total: 0,
          page: data.page,
          page_size: data.page_size,
          summary: [{ label: "Instalments", value: 0 }],
        };
      }
      const r = await paged(
        "loan_repayments",
        "id, loan_id, installment_no, due_date, total_due, paid_amount, status",
        "due_date",
        (q) => q.in("loan_id", loanIds),
      );
      total = r.count;
      rows = r.rows.map((p) => ({
        record_id: p.id,
        loan: refs.get(p.loan_id) ?? String(p.loan_id).slice(0, 8),
        installment: num(p.installment_no),
        due_date: day(p.due_date),
        total_due: num(p.total_due),
        paid_amount: num(p.paid_amount),
        outstanding: Math.max(0, num(p.total_due) - num(p.paid_amount)),
        status: pretty(p.status),
      }));
      summary = [
        { label: "Instalments", value: r.all.length },
        { label: "Due", value: r.all.reduce((s, p) => s + num(p.total_due), 0), money: true },
        { label: "Paid", value: r.all.reduce((s, p) => s + num(p.paid_amount), 0), money: true },
      ];
    } else if (data.dataset === "withdrawals") {
      const r = await paged(
        "savings_withdrawal_requests",
        "id, ref, amount, channel, status, reason, created_at, paid_at",
        "created_at",
        (q) => q.eq("user_id", uid),
      );
      total = r.count;
      rows = r.rows.map((w) => ({
        record_id: w.id,
        ref: w.ref ?? w.id.slice(0, 8),
        amount: num(w.amount),
        channel: pretty(w.channel),
        status: pretty(w.status),
        requested: day(w.created_at),
        paid: day(w.paid_at),
        reason: w.reason ?? "—",
      }));
      summary = [
        { label: "Requests", value: r.all.length },
        { label: "Requested value", value: r.all.reduce((s, w) => s + num(w.amount), 0), money: true },
        {
          label: "Paid out",
          value: r.all.filter((w) => w.status === "paid").reduce((s, w) => s + num(w.amount), 0),
          money: true,
        },
      ];
    } else if (data.dataset === "receipts") {
      const build = (withCount: boolean) => {
        let q = sb
          .from("payment_receipts")
          .select(
            "id, receipt_no, amount_minor, currency, issued_at, payment_intents!inner(reference, purpose, member_id)",
            withCount ? { count: "exact" } : undefined,
          )
          .eq("payment_intents.member_id", uid);
        if (b.gte) q = q.gte("issued_at", b.gte);
        if (b.lte) q = q.lte("issued_at", b.lte);
        return q;
      };
      const { data: page, count, error } = await build(true)
        .order("issued_at", { ascending: false })
        .range(from, to);
      if (error) throw new Error(error.message);
      const { data: all, error: allErr } = await build(false).limit(2000);
      if (allErr) throw new Error(allErr.message);
      total = count ?? 0;
      rows = ((page ?? []) as any[]).map((r) => ({
        record_id: r.id,
        receipt_no: r.receipt_no,
        reference: r.payment_intents?.reference ?? "—",
        purpose: pretty(r.payment_intents?.purpose),
        amount: num(r.amount_minor) / 100,
        issued: day(r.issued_at),
      }));
      summary = [
        { label: "Receipts", value: (all ?? []).length },
        {
          label: "Total paid",
          value: ((all ?? []) as any[]).reduce((s, r) => s + num(r.amount_minor) / 100, 0),
          money: true,
        },
      ];
    } else {
      const r = await paged(
        "transactions",
        "id, ref, kind, amount, channel, status, note, created_at",
        "created_at",
        (q) => q.eq("user_id", uid),
      );
      total = r.count;
      rows = r.rows.map((t) => ({
        record_id: t.id,
        ref: t.ref ?? t.id.slice(0, 8),
        kind: pretty(t.kind),
        amount: num(t.amount),
        channel: pretty(t.channel),
        status: pretty(t.status),
        posted: day(t.created_at),
        note: t.note ?? "—",
      }));
      summary = [
        { label: "Transactions", value: r.all.length },
        { label: "Value", value: r.all.reduce((s, t) => s + num(t.amount), 0), money: true },
      ];
    }

    return {
      dataset: data.dataset,
      columns: COLUMNS[data.dataset],
      rows,
      total,
      page: data.page,
      page_size: data.page_size,
      summary,
    };
  });

export const logMyReportExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        dataset: z.enum(MEMBER_REPORT_DATASETS),
        format: z.enum(["csv", "excel", "pdf", "print"]),
        rows: z.number().int().min(0),
        date_from: z.string().optional(),
        date_to: z.string().optional(),
        status: z.string().max(40).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await writeAudit({
      actor_id: context.userId,
      action: `member.report.export.${data.dataset}`,
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
