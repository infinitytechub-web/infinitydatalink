import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ADMIN_ROLES, assertAnyRole, loadRoleSet } from "@/lib/role-guards";
import {
  DECISION_ACTIONS,
  DECISION_MODULES,
  DECISION_OUTCOMES,
} from "@/lib/decision-audit";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export type DecisionRow = {
  id: string;
  created_at: string;
  action: string;
  module: string;
  outcome: string;
  target: string | null;
  note: string | null;
  reference: string | null;
  amount: number | null;
  subject_id: string | null;
  subject_name: string | null;
  subject_member_no: string | null;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  meta: { [k: string]: JsonValue };
};

export type DecisionListResult = {
  rows: DecisionRow[];
  total: number;
  page: number;
  pageSize: number;
  stats: { approved: number; rejected: number; other: number; total: number };
};

const FilterSchema = z.object({
  module: z.string().trim().max(40).optional().default("all"),
  outcome: z.string().trim().max(40).optional().default("all"),
  actor: z.string().trim().max(200).optional().default(""),
  subject: z.string().trim().max(200).optional().default(""),
  q: z.string().trim().max(200).optional().default(""),
  from: z.string().trim().max(40).optional().default(""),
  to: z.string().trim().max(40).optional().default(""),
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(10).max(200).optional().default(50),
});

/** Strip PostgREST filter metacharacters from user-supplied ilike patterns. */
function like(v: string) {
  return `%${v.replace(/[%,()*\\]/g, "")}%`;
}

function actionsFor(module: string, outcome: string) {
  return DECISION_ACTIONS.filter((a) => {
    const [m, o] = a.split(".");
    return (module === "all" || m === module) && (outcome === "all" || o === outcome);
  });
}

export const listDecisionAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FilterSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<DecisionListResult> => {
    const roles = await loadRoleSet(context.supabase, context.userId);
    assertAnyRole(roles, ADMIN_ROLES, "admin");

    const module = (DECISION_MODULES as readonly string[]).includes(data.module) ? data.module : "all";
    const outcome = (DECISION_OUTCOMES as readonly string[]).includes(data.outcome) ? data.outcome : "all";
    const actions = actionsFor(module, outcome);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const base = () => {
      let q = (supabaseAdmin as any)
        .from("audit_log")
        .select("id, created_at, action, target, actor_id, actor_email, actor_role, meta", {
          count: "exact",
        })
        .in("action", actions);
      if (data.actor) q = q.ilike("actor_email", like(data.actor));
      if (data.subject) q = q.ilike("target", like(data.subject));
      if (data.q) q = q.ilike("meta->>note", like(data.q));
      if (data.from) q = q.gte("created_at", new Date(data.from).toISOString());
      if (data.to) {
        const end = new Date(data.to);
        end.setHours(23, 59, 59, 999);
        q = q.lte("created_at", end.toISOString());
      }
      return q;
    };

    const from = (data.page - 1) * data.pageSize;
    const { data: rows, count, error } = await base()
      .order("created_at", { ascending: false })
      .range(from, from + data.pageSize - 1);
    if (error) throw new Error(error.message);

    // KPI counts over the same filter window (bounded scan).
    const { data: allRows } = await base().limit(5000);
    const stats = { approved: 0, rejected: 0, other: 0, total: (allRows ?? []).length };
    for (const r of allRows ?? []) {
      const o = String((r as any).action).split(".")[1];
      if (o === "approved") stats.approved += 1;
      else if (o === "rejected") stats.rejected += 1;
      else stats.other += 1;
    }

    const list = (rows ?? []) as any[];

    // Resolve subject profiles for readable member context.
    const subjectIds = Array.from(
      new Set(
        list
          .map((r) => (r.meta?.subject_id as string | null) ?? null)
          .filter((v): v is string => typeof v === "string" && v.length > 0),
      ),
    );
    const profiles = new Map<string, { full_name: string | null; member_no: string | null }>();
    if (subjectIds.length) {
      const { data: p } = await (supabaseAdmin as any)
        .from("profiles")
        .select("id, full_name, member_no")
        .in("id", subjectIds);
      for (const row of p ?? []) {
        profiles.set(row.id, { full_name: row.full_name, member_no: row.member_no });
      }
    }

    // Backfill actor emails for legacy rows written without one.
    const missingActors = Array.from(
      new Set(
        list
          .filter((r) => !r.actor_email && r.actor_id)
          .map((r) => r.actor_id as string),
      ),
    ).slice(0, 25);
    const actorEmails = new Map<string, string>();
    for (const id of missingActors) {
      try {
        const { data: u } = await (supabaseAdmin as any).auth.admin.getUserById(id);
        if (u?.user?.email) actorEmails.set(id, u.user.email);
      } catch {
        /* non-fatal: leave email blank */
      }
    }

    return {
      rows: list.map((r) => {
        const meta = (r.meta ?? {}) as { [k: string]: JsonValue };
        const [mod, out] = String(r.action).split(".");
        const subjectId = (meta.subject_id as string | null) ?? null;
        const prof = subjectId ? profiles.get(subjectId) : undefined;
        return {
          id: r.id,
          created_at: r.created_at,
          action: r.action,
          module: mod ?? "",
          outcome: out ?? "",
          target: r.target,
          note: (meta.note as string | null) ?? (meta.reason as string | null) ?? null,
          reference: (meta.reference as string | null) ?? (meta.ref as string | null) ?? null,
          amount: meta.amount == null ? null : Number(meta.amount),
          subject_id: subjectId,
          subject_name: prof?.full_name ?? null,
          subject_member_no: prof?.member_no ?? null,
          actor_id: r.actor_id,
          actor_email: r.actor_email ?? (r.actor_id ? actorEmails.get(r.actor_id) ?? null : null),
          actor_role: r.actor_role,
          meta,
        } satisfies DecisionRow;
      }),
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
      stats,
    };
  });
