import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit-log";
import {
  REOPEN_WINDOW_DAYS,
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
  type SupportCategory,
  type SupportPriority,
  type SupportStatus,
} from "@/lib/support.shared";

/**
 * Support centre ticketing.
 *
 * Members raise and reply to their own tickets; support staff work the whole
 * queue and may attach internal notes members never see (RLS filters
 * `is_internal` rows out of the member policy, and the member read path also
 * filters them explicitly).
 */

export type SupportMessage = {
  id: string;
  author_id: string | null;
  author_label: string;
  author_role: string | null;
  is_staff: boolean;
  is_internal: boolean;
  body: string;
  created_at: string;
};

export type SupportTicket = {
  id: string;
  ref: string;
  user_id: string;
  member_label: string;
  member_no: string | null;
  subject: string;
  category: SupportCategory;
  priority: SupportPriority;
  status: SupportStatus;
  assignee_id: string | null;
  assignee_label: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  resolution_note: string | null;
  last_staff_activity_at: string | null;
  last_member_activity_at: string;
  created_at: string;
  updated_at: string;
};

export type SupportTicketDetail = SupportTicket & {
  messages: SupportMessage[];
  member_context?: {
    email: string | null;
    phone: string | null;
    kyc_status: string | null;
    status: string | null;
  };
};

const COLS =
  "id, ref, user_id, subject, category, priority, status, assignee_id, first_response_at, resolved_at, closed_at, resolution_note, last_staff_activity_at, last_member_activity_at, created_at, updated_at";

const STAFF_ROLES = ["super_admin", "admin", "manager", "support_officer"] as const;

async function labelMap(
  sb: any,
  ids: string[],
): Promise<Map<string, { label: string; member_no: string | null }>> {
  const map = new Map<string, { label: string; member_no: string | null }>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return map;
  const { data } = await sb.from("profiles").select("id, full_name, member_no").in("id", unique);
  for (const p of (data ?? []) as any[]) {
    map.set(p.id, {
      label: p.full_name || p.member_no || "Member",
      member_no: p.member_no ?? null,
    });
  }
  return map;
}

function mapTicket(
  r: any,
  people: Map<string, { label: string; member_no: string | null }>,
): SupportTicket {
  const member = people.get(r.user_id);
  const assignee = r.assignee_id ? people.get(r.assignee_id) : null;
  return {
    id: r.id,
    ref: r.ref,
    user_id: r.user_id,
    member_label: member?.label ?? "Member",
    member_no: member?.member_no ?? null,
    subject: r.subject,
    category: r.category,
    priority: r.priority,
    status: r.status,
    assignee_id: r.assignee_id ?? null,
    assignee_label: assignee?.label ?? null,
    first_response_at: r.first_response_at ?? null,
    resolved_at: r.resolved_at ?? null,
    closed_at: r.closed_at ?? null,
    resolution_note: r.resolution_note ?? null,
    last_staff_activity_at: r.last_staff_activity_at ?? null,
    last_member_activity_at: r.last_member_activity_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

async function staffRoleOf(sb: any, userId: string): Promise<string | null> {
  const { data } = await sb.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as Array<{ role: string }>).map((r) => r.role);
  return STAFF_ROLES.find((r) => roles.includes(r)) ?? null;
}

/* ------------------------------------------------------------------ member */

export const listMyTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SupportTicket[]> => {
    const { data, error } = await context.supabase
      .from("support_tickets")
      .select(COLS)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const people = await labelMap(context.supabase, [context.userId]);
    return (data ?? []).map((r: any) => mapTicket(r, people));
  });

export const createTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        subject: z.string().trim().min(5).max(150),
        category: z.enum(SUPPORT_CATEGORIES),
        priority: z.enum(SUPPORT_PRIORITIES).default("normal"),
        body: z.string().trim().min(15).max(4000),
        attachment_path: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ id: string; ref: string }> => {
    const { data: ticket, error } = await context.supabase
      .from("support_tickets")
      .insert({
        user_id: context.userId,
        subject: data.subject,
        category: data.category,
        priority: data.priority,
        attachment_path: data.attachment_path ?? null,
      } as never)
      .select("id, ref")
      .single();
    if (error) throw new Error(error.message);

    const created = ticket as unknown as { id: string; ref: string };
    const { error: msgErr } = await context.supabase.from("support_messages").insert({
      ticket_id: created.id,
      author_id: context.userId,
      author_role: "member",
      body: data.body,
      attachment_path: data.attachment_path ?? null,
    } as never);
    if (msgErr) throw new Error(msgErr.message);

    await writeAudit({
      actor_id: context.userId,
      action: "support.ticket.created",
      target: created.id,
      meta: { ref: created.ref, category: data.category, priority: data.priority },
    });
    return created;
  });

export const getMyTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<SupportTicketDetail> => {
    const { data: row, error } = await context.supabase
      .from("support_tickets")
      .select(COLS)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Ticket not found");

    const { data: msgs } = await context.supabase
      .from("support_messages")
      .select("id, author_id, author_role, is_staff, is_internal, body, created_at")
      .eq("ticket_id", data.id)
      .eq("is_internal", false)
      .order("created_at", { ascending: true });

    const people = await labelMap(context.supabase, [context.userId]);
    return {
      ...mapTicket(row as any, people),
      messages: ((msgs ?? []) as any[]).map((m) => ({
        id: m.id,
        author_id: m.author_id ?? null,
        author_label: m.is_staff ? "Support team" : (people.get(m.author_id)?.label ?? "You"),
        author_role: m.author_role ?? null,
        is_staff: m.is_staff,
        is_internal: false,
        body: m.body,
        created_at: m.created_at,
      })),
    };
  });

export const replyToTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), body: z.string().trim().min(2).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { data: ticket, error } = await context.supabase
      .from("support_tickets")
      .select("id, ref, status, assignee_id")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ticket) throw new Error("Ticket not found");
    const t = ticket as unknown as {
      id: string;
      ref: string;
      status: SupportStatus;
      assignee_id: string | null;
    };
    if (t.status === "closed") throw new Error("This ticket is closed — reopen it to add a reply.");

    const { error: msgErr } = await context.supabase.from("support_messages").insert({
      ticket_id: t.id,
      author_id: context.userId,
      author_role: "member",
      body: data.body,
    } as never);
    if (msgErr) throw new Error(msgErr.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("support_tickets")
      .update({
        last_member_activity_at: new Date().toISOString(),
        status: t.status === "awaiting_member" ? "in_progress" : t.status,
      } as never)
      .eq("id", t.id);

    if (t.assignee_id) {
      const { notifyUser } = await import("@/lib/notify.server");
      await notifyUser({
        userId: t.assignee_id,
        category: "support.member_reply",
        title: `New member reply on ${t.ref}`,
        body: data.body.slice(0, 160),
        link: `/admin/support?ticket=${t.id}`,
        channels: ["in_app"],
      });
    }
    return { ok: true };
  });

export const setMyTicketState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), action: z.enum(["close", "reopen"]) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { data: ticket, error } = await context.supabase
      .from("support_tickets")
      .select("id, ref, status, closed_at")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ticket) throw new Error("Ticket not found");
    const t = ticket as unknown as {
      id: string;
      ref: string;
      status: SupportStatus;
      closed_at: string | null;
    };

    const now = new Date().toISOString();
    const patch: Record<string, unknown> =
      data.action === "close"
        ? { status: "closed", closed_at: now }
        : { status: "open", closed_at: null, reopened_at: now };

    if (data.action === "reopen") {
      if (t.status !== "closed" && t.status !== "resolved")
        throw new Error("Ticket is already open.");
      const ref = t.closed_at ?? t.status;
      if (t.closed_at) {
        const days = (Date.now() - new Date(t.closed_at).getTime()) / 86_400_000;
        if (days > REOPEN_WINDOW_DAYS) {
          throw new Error(
            `Tickets can only be reopened within ${REOPEN_WINDOW_DAYS} days — please raise a new ticket.`,
          );
        }
      }
      void ref;
    } else if (t.status === "closed") {
      throw new Error("Ticket is already closed.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin
      .from("support_tickets")
      .update({ ...patch, last_member_activity_at: now } as never)
      .eq("id", t.id);
    if (upErr) throw new Error(upErr.message);

    await writeAudit({
      actor_id: context.userId,
      action: `support.ticket.${data.action === "close" ? "closed_by_member" : "reopened_by_member"}`,
      target: t.id,
      meta: { ref: t.ref },
    });
    return { ok: true };
  });

/* ------------------------------------------------------------------- staff */

const AdminFilter = z.object({
  status: z.enum([...SUPPORT_STATUSES, "all", "active"]).default("active"),
  category: z.enum([...SUPPORT_CATEGORIES, "all"]).default("all"),
  priority: z.enum([...SUPPORT_PRIORITIES, "all"]).default("all"),
  assignee: z.enum(["all", "me", "unassigned"]).default("all"),
  search: z.string().trim().max(120).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  sort_by: z.enum(["created_at", "updated_at", "priority", "status"]).default("created_at"),
  sort_dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(5).max(100).default(20),
});

export type AdminTicketList = {
  rows: SupportTicket[];
  total: number;
  page: number;
  page_size: number;
  counts: {
    open: number;
    in_progress: number;
    awaiting_member: number;
    resolved: number;
    closed: number;
  };
  mine: number;
};

export const adminListTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AdminFilter.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<AdminTicketList> => {
    await assertPermission(context.supabase, context.userId, "support", "view");

    let q = context.supabase.from("support_tickets").select(COLS, { count: "exact" });
    if (data.status === "active") q = q.in("status", ["open", "in_progress", "awaiting_member"]);
    else if (data.status !== "all") q = q.eq("status", data.status);
    if (data.category !== "all") q = q.eq("category", data.category);
    if (data.priority !== "all") q = q.eq("priority", data.priority);
    if (data.assignee === "me") q = q.eq("assignee_id", context.userId);
    if (data.assignee === "unassigned") q = q.is("assignee_id", null);
    if (data.date_from) q = q.gte("created_at", `${data.date_from}T00:00:00Z`);
    if (data.date_to) q = q.lte("created_at", `${data.date_to}T23:59:59Z`);
    if (data.search) {
      const safe = data.search.replace(/[%,()]/g, " ").trim();
      if (safe) q = q.or(`subject.ilike.%${safe}%,ref.ilike.%${safe}%`);
    }

    const from = (data.page - 1) * data.page_size;
    const {
      data: rows,
      count,
      error,
    } = await q
      .order(data.sort_by, { ascending: data.sort_dir === "asc" })
      .range(from, from + data.page_size - 1);
    if (error) throw new Error(error.message);

    const people = await labelMap(context.supabase, [
      ...(rows ?? []).map((r: any) => r.user_id as string),
      ...(rows ?? []).map((r: any) => r.assignee_id as string).filter(Boolean),
    ]);

    const { data: allStatus } = await context.supabase
      .from("support_tickets")
      .select("status, assignee_id")
      .limit(5000);
    const counts = { open: 0, in_progress: 0, awaiting_member: 0, resolved: 0, closed: 0 };
    let mine = 0;
    for (const r of (allStatus ?? []) as any[]) {
      if (r.status in counts) counts[r.status as keyof typeof counts] += 1;
      if (r.assignee_id === context.userId && r.status !== "closed" && r.status !== "resolved")
        mine += 1;
    }

    return {
      rows: (rows ?? []).map((r: any) => mapTicket(r, people)),
      total: count ?? 0,
      page: data.page,
      page_size: data.page_size,
      counts,
      mine,
    };
  });

export const adminGetTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<SupportTicketDetail> => {
    await assertPermission(context.supabase, context.userId, "support", "view");
    const { data: row, error } = await context.supabase
      .from("support_tickets")
      .select(COLS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Ticket not found");
    const t = row as any;

    const { data: msgs } = await context.supabase
      .from("support_messages")
      .select("id, author_id, author_role, is_staff, is_internal, body, created_at")
      .eq("ticket_id", data.id)
      .order("created_at", { ascending: true });

    const people = await labelMap(context.supabase, [
      t.user_id,
      t.assignee_id,
      ...((msgs ?? []) as any[]).map((m) => m.author_id).filter(Boolean),
    ]);

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("email, phone, kyc_status, status")
      .eq("id", t.user_id)
      .maybeSingle();

    return {
      ...mapTicket(t, people),
      member_context: {
        email: (profile as any)?.email ?? null,
        phone: (profile as any)?.phone ?? null,
        kyc_status: (profile as any)?.kyc_status ?? null,
        status: (profile as any)?.status ?? null,
      },
      messages: ((msgs ?? []) as any[]).map((m) => ({
        id: m.id,
        author_id: m.author_id ?? null,
        author_label: people.get(m.author_id)?.label ?? (m.is_staff ? "Support team" : "Member"),
        author_role: m.author_role ?? null,
        is_staff: m.is_staff,
        is_internal: m.is_internal,
        body: m.body,
        created_at: m.created_at,
      })),
    };
  });

export const adminReplyTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        body: z.string().trim().min(2).max(4000),
        internal: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertPermission(context.supabase, context.userId, "support", "edit");
    const role = await staffRoleOf(context.supabase, context.userId);

    const { data: ticket, error } = await context.supabase
      .from("support_tickets")
      .select("id, ref, user_id, status, first_response_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ticket) throw new Error("Ticket not found");
    const t = ticket as unknown as {
      id: string;
      ref: string;
      user_id: string;
      status: SupportStatus;
      first_response_at: string | null;
    };

    const { error: msgErr } = await context.supabase.from("support_messages").insert({
      ticket_id: t.id,
      author_id: context.userId,
      author_role: role ?? "support_officer",
      is_staff: true,
      is_internal: data.internal,
      body: data.body,
    } as never);
    if (msgErr) throw new Error(msgErr.message);

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { last_staff_activity_at: now };
    if (!data.internal) {
      if (!t.first_response_at) patch.first_response_at = now;
      if (t.status === "open") patch.status = "in_progress";
    }
    const { error: upErr } = await context.supabase
      .from("support_tickets")
      .update(patch as never)
      .eq("id", t.id);
    if (upErr) throw new Error(upErr.message);

    if (!data.internal) {
      const { notifyUser } = await import("@/lib/notify.server");
      await notifyUser({
        userId: t.user_id,
        category: "support.reply",
        title: `Support replied to ${t.ref}`,
        body: data.body.slice(0, 200),
        link: `/app/support?ticket=${t.id}`,
      });
    }

    await writeAudit({
      actor_id: context.userId,
      actor_role: role,
      action: data.internal ? "support.ticket.internal_note" : "support.ticket.replied",
      target: t.id,
      meta: { ref: t.ref },
    });
    return { ok: true };
  });

export const adminUpdateTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(SUPPORT_STATUSES).optional(),
        priority: z.enum(SUPPORT_PRIORITIES).optional(),
        assign_to: z.union([z.string().uuid(), z.literal("me"), z.literal("none")]).optional(),
        note: z.string().trim().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertPermission(context.supabase, context.userId, "support", "manage");
    const role = await staffRoleOf(context.supabase, context.userId);

    const { data: ticket, error } = await context.supabase
      .from("support_tickets")
      .select("id, ref, user_id, status, priority, assignee_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ticket) throw new Error("Ticket not found");
    const t = ticket as unknown as {
      id: string;
      ref: string;
      user_id: string;
      status: SupportStatus;
      priority: SupportPriority;
      assignee_id: string | null;
    };

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { last_staff_activity_at: now };

    if (data.status && data.status !== t.status) {
      if (
        (data.status === "resolved" || data.status === "closed") &&
        (data.note ?? "").length < 10
      ) {
        throw new Error("A resolution note of at least 10 characters is required.");
      }
      patch.status = data.status;
      if (data.status === "resolved") {
        patch.resolved_at = now;
        patch.resolution_note = data.note ?? null;
      }
      if (data.status === "closed") {
        patch.closed_at = now;
        patch.resolution_note = data.note ?? null;
      }
      if (data.status === "open" || data.status === "in_progress") {
        patch.resolved_at = null;
        patch.closed_at = null;
      }
    }
    if (data.priority && data.priority !== t.priority) patch.priority = data.priority;
    if (data.assign_to !== undefined) {
      patch.assignee_id =
        data.assign_to === "me"
          ? context.userId
          : data.assign_to === "none"
            ? null
            : data.assign_to;
    }

    const { error: upErr } = await context.supabase
      .from("support_tickets")
      .update(patch as never)
      .eq("id", t.id);
    if (upErr) throw new Error(upErr.message);

    await writeAudit({
      actor_id: context.userId,
      actor_role: role,
      action: "support.ticket.updated",
      target: t.id,
      meta: {
        ref: t.ref,
        from: { status: t.status, priority: t.priority, assignee_id: t.assignee_id },
        to: patch,
        note: data.note ?? null,
      },
    });

    if (patch.status) {
      const { notifyUser } = await import("@/lib/notify.server");
      await notifyUser({
        userId: t.user_id,
        category: "support.status",
        title: `${t.ref} is now ${String(patch.status).replace("_", " ")}`,
        body: data.note ?? null,
        link: `/app/support?ticket=${t.id}`,
      });
    }
    return { ok: true };
  });

export const adminListAssignees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Array<{ id: string; label: string; role: string }>> => {
    await assertPermission(context.supabase, context.userId, "support", "view");
    const { data } = await context.supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["super_admin", "admin", "manager", "support_officer"]);
    const rows = (data ?? []) as Array<{ user_id: string; role: string }>;
    const people = await labelMap(
      context.supabase,
      rows.map((r) => r.user_id),
    );
    const seen = new Set<string>();
    const out: Array<{ id: string; label: string; role: string }> = [];
    for (const r of rows) {
      if (seen.has(r.user_id)) continue;
      seen.add(r.user_id);
      out.push({ id: r.user_id, label: people.get(r.user_id)?.label ?? r.user_id, role: r.role });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  });
