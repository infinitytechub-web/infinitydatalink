import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PendingUserRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  member_no: string | null;
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

export const listPendingUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        status: z.enum(["pending", "rejected", "deactivated", "approved", "all"]).default("pending"),
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
      .select("id, full_name, member_no, status, rejection_reason, created_at", { count: "exact" });
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.search) {
      const s = `%${data.search}%`;
      q = q.or(`full_name.ilike.${s},member_no.ilike.${s}`);
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
    const { error } = await context.supabase.rpc("approve_user", {
      _uid: data.user_id,
      _note: data.note ?? undefined,
    });
    if (error) throw new Error(error.message);
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
    const { error } = await context.supabase.rpc("reject_user", {
      _uid: data.user_id,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
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
    const { error } = await context.supabase.rpc("set_user_active", {
      _uid: data.user_id,
      _active: data.active,
      _reason: data.reason ?? undefined,
    });
    if (error) throw new Error(error.message);
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
