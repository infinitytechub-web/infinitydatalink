import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MEMBER_REPORT_DATASETS } from "@/lib/member-reports.shared";

export type RecordField = { label: string; value: string; money?: boolean };

export type RecordDetail = {
  dataset: string;
  record_id: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  fields: RecordField[];
  timeline: Array<{ label: string; at: string | null; note?: string | null }>;
  /** Full record, for the Copy JSON action. */
  raw: Record<string, unknown>;
  /** Internal app route to the full page, when one exists. */
  link: string | null;
};

/**
 * Returns the full detail of a single record the member owns. Every branch
 * filters on the caller's id (or on a parent row the caller owns) on top of
 * RLS, so a guessed id from another member returns "not found".
 */
export const getMyRecordDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        dataset: z.enum(MEMBER_REPORT_DATASETS),
        record_id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<RecordDetail> => {
    const sb = context.supabase as any;
    const uid = context.userId;
    const num = (v: unknown) => Number(v ?? 0);
    const money = (v: unknown) => num(v).toFixed(2);
    const day = (v: unknown) => (v ? String(v).slice(0, 10) : "—");
    const pretty = (v: unknown) => (v ? String(v).replace(/_/g, " ") : "—");
    const notFound = () => new Error("Record not found");

    if (data.dataset === "savings") {
      const { data: row, error } = await sb
        .from("savings_accounts")
        .select("*, savings_plans(name)")
        .eq("id", data.record_id)
        .eq("user_id", uid)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw notFound();
      return {
        dataset: data.dataset,
        record_id: row.id,
        title: row.nickname || row.savings_plans?.name || "Savings account",
        subtitle: row.savings_plans?.name ?? null,
        status: row.status,
        fields: [
          { label: "Balance", value: money(row.balance), money: true },
          { label: "Goal amount", value: money(row.goal_amount), money: true },
          { label: "Plan", value: row.savings_plans?.name ?? "—" },
          { label: "Opened", value: day(row.created_at) },
          { label: "Account id", value: row.id },
        ],
        timeline: [{ label: "Opened", at: row.created_at }],
        raw: row,
        link: `/app/savings/${row.id}`,
      };
    }

    if (data.dataset === "loans") {
      const { data: row, error } = await sb
        .from("loans")
        .select("*")
        .eq("id", data.record_id)
        .eq("user_id", uid)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw notFound();
      return {
        dataset: data.dataset,
        record_id: row.id,
        title: `Loan ${row.ref ?? row.id.slice(0, 8)}`,
        subtitle: row.product ?? null,
        status: row.status,
        fields: [
          { label: "Principal", value: money(row.amount), money: true },
          { label: "Outstanding", value: money(row.outstanding_principal), money: true },
          { label: "Interest rate", value: `${num(row.interest_rate)}%` },
          { label: "Term", value: `${num(row.term_months)} months` },
          { label: "Applied", value: day(row.created_at) },
          { label: "Maturity", value: day(row.maturity_at) },
        ],
        timeline: [
          { label: "Applied", at: row.created_at },
          { label: "Decision", at: row.decided_at ?? null, note: row.decision_note ?? null },
          { label: "Disbursed", at: row.disbursed_at ?? null },
          { label: "Written off", at: row.written_off_at ?? null },
        ],
        raw: row,
        link: `/app/loans/${row.id}`,
      };
    }

    if (data.dataset === "repayments") {
      const { data: row, error } = await sb
        .from("loan_repayments")
        .select("*, loans!inner(id, ref, user_id)")
        .eq("id", data.record_id)
        .eq("loans.user_id", uid)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw notFound();
      return {
        dataset: data.dataset,
        record_id: row.id,
        title: `Instalment #${num(row.installment_no)}`,
        subtitle: `Loan ${row.loans?.ref ?? String(row.loan_id).slice(0, 8)}`,
        status: row.status,
        fields: [
          { label: "Due date", value: day(row.due_date) },
          { label: "Total due", value: money(row.total_due), money: true },
          { label: "Principal", value: money(row.principal_due), money: true },
          { label: "Interest", value: money(row.interest_due), money: true },
          { label: "Paid", value: money(row.paid_amount), money: true },
          {
            label: "Outstanding",
            value: money(Math.max(0, num(row.total_due) - num(row.paid_amount))),
            money: true,
          },
        ],
        timeline: [
          { label: "Due", at: row.due_date },
          { label: "Paid", at: row.paid_at ?? null },
        ],
        raw: row,
        link: row.loans?.id ? `/app/loans/${row.loans.id}` : null,
      };
    }

    if (data.dataset === "withdrawals") {
      const { data: row, error } = await sb
        .from("savings_withdrawal_requests")
        .select("*")
        .eq("id", data.record_id)
        .eq("user_id", uid)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw notFound();
      return {
        dataset: data.dataset,
        record_id: row.id,
        title: `Withdrawal ${row.ref ?? row.id.slice(0, 8)}`,
        subtitle: pretty(row.channel),
        status: row.status,
        fields: [
          { label: "Amount", value: money(row.amount), money: true },
          { label: "Channel", value: pretty(row.channel) },
          { label: "Reason", value: row.reason ?? "—" },
          { label: "Requested", value: day(row.created_at) },
          { label: "Decision note", value: row.approval_note ?? row.rejection_reason ?? "—" },
        ],
        timeline: [
          { label: "Requested", at: row.created_at },
          { label: "Approved", at: row.approved_at ?? null, note: row.approval_note ?? null },
          { label: "Rejected", at: row.rejected_at ?? null, note: row.rejection_reason ?? null },
          { label: "Paid", at: row.paid_at ?? null },
          { label: "Cancelled", at: row.cancelled_at ?? null, note: row.cancellation_reason ?? null },
        ],
        raw: row,
        link: "/app/withdrawals",
      };
    }

    if (data.dataset === "receipts") {
      const { data: row, error } = await sb
        .from("payment_receipts")
        .select("*, payment_intents!inner(id, reference, purpose, status, member_id, provider_code, created_at)")
        .eq("id", data.record_id)
        .eq("payment_intents.member_id", uid)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw notFound();
      const intent = row.payment_intents ?? {};
      return {
        dataset: data.dataset,
        record_id: row.id,
        title: `Receipt ${row.receipt_no ?? row.id.slice(0, 8)}`,
        subtitle: intent.reference ?? null,
        status: intent.status ?? null,
        fields: [
          { label: "Amount", value: (num(row.amount_minor) / 100).toFixed(2), money: true },
          { label: "Currency", value: row.currency ?? "GHS" },
          { label: "Purpose", value: pretty(intent.purpose) },
          { label: "Provider", value: pretty(intent.provider_code) },
          { label: "Payment reference", value: intent.reference ?? "—" },
          { label: "Issued", value: day(row.issued_at) },
        ],
        timeline: [
          { label: "Payment initiated", at: intent.created_at ?? null },
          { label: "Receipt issued", at: row.issued_at },
        ],
        raw: row,
        link: "/app/payments",
      };
    }

    const { data: row, error } = await sb
      .from("transactions")
      .select("*")
      .eq("id", data.record_id)
      .eq("user_id", uid)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw notFound();
    return {
      dataset: "transactions",
      record_id: row.id,
      title: `Transaction ${row.ref ?? row.id.slice(0, 8)}`,
      subtitle: pretty(row.kind),
      status: row.status,
      fields: [
        { label: "Amount", value: money(row.amount), money: true },
        { label: "Kind", value: pretty(row.kind) },
        { label: "Channel", value: pretty(row.channel) },
        { label: "Note", value: row.note ?? "—" },
        { label: "Savings account", value: row.savings_account_id ?? "—" },
        { label: "Loan", value: row.loan_id ?? "—" },
        { label: "Posted", value: day(row.created_at) },
      ],
      timeline: [{ label: "Posted", at: row.created_at }],
      raw: row,
      link: row.savings_account_id ? `/app/savings/${row.savings_account_id}` : "/app/transactions",
    };
  });
