// Guarantors & collateral register for a loan, plus the member-facing
// guarantee consent inbox.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SECURITY_ROLES = new Set(["super_admin", "loan_officer", "finance_officer", "auditor"]);
const SECURITY_WRITE_ROLES = new Set(["super_admin", "loan_officer"]);

async function roleSet(supabase: any, userId: string): Promise<Set<string>> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return new Set((data ?? []).map((r: any) => String(r.role)));
}

async function assertRead(supabase: any, userId: string): Promise<Set<string>> {
  const roles = await roleSet(supabase, userId);
  if (!Array.from(roles).some((r) => SECURITY_ROLES.has(r))) {
    throw new Error("Forbidden: loan, finance or audit role required");
  }
  return roles;
}

async function assertWrite(supabase: any, userId: string) {
  const roles = await roleSet(supabase, userId);
  if (!Array.from(roles).some((r) => SECURITY_WRITE_ROLES.has(r))) {
    throw new Error("Forbidden: super admin or loan officer role required");
  }
}

export type GuarantorRow = {
  id: string;
  loan_id: string;
  member_id: string | null;
  full_name: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  guaranteed_amount: number;
  consent: string;
  consent_at: string | null;
  consent_note: string | null;
  created_at: string;
};

export type CollateralRow = {
  id: string;
  loan_id: string;
  kind: string;
  description: string | null;
  estimated_value: number;
  currency: string;
  reference_no: string | null;
  savings_hold_id: string | null;
  status: string;
  released_at: string | null;
  release_note: string | null;
  created_at: string;
};

export const getLoanSecurity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ loan_id: z.string().uuid() }).parse(d))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ guarantors: GuarantorRow[]; collateral: CollateralRow[] }> => {
      const roles = await assertRead(context.supabase, context.userId);
      // Guarantor phone/email are revoked from `authenticated` at the column
      // level, so they are read through the privileged client *after* the role
      // check, and masked for roles that only need identification (auditors).
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { canSeeRawContacts, maskEmail, maskPhone } = await import("@/lib/pii-mask");
      const showRaw = canSeeRawContacts(roles);
      const [g, c] = await Promise.all([
        (supabaseAdmin as any)
          .from("loan_guarantors")
          .select(
            "id, loan_id, member_id, full_name, relationship, phone, email, guaranteed_amount, consent, consent_at, consent_note, created_at",
          )
          .eq("loan_id", data.loan_id)
          .order("created_at", { ascending: true }),
        context.supabase
          .from("loan_collateral")
          .select(
            "id, loan_id, kind, description, estimated_value, currency, reference_no, savings_hold_id, status, released_at, release_note, created_at",
          )
          .eq("loan_id", data.loan_id)
          .order("created_at", { ascending: true }),
      ]);
      if (g.error) throw new Error(g.error.message);
      if (c.error) throw new Error(c.error.message);
      return {
        guarantors: (g.data ?? []).map((r: any) => ({
          ...r,
          guaranteed_amount: Number(r.guaranteed_amount ?? 0),
          phone: showRaw ? r.phone : maskPhone(r.phone),
          email: showRaw ? r.email : maskEmail(r.email),
        })),
        collateral: (c.data ?? []).map((r: any) => ({
          ...r,
          estimated_value: Number(r.estimated_value ?? 0),
        })),
      };
    },
  );

export const addLoanGuarantor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        loan_id: z.string().uuid(),
        member_id: z.string().uuid().nullable().optional(),
        full_name: z.string().trim().min(2).max(120),
        relationship: z.string().trim().max(80).nullable().optional(),
        phone: z.string().trim().max(32).nullable().optional(),
        email: z.string().trim().email().max(255).nullable().optional(),
        amount: z.number().min(0).max(100_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertWrite(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any).rpc("add_loan_guarantor", {
      _loan_id: data.loan_id,
      _member_id: data.member_id ?? null,
      _full_name: data.full_name,
      _relationship: data.relationship ?? null,
      _phone: data.phone ?? null,
      _email: data.email ?? null,
      _amount: data.amount,
      _actor_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return row;
  });

export const removeLoanGuarantor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ guarantor_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertWrite(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).rpc("remove_loan_guarantor", {
      _guarantor_id: data.guarantor_id,
      _actor_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addLoanCollateral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        loan_id: z.string().uuid(),
        kind: z.string().trim().min(2).max(60),
        description: z.string().trim().max(500).nullable().optional(),
        value: z.number().min(0).max(1_000_000_000),
        reference_no: z.string().trim().max(80).nullable().optional(),
        savings_hold_id: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertWrite(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any).rpc("add_loan_collateral", {
      _loan_id: data.loan_id,
      _kind: data.kind,
      _description: data.description ?? null,
      _value: data.value,
      _reference_no: data.reference_no ?? null,
      _savings_hold_id: data.savings_hold_id ?? null,
      _actor_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return row;
  });

export const releaseLoanCollateral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        collateral_id: z.string().uuid(),
        note: z
          .string()
          .trim()
          .min(5, "A release reason of at least 5 characters is required")
          .max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertWrite(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).rpc("release_loan_collateral", {
      _collateral_id: data.collateral_id,
      _note: data.note,
      _actor_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------- member guarantee inbox ------------------------- */

export type MyGuaranteeRow = GuarantorRow & {
  loan_ref: string | null;
  loan_amount: number | null;
  loan_status: string | null;
  borrower_name: string | null;
};

export const listMyGuarantees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyGuaranteeRow[]> => {
    // Own guarantee records only — contact columns are revoked from
    // `authenticated`, so the read runs through the privileged client with a
    // hard `member_id = self` filter.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("loan_guarantors")
      .select(
        "id, loan_id, member_id, full_name, relationship, phone, email, guaranteed_amount, consent, consent_at, consent_note, created_at",
      )
      .eq("member_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const loanIds = Array.from(new Set((rows ?? []).map((r: any) => r.loan_id)));
    let loans = new Map<string, any>();
    let profiles = new Map<string, any>();
    if (loanIds.length) {
      const { data: l } = await (supabaseAdmin as any)

        .from("loans")
        .select("id, ref, amount, status, user_id")
        .in("id", loanIds);
      loans = new Map((l ?? []).map((row: any) => [row.id, row]));
      const userIds = Array.from(new Set((l ?? []).map((row: any) => row.user_id)));
      if (userIds.length) {
        const { data: p } = await (supabaseAdmin as any)
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
        guaranteed_amount: Number(r.guaranteed_amount ?? 0),
        loan_ref: loan?.ref ?? null,
        loan_amount: loan ? Number(loan.amount) : null,
        loan_status: loan?.status ?? null,
        borrower_name: loan ? (profiles.get(loan.user_id)?.full_name ?? null) : null,
      };
    });
  });

export const respondToGuarantee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        guarantor_id: z.string().uuid(),
        decision: z.enum(["accepted", "declined"]),
        note: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Ownership is enforced inside the RPC against the acting member id.
    const { error } = await (supabaseAdmin as any).rpc("set_guarantor_consent", {
      _guarantor_id: data.guarantor_id,
      _decision: data.decision,
      _note: data.note ?? null,
      _actor_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
