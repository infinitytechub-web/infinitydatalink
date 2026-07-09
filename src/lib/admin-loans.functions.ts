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
        note: z.string().max(1000).optional(),
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
        decision_note: data.note ?? null,
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
      meta: { ref: updated.ref, note: data.note ?? null, amount: Number(updated.amount) },
    });

    return {
      ...updated,
      amount: Number(updated.amount),
      interest_rate: Number(updated.interest_rate),
      member_name: null,
      member_no: null,
    };
  });
