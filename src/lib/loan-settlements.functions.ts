// Early settlement (payoff) requests: member submission, staff approval queue.
//
// Writes go through SECURITY DEFINER routines (`request_loan_settlement`,
// `decide_loan_settlement`, `cancel_loan_settlement`) which own the role checks,
// audit_log entries and member notifications. Server functions here add the
// RBAC gate for the read/decide surfaces and recompute the quote server-side so
// the stored figure can never be tampered with from the browser.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole, loadRoleSet, type Role } from "@/lib/role-guards";
import { computePayoffQuote } from "@/lib/loan-payoff-core";

const READ_ROLES: readonly Role[] = [
  "super_admin",
  "finance_officer",
  "loan_officer",
  "auditor",
  "compliance_officer",
];
const DECIDE_ROLES: readonly Role[] = ["super_admin", "finance_officer"];

export type SettlementRequestRow = {
  id: string;
  loan_id: string;
  loan_ref: string | null;
  product: string | null;
  user_id: string;
  member_name: string | null;
  member_no: string | null;
  settle_on: string;
  quoted_total: number;
  outstanding_principal: number | null;
  member_note: string | null;
  status: string;
  requested_at: string;
  decided_by_email: string | null;
  decided_at: string | null;
  decision_note: string | null;
};

const STATUS = z.enum(["all", "pending", "approved", "rejected", "cancelled"]);

async function hydrate(supabase: any, rows: any[]): Promise<SettlementRequestRow[]> {
  const loanIds = Array.from(new Set(rows.map((r) => r.loan_id)));
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  let loans = new Map<string, any>();
  let profiles = new Map<string, any>();
  if (loanIds.length) {
    const { data } = await supabase
      .from("loans")
      .select("id, ref, product, outstanding_principal")
      .in("id", loanIds);
    loans = new Map((data ?? []).map((l: any) => [l.id, l]));
  }
  if (userIds.length) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, member_no")
      .in("id", userIds);
    profiles = new Map((data ?? []).map((p: any) => [p.id, p]));
  }
  return rows.map((r) => {
    const loan = loans.get(r.loan_id);
    const profile = profiles.get(r.user_id);
    return {
      id: String(r.id),
      loan_id: String(r.loan_id),
      loan_ref: loan?.ref ?? null,
      product: loan?.product ?? null,
      user_id: String(r.user_id),
      member_name: profile?.full_name ?? null,
      member_no: profile?.member_no ?? null,
      settle_on: String(r.settle_on),
      quoted_total: Number(r.quoted_total ?? 0),
      outstanding_principal:
        loan?.outstanding_principal == null ? null : Number(loan.outstanding_principal),
      member_note: r.member_note ?? null,
      status: String(r.status),
      requested_at: String(r.requested_at),
      decided_by_email: r.decided_by_email ?? null,
      decided_at: r.decided_at ?? null,
      decision_note: r.decision_note ?? null,
    };
  });
}

/** Staff approval queue + decision history. */
export const listSettlementRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        status: STATUS.optional().default("all"),
        limit: z.number().int().min(1).max(200).optional().default(100),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<SettlementRequestRow[]> => {
    const roles = await loadRoleSet(context.supabase, context.userId);
    assertAnyRole(roles, READ_ROLES, "finance, loan or audit");

    let q = context.supabase
      .from("loan_settlement_requests")
      .select(
        "id, loan_id, user_id, settle_on, quoted_total, member_note, status, requested_at, decided_by_email, decided_at, decision_note",
      )
      .order("requested_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") q = q.eq("status", data.status);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return hydrate(context.supabase, (rows ?? []) as any[]);
  });

/** Approve or reject — super admin / finance officer only, decision note required. */
export const decideSettlementRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        request_id: z.string().uuid(),
        approve: z.boolean(),
        note: z
          .string()
          .trim()
          .min(10, "A decision note of at least 10 characters is required")
          .max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await loadRoleSet(context.supabase, context.userId);
    assertAnyRole(roles, DECIDE_ROLES, "super admin or finance officer");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any).rpc("decide_loan_settlement", {
      _request_id: data.request_id,
      _approve: data.approve,
      _note: data.note,
      _actor_id: context.userId,
    });
    if (error) throw new Error(translate(error.message));
    return row;
  });

/** Member (or staff on their behalf) raises a settlement request. */
export const requestLoanSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        loan_id: z.string().uuid(),
        settle_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD settlement date"),
        note: z.string().trim().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Recompute the quote under the caller's RLS scope — never trust a client total.
    const quote = await computePayoffQuote(context.supabase, {
      loan_id: data.loan_id,
      settle_on: data.settle_on,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any).rpc("request_loan_settlement", {
      _loan_id: data.loan_id,
      _settle_on: data.settle_on,
      _quoted_total: quote.total_payoff,
      _quote: {
        lines: quote.lines,
        outstanding_principal: quote.outstanding_principal,
        interest_past_due: quote.interest_past_due,
        interest_accrued: quote.interest_accrued,
        penalties_outstanding: quote.penalties_outstanding,
        interest_rebate: quote.interest_rebate,
        savings_balance: quote.savings_balance,
        shortfall: quote.shortfall,
        quoted_at: quote.quoted_at,
      },
      _note: data.note ?? null,
      _actor_id: context.userId,
    });
    if (error) throw new Error(translate(error.message));
    return row;
  });

/** Member's own settlement requests for a loan (or all of them). */
export const listMySettlementRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ loan_id: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("loan_settlement_requests")
      .select(
        "id, loan_id, settle_on, quoted_total, member_note, status, requested_at, decided_at, decision_note",
      )
      .eq("user_id", context.userId)
      .order("requested_at", { ascending: false })
      .limit(50);
    if (data.loan_id) q = q.eq("loan_id", data.loan_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      id: String(r.id),
      loan_id: String(r.loan_id),
      settle_on: String(r.settle_on),
      quoted_total: Number(r.quoted_total ?? 0),
      member_note: r.member_note ?? null,
      status: String(r.status),
      requested_at: String(r.requested_at),
      decided_at: r.decided_at ?? null,
      decision_note: r.decision_note ?? null,
    }));
  });

/** Withdraw a pending request (own request, or staff cancelling on request). */
export const cancelSettlementRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        request_id: z.string().uuid(),
        note: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any).rpc("cancel_loan_settlement", {
      _request_id: data.request_id,
      _note: data.note ?? null,
      _actor_id: context.userId,
    });
    if (error) throw new Error(translate(error.message));
    return row;
  });

function translate(message: string): string {
  if (message.includes("two_person_rule"))
    return "You cannot decide a settlement request you raised yourself.";
  if (message.includes("already_decided"))
    return "This settlement request has already been decided.";
  if (message.includes("pending_exists"))
    return "This loan already has a settlement request awaiting a decision.";
  if (message.includes("note_required"))
    return "A decision note of at least 10 characters is required.";
  if (message.includes("loan_not_settleable")) return "Only active loans can be settled early.";
  if (message.includes("invalid_settle_date")) return "Pick a settlement date of today or later.";
  if (message.includes("request_not_found")) return "Settlement request not found.";
  if (message.includes("loan_not_found")) return "Loan not found.";
  if (message.includes("forbidden")) return "You do not have permission to perform this action.";
  return message;
}
