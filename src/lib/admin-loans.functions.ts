import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ADMIN_ROLES = new Set([
  "super_admin",
  "compliance_officer",
  "loan_officer",
  "finance_officer",
  "auditor",
]);

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role as string);
  const isAdmin = roles.some((r: string) => ADMIN_ROLES.has(r));
  if (!isAdmin) throw new Error("Forbidden: admin role required");
  return roles[0] ?? "member";
}

export type AdminLoanRow = {
  id: string;
  ref: string;
  product: string;
  amount: number;
  term_months: number;
  interest_rate: number;
  status: "pending" | "approved" | "rejected" | "active" | "closed";
  purpose: string | null;
  created_at: string;
  decided_at: string | null;
  user_id: string;
  member_name: string | null;
  member_no: string | null;
};

export const listAdminLoans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        status: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<AdminLoanRow[]> => {
    await assertAdmin(context.supabase, context.userId);
    let q = context.supabase
      .from("loans")
      .select("id, ref, product, amount, term_months, interest_rate, status, purpose, created_at, decided_at, user_id")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status as any);
    const { data: loans, error } = await q;
    if (error) throw new Error(error.message);

    const userIds = Array.from(new Set((loans ?? []).map((l: any) => l.user_id)));
    let profileMap = new Map<string, { full_name: string | null; member_no: string | null }>();
    if (userIds.length) {
      const { data: profiles } = await context.supabase
        .from("profiles")
        .select("id, full_name, member_no")
        .in("id", userIds);
      profileMap = new Map((profiles ?? []).map((p: any) => [p.id, { full_name: p.full_name, member_no: p.member_no }]));
    }

    return (loans ?? []).map((l: any) => ({
      ...l,
      amount: Number(l.amount),
      interest_rate: Number(l.interest_rate),
      member_name: profileMap.get(l.user_id)?.full_name ?? null,
      member_no: profileMap.get(l.user_id)?.member_no ?? null,
    }));
  });

export const decideLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        loan_id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        note: z
          .string()
          .trim()
          .min(5, "A decision note of at least 5 characters is required")
          .max(1000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<AdminLoanRow> => {
    const role = await assertAdmin(context.supabase, context.userId);

    const { data: current, error: fetchErr } = await context.supabase
      .from("loans")
      .select("id, status, ref, user_id")
      .eq("id", data.loan_id)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!current) throw new Error("Loan not found");
    if (current.status !== "pending") throw new Error(`Cannot decide loan in status “${current.status}”`);

    const { data: updated, error } = await context.supabase
      .from("loans")
      .update({
        status: data.decision,
        decided_at: new Date().toISOString(),
        decided_by: context.userId,
        decision_note: data.note,
      })
      .eq("id", data.loan_id)
      .select("id, ref, product, amount, term_months, interest_rate, status, purpose, created_at, decided_at, user_id")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_log").insert({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: role,
      action: data.decision === "approved" ? "loan.approved" : "loan.rejected",
      target: updated.id,
      meta: { ref: updated.ref, note: data.note, amount: Number(updated.amount), member_id: updated.user_id },
    });

    return {
      ...updated,
      amount: Number(updated.amount),
      interest_rate: Number(updated.interest_rate),
      member_name: null,
      member_no: null,
    };
  });

export type LoanAuditEntry = {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  target: string | null;
  loan_ref: string | null;
  note: string | null;
  amount: number | null;
  member_id: string | null;
  member_name: string | null;
  member_no: string | null;
};

export type LoanAuditPage = {
  rows: LoanAuditEntry[];
  total: number;
  page: number;
  pageSize: number;
};

export const listLoanAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        decision: z.enum(["approved", "rejected", "all"]).default("all"),
        member: z.string().trim().max(120).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(100).default(25),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<LoanAuditPage> => {
    await assertAdmin(context.supabase, context.userId);

    const actions =
      data.decision === "approved"
        ? ["loan.approved"]
        : data.decision === "rejected"
        ? ["loan.rejected"]
        : ["loan.approved", "loan.rejected"];

    const fromIdx = (data.page - 1) * data.pageSize;
    const toIdx = fromIdx + data.pageSize - 1;

    let q = context.supabase
      .from("audit_log")
      .select("id, created_at, actor_id, actor_email, actor_role, action, target, meta", { count: "exact" })
      .in("action", actions)
      .order("created_at", { ascending: false });

    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);

    const { data: rows, error, count } = await q.range(fromIdx, toIdx);
    if (error) throw new Error(error.message);

    const memberIds = Array.from(
      new Set(
        (rows ?? [])
          .map((r: any) => (r.meta && typeof r.meta === "object" ? r.meta.member_id : null))
          .filter(Boolean) as string[],
      ),
    );
    let profileMap = new Map<string, { full_name: string | null; member_no: string | null }>();
    if (memberIds.length) {
      const { data: profiles } = await context.supabase
        .from("profiles")
        .select("id, full_name, member_no")
        .in("id", memberIds);
      profileMap = new Map(
        (profiles ?? []).map((p: any) => [p.id, { full_name: p.full_name, member_no: p.member_no }]),
      );
    }

    let entries: LoanAuditEntry[] = (rows ?? []).map((r: any) => {
      const meta = (r.meta && typeof r.meta === "object" ? r.meta : {}) as Record<string, any>;
      const memberId = (meta.member_id as string | undefined) ?? null;
      const profile = memberId ? profileMap.get(memberId) : undefined;
      return {
        id: r.id,
        created_at: r.created_at,
        actor_id: r.actor_id,
        actor_email: r.actor_email,
        actor_role: r.actor_role,
        action: r.action,
        target: r.target,
        loan_ref: (meta.ref as string | undefined) ?? null,
        note: (meta.note as string | undefined) ?? null,
        amount: meta.amount != null ? Number(meta.amount) : null,
        member_id: memberId,
        member_name: profile?.full_name ?? null,
        member_no: profile?.member_no ?? null,
      };
    });

    if (data.member) {
      const needle = data.member.toLowerCase();
      entries = entries.filter(
        (e) =>
          (e.member_name ?? "").toLowerCase().includes(needle) ||
          (e.member_no ?? "").toLowerCase().includes(needle) ||
          (e.loan_ref ?? "").toLowerCase().includes(needle),
      );
    }

    return {
      rows: entries,
      total: count ?? entries.length,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

// ================= Disbursement & repayments =================
export type LoanScheduleRow = {
  id: string;
  installment_no: number;
  due_date: string;
  principal_due: number;
  interest_due: number;
  total_due: number;
  paid_amount: number;
  paid_at: string | null;
  status: "due" | "partial" | "paid" | "late";
};

export type LoanDetail = AdminLoanRow & {
  disbursed_at: string | null;
  disbursed_by: string | null;
  outstanding_principal: number;
  monthly_payment: number | null;
  first_payment_at: string | null;
  maturity_at: string | null;
  decision_note: string | null;
  schedule: LoanScheduleRow[];
};

export const getAdminLoanDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ loan_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<LoanDetail> => {
    await assertAdmin(context.supabase, context.userId);
    const { data: loan, error } = await context.supabase
      .from("loans")
      .select(
        "id, ref, product, amount, term_months, interest_rate, status, purpose, created_at, decided_at, decision_note, user_id, disbursed_at, disbursed_by, outstanding_principal, monthly_payment, first_payment_at, maturity_at",
      )
      .eq("id", data.loan_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!loan) throw new Error("Loan not found");

    const { data: profile } = await context.supabase
      .from("profiles").select("full_name, member_no").eq("id", loan.user_id).maybeSingle();
    const { data: sched } = await context.supabase
      .from("loan_repayments")
      .select("id, installment_no, due_date, principal_due, interest_due, total_due, paid_amount, paid_at, status")
      .eq("loan_id", loan.id)
      .order("installment_no", { ascending: true });

    return {
      ...(loan as any),
      amount: Number(loan.amount),
      interest_rate: Number(loan.interest_rate),
      outstanding_principal: Number(loan.outstanding_principal ?? 0),
      monthly_payment: loan.monthly_payment != null ? Number(loan.monthly_payment) : null,
      member_name: profile?.full_name ?? null,
      member_no: profile?.member_no ?? null,
      schedule: (sched ?? []).map((r: any) => ({
        ...r,
        principal_due: Number(r.principal_due),
        interest_due: Number(r.interest_due),
        total_due: Number(r.total_due),
        paid_amount: Number(r.paid_amount),
      })),
    } as LoanDetail;
  });

export const disburseLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      loan_id: z.string().uuid(),
      channel: z.string().trim().min(2).max(40),
      note: z.string().trim().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: loan, error } = await context.supabase.rpc("disburse_loan", {
      _loan_id: data.loan_id,
      _channel: data.channel,
      _note: data.note ?? "",
    });
    if (error) throw new Error(error.message);
    return loan;
  });

export const recordLoanRepayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      loan_id: z.string().uuid(),
      amount: z.number().positive().max(100_000_000),
      channel: z.string().trim().min(2).max(40),
      note: z.string().trim().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: loan, error } = await context.supabase.rpc("record_loan_repayment", {
      _loan_id: data.loan_id,
      _amount: data.amount,
      _channel: data.channel,
      _note: data.note ?? "",
    });
    if (error) throw new Error(error.message);
    return loan;
  });
