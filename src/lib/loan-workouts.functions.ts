// Loan workouts: reschedule, grace period and write-off requests under the
// two-person rule (requester cannot approve their own request).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const REQUEST_ROLES = new Set(["super_admin", "loan_officer"]);
const DECIDE_ROLES = new Set(["super_admin", "finance_officer"]);
const READ_ROLES = new Set(["super_admin", "loan_officer", "finance_officer", "auditor"]);

async function roleSet(supabase: any, userId: string): Promise<Set<string>> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return new Set((data ?? []).map((r: any) => String(r.role)));
}

async function assertRoles(supabase: any, userId: string, allowed: Set<string>, label: string) {
  const roles = await roleSet(supabase, userId);
  if (!Array.from(roles).some((r) => allowed.has(r))) throw new Error(`Forbidden: ${label}`);
  return roles;
}

export type RestructureRow = {
  id: string;
  loan_id: string;
  loan_ref: string | null;
  member_name: string | null;
  kind: string;
  status: string;
  new_term_months: number | null;
  new_interest_rate: number | null;
  grace_months: number | null;
  write_off_amount: number | null;
  request_note: string | null;
  requested_by: string;
  requested_by_email: string | null;
  requested_at: string;
  decided_by_email: string | null;
  decided_at: string | null;
  decision_note: string | null;
};

export const listLoanRestructures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        status: z.enum(["all", "pending", "approved", "rejected"]).optional().default("pending"),
        loan_id: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(200).optional().default(50),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<RestructureRow[]> => {
    await assertRoles(
      context.supabase,
      context.userId,
      READ_ROLES,
      "loan, finance or audit role required",
    );
    let q = context.supabase
      .from("loan_restructures")
      .select(
        "id, loan_id, kind, status, new_term_months, new_interest_rate, grace_months, write_off_amount, request_note, requested_by, requested_by_email, requested_at, decided_by_email, decided_at, decision_note",
      )
      .order("requested_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.loan_id) q = q.eq("loan_id", data.loan_id);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const loanIds = Array.from(new Set((rows ?? []).map((r: any) => r.loan_id)));
    let loans = new Map<string, any>();
    let profiles = new Map<string, any>();
    if (loanIds.length) {
      const { data: l } = await context.supabase
        .from("loans")
        .select("id, ref, user_id")
        .in("id", loanIds);
      loans = new Map((l ?? []).map((row: any) => [row.id, row]));
      const userIds = Array.from(new Set((l ?? []).map((row: any) => row.user_id)));
      if (userIds.length) {
        const { data: p } = await context.supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        profiles = new Map((p ?? []).map((row: any) => [row.id, row]));
      }
    }

    return (rows ?? []).map((r: any) => {
      const loan = loans.get(r.loan_id);
      return {
        ...r,
        new_interest_rate: r.new_interest_rate == null ? null : Number(r.new_interest_rate),
        write_off_amount: r.write_off_amount == null ? null : Number(r.write_off_amount),
        loan_ref: loan?.ref ?? null,
        member_name: loan ? (profiles.get(loan.user_id)?.full_name ?? null) : null,
      };
    });
  });

export const requestLoanRestructure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const parsed = z
      .object({
        loan_id: z.string().uuid(),
        kind: z.enum(["reschedule", "grace_period", "write_off"]),
        new_term_months: z.number().int().min(1).max(360).nullable().optional(),
        new_interest_rate: z.number().min(0).max(200).nullable().optional(),
        grace_months: z.number().int().min(1).max(24).nullable().optional(),
        write_off_amount: z.number().positive().max(100_000_000).nullable().optional(),
        note: z.string().trim().min(10, "Explain the workout in at least 10 characters").max(1000),
      })
      .parse(d);
    if (
      parsed.kind === "reschedule" &&
      !parsed.new_term_months &&
      parsed.new_interest_rate == null
    ) {
      throw new Error("Reschedule needs a new term and/or a new interest rate");
    }
    if (parsed.kind === "grace_period" && !parsed.grace_months)
      throw new Error("Enter the grace period in months");
    if (parsed.kind === "write_off" && !parsed.write_off_amount)
      throw new Error("Enter the amount to write off");
    return parsed;
  })
  .handler(async ({ data, context }) => {
    await assertRoles(
      context.supabase,
      context.userId,
      REQUEST_ROLES,
      "super admin or loan officer role required",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any).rpc("request_loan_restructure", {
      _loan_id: data.loan_id,
      _kind: data.kind,
      _new_term_months: data.new_term_months ?? null,
      _new_interest_rate: data.new_interest_rate ?? null,
      _grace_months: data.grace_months ?? null,
      _write_off_amount: data.write_off_amount ?? null,
      _note: data.note,
      _actor_id: context.userId,
    });
    if (error) throw new Error(translate(error.message));
    return row;
  });

export const decideLoanRestructure = createServerFn({ method: "POST" })
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
    await assertRoles(
      context.supabase,
      context.userId,
      DECIDE_ROLES,
      "super admin or finance officer role required",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any).rpc("decide_loan_restructure", {
      _request_id: data.request_id,
      _approve: data.approve,
      _note: data.note,
      _actor_id: context.userId,
    });
    if (error) throw new Error(translate(error.message));
    return row;
  });

function translate(message: string): string {
  if (message.includes("two_person_rule"))
    return "Two-person rule: the requester cannot approve their own workout.";
  if (message.includes("already_decided")) return "This workout request has already been decided.";
  if (message.includes("pending_exists")) return "This loan already has a pending workout request.";
  if (message.includes("invalid_kind")) return "Unsupported workout type.";
  return message;
}
