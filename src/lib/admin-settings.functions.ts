import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recordDecision } from "@/lib/decision-audit";

// ---- Types ---------------------------------------------------------------

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export type SettingsChangeKind = "branding" | "institution" | "role_grant" | "role_revoke";
export type SettingsChangeStatus = "pending" | "approved" | "rejected" | "applied" | "failed";

export type SettingsChangeRequest = {
  id: string;
  kind: SettingsChangeKind;
  status: SettingsChangeStatus;
  payload: Json;
  summary: string | null;
  requested_by: string;
  requested_at: string;
  requester_email: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_email: string | null;
  review_note: string | null;
  applied_at: string | null;
  error: string | null;
};

export type SnapshotRow = {
  id: string;
  label: string;
  note: string | null;
  branding: Json | null;
  created_by: string;
  created_by_email: string | null;
  created_at: string;
};

// ---- Role assertion ------------------------------------------------------

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: any) => r.role as string);
  if (!roles.includes("super_admin")) throw new Error("Forbidden: super_admin role required");
}

// ---- Change requests -----------------------------------------------------

export const listSettingsChangeRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        status: z
          .enum(["all", "pending", "approved", "rejected", "applied", "failed"])
          .default("all"),
        kind: z
          .enum(["all", "branding", "institution", "role_grant", "role_revoke"])
          .default("all"),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ rows: SettingsChangeRequest[]; total: number }> => {
    await assertSuperAdmin(context.supabase, context.userId);
    let q = context.supabase
      .from("settings_change_requests")
      .select("*", { count: "exact" })
      .order("requested_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.kind !== "all") q = q.eq("kind", data.kind);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);

    // Enrich with actor emails
    const ids = new Set<string>();
    for (const r of (rows ?? []) as any[]) {
      if (r.requested_by) ids.add(r.requested_by);
      if (r.reviewed_by) ids.add(r.reviewed_by);
    }
    const emails = new Map<string, string>();
    if (ids.size) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: users } = await supabaseAdmin
        .from("profiles")
        .select("id, email")
        .in("id", Array.from(ids));
      for (const u of (users ?? []) as any[]) if (u.email) emails.set(u.id, u.email);
    }

    const out: SettingsChangeRequest[] = (rows ?? []).map((r: any) => ({
      id: r.id,
      kind: r.kind,
      status: r.status,
      payload: r.payload ?? {},
      summary: r.summary,
      requested_by: r.requested_by,
      requested_at: r.requested_at,
      requester_email: emails.get(r.requested_by) ?? null,
      reviewed_by: r.reviewed_by,
      reviewed_at: r.reviewed_at,
      reviewer_email: r.reviewed_by ? (emails.get(r.reviewed_by) ?? null) : null,
      review_note: r.review_note,
      applied_at: r.applied_at,
      error: r.error,
    }));

    return { rows: out, total: count ?? out.length };
  });

export const pendingChangeCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<number> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { count, error } = await context.supabase
      .from("settings_change_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return count ?? 0;
  });

export const requestSettingsChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        kind: z.enum(["branding", "institution", "role_grant", "role_revoke"]),
        payload: z.record(z.string(), z.unknown()),
        summary: z.string().trim().min(3, "Summary required").max(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: id, error } = await supabaseAdmin.rpc("request_settings_change", {
      _kind: data.kind,
      _payload: data.payload as any,
      _summary: data.summary,
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const approveSettingsChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        note: z.string().trim().max(500).default(""),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("approve_settings_change", {
      _id: data.id,
      _note: (data.note || null) as any,
    });
    if (error) throw new Error(error.message);
    await recordDecision({
      actorId: context.userId,
      actorEmail: (context.claims as any)?.email ?? null,
      actorRole: "super_admin",
      module: "settings",
      outcome: "approved",
      target: data.id,
      note: data.note || null,
      meta: { kind: (row as any)?.kind ?? null, summary: (row as any)?.summary ?? null },
    });
    return row as any;
  });

export const rejectSettingsChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        reason: z.string().trim().min(3, "Reason is required").max(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("reject_settings_change", {
      _id: data.id,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    await recordDecision({
      actorId: context.userId,
      actorEmail: (context.claims as any)?.email ?? null,
      actorRole: "super_admin",
      module: "settings",
      outcome: "rejected",
      target: data.id,
      note: data.reason,
    });
    return { ok: true as const };
  });

// ---- Snapshots -----------------------------------------------------------

export const listSnapshots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SnapshotRow[]> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("settings_snapshots")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = Array.from(
      new Set(((rows ?? []) as any[]).map((r) => r.created_by).filter(Boolean)),
    );
    const emails = new Map<string, string>();
    if (ids.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // profiles has no email column — pull emails from auth.users via admin API
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const u of list?.users ?? []) {
        if (u.id && ids.includes(u.id) && u.email) emails.set(u.id, u.email);
      }
    }
    return ((rows ?? []) as any[]).map((r) => ({
      id: r.id,
      label: r.label,
      note: r.note,
      branding: r.branding,
      created_by: r.created_by,
      created_by_email: emails.get(r.created_by) ?? null,
      created_at: r.created_at,
    }));
  });

export const createSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        label: z.string().trim().max(120).default(""),
        note: z.string().trim().max(500).default(""),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("create_settings_snapshot", {
      _label: data.label,
      _note: (data.note || null) as any,
    });
    if (error) throw new Error(error.message);
    return row as SnapshotRow;
  });

export const restoreSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("restore_settings_snapshot", { _id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("settings_snapshots").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---- Audit log ----------------------------------------------------------

export type AuditRow = {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  target: string | null;
  meta: Json;
};

export const listConsoleAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        emailContains: z.string().trim().max(320).default(""),
        actionContains: z.string().trim().max(200).default(""),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ rows: AuditRow[]; total: number }> => {
    await assertSuperAdmin(context.supabase, context.userId);
    let q = context.supabase
      .from("audit_log")
      .select("id, created_at, actor_id, actor_email, actor_role, action, target, meta", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (data.emailContains) q = q.ilike("actor_email", `%${data.emailContains}%`);
    if (data.actionContains) q = q.ilike("action", `%${data.actionContains}%`);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as AuditRow[], total: count ?? 0 };
  });
