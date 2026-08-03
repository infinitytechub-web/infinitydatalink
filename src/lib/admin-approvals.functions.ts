import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recordDecision } from "@/lib/decision-audit";

export type PendingUserRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  member_no: string | null;
  ghana_card: string | null;
  phone: string | null;
  membership_type: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
};


async function assertReviewer(supabase: any, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: any) => r.role as string);
  if (!(roles.includes("super_admin") || roles.includes("compliance_officer"))) {
    throw new Error("Forbidden: super_admin or compliance_officer required");
  }
}

/** Role-checks the caller and returns the role used for the audit trail. */
async function assertReviewerRole(supabase: any, userId: string): Promise<string> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: any) => r.role as string);
  if (roles.includes("super_admin")) return "super_admin";
  if (roles.includes("compliance_officer")) return "compliance_officer";
  throw new Error("Forbidden: super_admin or compliance_officer required");
}

export const listPendingUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        status: z.enum(["pending", "rejected", "deactivated", "approved", "all"]).default("pending"),
        membership_type: z
          .enum(["individual", "group", "department", "institution", "all"])
          .optional()
          .default("all"),
        search: z.string().trim().max(200).optional().default(""),
        page: z.number().int().min(1).optional().default(1),
        pageSize: z.number().int().min(5).max(100).optional().default(25),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ rows: PendingUserRow[]; total: number }> => {
    await assertReviewer(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = (supabaseAdmin as any)
      .from("profiles")
      .select(
        "id, full_name, member_no, ghana_card, phone, membership_type, status, rejection_reason, created_at",
        { count: "exact" },
      );
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.membership_type !== "all") q = q.eq("membership_type", data.membership_type);
    if (data.search) {
      const s = `%${data.search.replace(/[%,()*]/g, "")}%`;
      q = q.or(`full_name.ilike.${s},member_no.ilike.${s},ghana_card.ilike.${s},phone.ilike.${s}`);
    }
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: profiles, count, error } = await q.order("created_at", { ascending: false }).range(from, to);
    if (error) throw new Error(error.message);
    // Fetch emails from auth.users via admin
    const ids = (profiles ?? []).map((p: any) => p.id);
    const emailMap = new Map<string, string>();
    if (ids.length) {
      const { data: usersRes } = await (supabaseAdmin as any).auth.admin.listUsers({ page: 1, perPage: 200 });
      for (const u of usersRes?.users ?? []) {
        if (u.email && ids.includes(u.id)) emailMap.set(u.id, u.email);
      }
    }
    const rows: PendingUserRow[] = (profiles ?? []).map((p: any) => ({
      user_id: p.id,
      email: emailMap.get(p.id) ?? null,
      full_name: p.full_name,
      member_no: p.member_no,
      ghana_card: p.ghana_card ?? null,
      phone: p.phone ?? null,
      membership_type: p.membership_type ?? null,
      status: p.status,
      rejection_reason: p.rejection_reason,
      created_at: p.created_at,
    }));

    return { rows, total: count ?? rows.length };
  });

export const approveUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ user_id: z.string().uuid(), note: z.string().trim().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const actorRole = await assertReviewerRole(context.supabase, context.userId);
    // The decision routines are service_role-only (no client write path), so we
    // pass the already-authenticated officer id explicitly; the routine re-checks
    // the officer's role before writing.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("approve_user", {
      _uid: data.user_id,
      _note: data.note ?? null,
      _actor: context.userId,
    } as never);
    if (error) throw new Error(error.message);
    await recordDecision({
      actorId: context.userId,
      actorEmail: (context.claims as any)?.email ?? null,
      actorRole,
      module: "user",
      outcome: "approved",
      target: data.user_id,
      subjectId: data.user_id,
      note: data.note ?? null,
    });
    // In-app notification so the member knows they can now sign in and start
    // verification. Never fail the approval on notification errors.
    const { error: notifyErr } = await supabaseAdmin.rpc("notify_user", {
      _user_id: data.user_id,
      _category: "account.registration.approved",
      _title: "Membership approved",
      _body: "Your registration has been approved. Sign in and complete your KYC verification to unlock your dashboard.",
      _link: "/app/kyc",
      _meta: { note: data.note ?? null },
      _dedupe_key: `user.approved:${data.user_id}`,
    } as never);
    if (notifyErr) console.error("approval notification failed", notifyErr.message);
    return { ok: true as const };
  });



export const rejectUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ user_id: z.string().uuid(), reason: z.string().trim().min(3).max(500) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const actorRole = await assertReviewerRole(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("reject_user", {
      _uid: data.user_id,
      _reason: data.reason,
      _actor: context.userId,
    } as never);
    if (error) throw new Error(error.message);
    const { error: notifyErr } = await supabaseAdmin.rpc("notify_user", {
      _user_id: data.user_id,
      _category: "account.registration.rejected",
      _title: "Registration not approved",
      _body: `Your registration could not be approved. Reason: ${data.reason}`,
      _link: "/auth",
      _meta: { reason: data.reason },
      _dedupe_key: `user.rejected:${data.user_id}`,
    } as never);
    if (notifyErr) console.error("rejection notification failed", notifyErr.message);

    await recordDecision({
      actorId: context.userId,
      actorEmail: (context.claims as any)?.email ?? null,
      actorRole,
      module: "user",
      outcome: "rejected",
      target: data.user_id,
      subjectId: data.user_id,
      note: data.reason,
    });
    return { ok: true as const };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        active: z.boolean(),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const actorRole = await assertReviewerRole(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("set_user_active", {
      _uid: data.user_id,
      _active: data.active,
      _reason: data.reason ?? null,
      _actor: context.userId,
    } as never);
    if (error) throw new Error(error.message);

    await recordDecision({
      actorId: context.userId,
      actorEmail: (context.claims as any)?.email ?? null,
      actorRole,
      module: "user",
      outcome: data.active ? "activated" : "deactivated",
      target: data.user_id,
      subjectId: data.user_id,
      note: data.reason ?? null,
    });
    return { ok: true as const };
  });

/** Read current user's approval status — used by session gate */
export const getMyApprovalStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("status, rejection_reason")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      status: ((data as any)?.status ?? "pending") as
        | "pending"
        | "approved"
        | "rejected"
        | "deactivated",
      rejection_reason: ((data as any)?.rejection_reason ?? null) as string | null,
    };
  });

/**
 * Permanently deletes a user account (auth user + profile) so the person can
 * re-register from scratch. Super admin only, reason mandatory. A snapshot of
 * the profile is archived into the recycle bin before removal.
 */
export const deleteUserPermanently = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ user_id: z.string().uuid(), reason: z.string().trim().min(10).max(500) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: roleRows, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleErr) throw new Error(roleErr.message);
    const roles = (roleRows ?? []).map((r: any) => r.role as string);
    if (!roles.includes("super_admin")) throw new Error("Forbidden: super_admin required");
    if (data.user_id === context.userId) throw new Error("You cannot delete your own account");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Refuse to delete accounts that still hold financial records.
    for (const table of ["savings_accounts", "loans", "transactions"] as const) {
      const { count, error } = await (supabaseAdmin as any)
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq(table === "transactions" ? "user_id" : "member_id", data.user_id);
      if (!error && (count ?? 0) > 0) {
        throw new Error(
          `This member has ${count} ${table.replace("_", " ")} record(s). Deactivate instead of deleting.`,
        );
      }
    }

    const { data: profile } = await (supabaseAdmin as any)
      .from("profiles")
      .select("*")
      .eq("id", data.user_id)
      .maybeSingle();

    const { error: binErr } = await (supabaseAdmin as any).from("recycle_bin").insert({
      entity_table: "profiles",
      entity_id: data.user_id,
      payload: { profile: profile ?? null, reason: data.reason, deleted_by: context.userId },
      deleted_by: context.userId,
    });
    if (binErr) throw new Error(binErr.message);

    const { error: delProfileErr } = await (supabaseAdmin as any)
      .from("profiles")
      .delete()
      .eq("id", data.user_id);
    if (delProfileErr) throw new Error(delProfileErr.message);

    const { error: authErr } = await (supabaseAdmin as any).auth.admin.deleteUser(data.user_id);
    if (authErr && !/not found/i.test(authErr.message)) throw new Error(authErr.message);

    await recordDecision({
      actorId: context.userId,
      actorEmail: (context.claims as any)?.email ?? null,
      actorRole: "super_admin",
      module: "user",
      outcome: "deleted",
      target: data.user_id,
      subjectId: data.user_id,
      note: data.reason,
    });
    return { ok: true as const };
  });
