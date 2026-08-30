import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/permissions";
import { recordDecision } from "@/lib/decision-audit";
import {
  CHANGE_KINDS,
  CHANGE_STATUSES,
  type ChangeKind,
  type ChangeStatus,
} from "@/lib/change-approvals";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export type ChangeRequestRow = {
  id: string;
  kind: ChangeKind;
  status: ChangeStatus;
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
  /** True when the signed-in reviewer raised this request (two-person rule). */
  is_own_request: boolean;
};

export type ChangeAuditRow = {
  id: string;
  created_at: string;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  target: string | null;
  meta: Json;
};

const CHANGE_ACTIONS = [
  "settings.change.requested",
  "settings.change.approved",
  "settings.change.rejected",
  "settings.change.applied",
] as const;

async function emailsFor(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = new Set(ids.filter(Boolean));
  if (!unique.size) return out;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const user of list?.users ?? []) {
    if (user.id && user.email && unique.has(user.id)) out.set(user.id, user.email);
  }
  return out;
}

function toRow(
  r: Record<string, any>,
  emails: Map<string, string>,
  viewerId: string,
): ChangeRequestRow {
  return {
    id: r["id"],
    kind: r["kind"],
    status: r["status"],
    payload: r["payload"] ?? {},
    summary: r["summary"] ?? null,
    requested_by: r["requested_by"],
    requested_at: r["requested_at"],
    requester_email: emails.get(r["requested_by"]) ?? null,
    reviewed_by: r["reviewed_by"] ?? null,
    reviewed_at: r["reviewed_at"] ?? null,
    reviewer_email: r["reviewed_by"] ? (emails.get(r["reviewed_by"]) ?? null) : null,
    review_note: r["review_note"] ?? null,
    applied_at: r["applied_at"] ?? null,
    error: r["error"] ?? null,
    is_own_request: r["requested_by"] === viewerId,
  };
}

/** Paginated, filterable list of change requests. */
export const listChangeRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        status: z.enum(["all", ...CHANGE_STATUSES]).default("pending"),
        kind: z.enum(["all", ...CHANGE_KINDS]).default("all"),
        search: z.string().trim().max(200).default(""),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        sortDir: z.enum(["asc", "desc"]).default("desc"),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(100).default(25),
      })
      .parse(data ?? {}),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ rows: ChangeRequestRow[]; total: number; counts: Record<string, number> }> => {
      await assertPermission(context.supabase, context.userId, "approvals", "view");
      const offset = (data.page - 1) * data.pageSize;

      let q = context.supabase
        .from("settings_change_requests")
        .select("*", { count: "exact" })
        .order("requested_at", { ascending: data.sortDir === "asc" })
        .range(offset, offset + data.pageSize - 1);
      if (data.status !== "all") q = q.eq("status", data.status);
      if (data.kind !== "all") q = q.eq("kind", data.kind);
      if (data.from) q = q.gte("requested_at", data.from);
      if (data.to) q = q.lte("requested_at", data.to);
      if (data.search) q = q.ilike("summary", `%${data.search.replace(/[%_,]/g, "")}%`);

      const { data: rows, error, count } = await q;
      if (error) throw new Error(error.message);

      const list = (rows ?? []) as Array<Record<string, any>>;
      const emails = await emailsFor(list.flatMap((r) => [r["requested_by"], r["reviewed_by"]]));

      // Status tallies for the KPI strip (unfiltered by status).
      const counts: Record<string, number> = {};
      for (const status of CHANGE_STATUSES) {
        const { count: c } = await context.supabase
          .from("settings_change_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", status);
        counts[status] = c ?? 0;
      }

      return {
        rows: list.map((r) => toRow(r, emails, context.userId)),
        total: count ?? list.length,
        counts,
      };
    },
  );

/** One request plus its own audit trail. */
export const getChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(
    async ({ data, context }): Promise<{ request: ChangeRequestRow; audit: ChangeAuditRow[] }> => {
      await assertPermission(context.supabase, context.userId, "approvals", "view");
      const { data: row, error } = await context.supabase
        .from("settings_change_requests")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error("Change request not found");

      const r = row as Record<string, any>;
      const emails = await emailsFor([r["requested_by"], r["reviewed_by"]]);

      const { data: audit } = await context.supabase
        .from("audit_log")
        .select("id, created_at, actor_email, actor_role, action, target, meta")
        .eq("target", data.id)
        .order("created_at", { ascending: true })
        .limit(100);

      return {
        request: toRow(r, emails, context.userId),
        audit: ((audit ?? []) as Array<Record<string, any>>).map((a) => ({
          id: a["id"],
          created_at: a["created_at"],
          actor_email: a["actor_email"] ?? null,
          actor_role: a["actor_role"] ?? null,
          action: a["action"],
          target: a["target"] ?? null,
          meta: a["meta"] ?? {},
        })),
      };
    },
  );

/** Full audit history for the change-approval lifecycle. */
export const listChangeAuditHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        action: z.enum(["all", ...CHANGE_ACTIONS]).default("all"),
        actorContains: z.string().trim().max(320).default(""),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(100).default(25),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ rows: ChangeAuditRow[]; total: number }> => {
    await assertPermission(context.supabase, context.userId, "approvals", "view");
    const offset = (data.page - 1) * data.pageSize;
    let q = context.supabase
      .from("audit_log")
      .select("id, created_at, actor_email, actor_role, action, target, meta", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + data.pageSize - 1);
    q =
      data.action === "all"
        ? q.in("action", CHANGE_ACTIONS as unknown as string[])
        : q.eq("action", data.action);
    if (data.actorContains)
      q = q.ilike("actor_email", `%${data.actorContains.replace(/[%_,]/g, "")}%`);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return {
      rows: ((rows ?? []) as Array<Record<string, any>>).map((a) => ({
        id: a["id"],
        created_at: a["created_at"],
        actor_email: a["actor_email"] ?? null,
        actor_role: a["actor_role"] ?? null,
        action: a["action"],
        target: a["target"] ?? null,
        meta: a["meta"] ?? {},
      })),
      total: count ?? 0,
    };
  });

/** Stage a new change request. Nothing is applied until a second person approves. */
export const createChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        kind: z.enum(CHANGE_KINDS),
        summary: z.string().trim().min(5, "Summary must be at least 5 characters").max(500),
        payload: z.record(z.string(), z.unknown()),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await assertPermission(context.supabase, context.userId, "approvals", "create");
    const { data: id, error } = await (context.supabase as any).rpc("request_settings_change", {
      _kind: data.kind,
      _payload: data.payload,
      _summary: data.summary,
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

/** Approve a pending request — the database applies it in the same transaction. */
export const approveChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        note: z.string().trim().min(5, "A decision comment is required").max(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ status: ChangeStatus; error: string | null }> => {
    await assertPermission(context.supabase, context.userId, "approvals", "approve");
    const { data: row, error } = await (context.supabase as any).rpc("approve_settings_change", {
      _id: data.id,
      _note: data.note,
    });
    if (error) throw new Error(error.message);
    const result = (row ?? {}) as Record<string, any>;
    await recordDecision({
      actorId: context.userId,
      actorEmail: (context.claims as any)?.email ?? null,
      actorRole: "admin",
      module: "settings",
      outcome: "approved",
      target: data.id,
      note: data.note,
      meta: { kind: result["kind"] ?? null, status: result["status"] ?? null },
    });
    return {
      status: (result["status"] ?? "applied") as ChangeStatus,
      error: result["error"] ?? null,
    };
  });

/** Reject a pending request with a mandatory reason. */
export const rejectChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        reason: z.string().trim().min(5, "A rejection reason is required").max(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertPermission(context.supabase, context.userId, "approvals", "reject");
    const { error } = await (context.supabase as any).rpc("reject_settings_change", {
      _id: data.id,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    await recordDecision({
      actorId: context.userId,
      actorEmail: (context.claims as any)?.email ?? null,
      actorRole: "admin",
      module: "settings",
      outcome: "rejected",
      target: data.id,
      note: data.reason,
    });
    return { ok: true as const };
  });

/** (Re)apply an approved or previously failed request. */
export const applyChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        note: z.string().trim().min(5, "An apply note is required").max(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ status: ChangeStatus; error: string | null }> => {
    await assertPermission(context.supabase, context.userId, "approvals", "approve");
    const { data: row, error } = await (context.supabase as any).rpc("apply_settings_change", {
      _id: data.id,
      _note: data.note,
    });
    if (error) throw new Error(error.message);
    const result = (row ?? {}) as Record<string, any>;
    return {
      status: (result["status"] ?? "applied") as ChangeStatus,
      error: result["error"] ?? null,
    };
  });

export type BulkChangeMode = "approve" | "reject" | "apply";

export type BulkChangeItemResult = {
  id: string;
  ok: boolean;
  status: ChangeStatus | null;
  error: string | null;
};

const BulkSchema = z.object({
  mode: z.enum(["approve", "reject", "apply"]),
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        note: z
          .string()
          .trim()
          .min(5, "Every request needs its own comment of at least 5 characters")
          .max(500),
      }),
    )
    .min(1, "Select at least one request")
    .max(50, "Bulk actions are limited to 50 requests at a time")
    .refine(
      (items) => new Set(items.map((i) => i.id)).size === items.length,
      "The same request was included more than once",
    ),
});

/**
 * Bulk approve / reject / apply. Each request carries its own mandatory comment,
 * so the batch is rejected outright when any comment is missing or too short.
 * Requests are processed one by one and each outcome is reported individually —
 * a single failure never rolls back the rest of the batch.
 */
export const bulkDecideChangeRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => BulkSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ results: BulkChangeItemResult[] }> => {
    const action = data.mode === "reject" ? "reject" : "approve";
    await assertPermission(context.supabase, context.userId, "approvals", action);

    const rpc =
      data.mode === "approve"
        ? "approve_settings_change"
        : data.mode === "reject"
          ? "reject_settings_change"
          : "apply_settings_change";

    const results: BulkChangeItemResult[] = [];
    for (const item of data.items) {
      try {
        const args =
          data.mode === "reject"
            ? { _id: item.id, _reason: item.note }
            : { _id: item.id, _note: item.note };
        const { data: row, error } = await (context.supabase as any).rpc(rpc, args);
        if (error) throw new Error(error.message);
        const result = (row ?? {}) as Record<string, any>;
        const status = (result["status"] ??
          (data.mode === "reject" ? "rejected" : "applied")) as ChangeStatus;
        const failure = (result["error"] ?? null) as string | null;

        if (data.mode !== "apply") {
          await recordDecision({
            actorId: context.userId,
            actorEmail: (context.claims as any)?.email ?? null,
            actorRole: "admin",
            module: "settings",
            outcome: data.mode === "reject" ? "rejected" : "approved",
            target: item.id,
            note: item.note,
            meta: { bulk: true, batch_size: data.items.length, status },
          });
        }

        results.push({ id: item.id, ok: status !== "failed", status, error: failure });
      } catch (err: any) {
        results.push({ id: item.id, ok: false, status: null, error: err?.message ?? String(err) });
      }
    }
    return { results };
  });
