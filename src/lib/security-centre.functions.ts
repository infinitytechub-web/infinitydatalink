/**
 * Security Centre reads and writes.
 *
 * Every function is gated on the database permission matrix (`security.view` /
 * `security.manage`) rather than a role string, so the granular matrix editor
 * is the single source of truth. Mutations write an audit entry through the
 * trusted `writeAudit` path.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit } from "@/lib/audit-log";
import {
  EVENT_CATEGORIES,
  assertSecurityPermission,
  canManageSecurity,
  ipFromMeta,
  maskIp,
  severityFor,
  summariseAgent,
  type EventCategory,
  type IpRule,
  type LiveSession,
  type RateLimit,
  type SecurityEvent,
  type SecuritySettings,
  type UploadScan,
} from "@/lib/security-centre.server";

export type {
  EventCategory,
  IpRule,
  LiveSession,
  RateLimit,
  SecurityEvent,
  SecuritySettings,
  UploadScan,
};

export const EVENT_CATEGORY_KEYS = Object.keys(EVENT_CATEGORIES) as EventCategory[];

type AnyQuery = {
  or: (f: string) => AnyQuery;
  eq: (c: string, v: unknown) => AnyQuery;
  gte: (c: string, v: unknown) => AnyQuery;
  lte: (c: string, v: unknown) => AnyQuery;
  ilike: (c: string, v: string) => AnyQuery;
  order: (c: string, o?: { ascending?: boolean }) => AnyQuery;
  range: (a: number, b: number) => Promise<{ data: unknown; error: { message: string } | null; count: number | null }>;
};

const asAny = (q: unknown) => q as AnyQuery;

/** Strip PostgREST filter metacharacters before interpolating a search term. */
function safeTerm(term: string): string {
  return term.replace(/[(),*"\\%]/g, " ").trim();
}

const PageSchema = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(5).max(200).default(25),
  from: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional(),
  q: z.string().trim().max(120).optional(),
});

/* ------------------------------------------------------------------ events */

export type SecurityEventPage = {
  rows: SecurityEvent[];
  total: number;
  can_manage: boolean;
  unmasked: boolean;
  kpis: { events24h: number; critical24h: number; blocked24h: number; liveSessions: number };
};

export const listSecurityEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    PageSchema.extend({
      category: z.enum(["all", "auth", "access", "security", "payments", "documents"]).default("all"),
      severity: z.enum(["all", "info", "warning", "critical"]).default("all"),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<SecurityEventPage> => {
    await assertSecurityPermission(context.supabase, "view");
    const unmasked = await canManageSecurity(context.supabase);

    // The category filter narrows on the server; severity is derived from the
    // action + metadata so it is applied after fetch on the current page set.
    let q = asAny(
      context.supabase.from("audit_log").select("id, created_at, action, actor_email, actor_role, target, meta", {
        count: "exact",
      }),
    );
    const prefixes = EVENT_CATEGORIES[data.category];
    if (prefixes.length > 0) {
      q = q.or(prefixes.map((p) => `action.ilike.%${p}%`).join(","));
    }
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const term = data.q ? safeTerm(data.q) : "";
    if (term) q = q.or(`action.ilike.%${term}%,actor_email.ilike.%${term}%,target.ilike.%${term}%`);

    const offset = (data.page - 1) * data.pageSize;
    const res = await q
      .order("created_at", { ascending: false })
      .range(offset, offset + data.pageSize - 1);
    if (res.error) throw new Error(res.error.message);

    type Raw = {
      id: string;
      created_at: string;
      action: string;
      actor_email: string | null;
      actor_role: string | null;
      target: string | null;
      meta: Record<string, unknown> | null;
    };
    let rows: SecurityEvent[] = ((res.data ?? []) as Raw[]).map((r) => {
      const meta = (r.meta ?? {}) as Record<string, unknown>;
      const rawIp = ipFromMeta(meta);
      return {
        id: r.id,
        created_at: r.created_at,
        action: r.action,
        actor: r.actor_email ?? "system",
        actor_role: r.actor_role,
        target: r.target,
        ip: rawIp ? (unmasked ? rawIp : maskIp(rawIp)) : null,
        severity: severityFor(r.action, meta),
        meta,
      };
    });
    if (data.severity !== "all") rows = rows.filter((r) => r.severity === data.severity);

    const since = new Date(Date.now() - 86_400_000).toISOString();
    const day = await context.supabase
      .from("audit_log")
      .select("action, meta")
      .gte("created_at", since)
      .limit(2000);
    const dayRows = (day.data ?? []) as { action: string; meta: Record<string, unknown> | null }[];
    const critical24h = dayRows.filter((r) => severityFor(r.action, r.meta ?? {}) === "critical").length;
    const blocked24h = dayRows.filter((r) => /blocked|denied|forbidden/i.test(r.action)).length;

    const liveSince = new Date(Date.now() - 5 * 60_000).toISOString();
    const live = await context.supabase
      .from("admin_sessions")
      .select("id", { count: "exact", head: true })
      .is("ended_at", null)
      .gte("last_seen_at", liveSince);

    return {
      rows,
      total: res.count ?? rows.length,
      can_manage: unmasked,
      unmasked,
      kpis: {
        events24h: dayRows.length,
        critical24h,
        blocked24h,
        liveSessions: live.count ?? 0,
      },
    };
  });

/* ---------------------------------------------------------------- firewall */

export type FirewallView = {
  settings: SecuritySettings;
  ip_rules: IpRule[];
  rate_limits: RateLimit[];
  can_manage: boolean;
};

export const getFirewallConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FirewallView> => {
    await assertSecurityPermission(context.supabase, "view");
    const [settings, rules, limits, manage] = await Promise.all([
      context.supabase.from("security_settings").select("*").eq("id", true).maybeSingle(),
      context.supabase.from("security_ip_rules").select("*").order("created_at", { ascending: false }),
      context.supabase.from("security_rate_limits").select("*").order("scope"),
      canManageSecurity(context.supabase),
    ]);
    if (settings.error) throw new Error(settings.error.message);
    const s = (settings.data ?? {}) as Partial<SecuritySettings>;
    return {
      settings: {
        firewall_enabled: s.firewall_enabled ?? false,
        ip_allowlist_only: s.ip_allowlist_only ?? false,
        rate_limiting_enabled: s.rate_limiting_enabled ?? true,
        upload_scanning_enabled: s.upload_scanning_enabled ?? true,
        max_upload_mb: s.max_upload_mb ?? 10,
        allowed_upload_mime: s.allowed_upload_mime ?? [],
        block_executables: s.block_executables ?? true,
        updated_at: s.updated_at ?? null,
      },
      ip_rules: ((rules.data ?? []) as IpRule[]).map((r) => ({ ...r, mode: r.mode === "allow" ? "allow" : "deny" })),
      rate_limits: (limits.data ?? []) as RateLimit[],
      can_manage: manage,
    };
  });

const SettingsSchema = z.object({
  firewall_enabled: z.boolean(),
  ip_allowlist_only: z.boolean(),
  rate_limiting_enabled: z.boolean(),
  upload_scanning_enabled: z.boolean(),
  max_upload_mb: z.number().int().min(1).max(200),
  allowed_upload_mime: z.array(z.string().trim().min(3).max(120)).max(40),
  block_executables: z.boolean(),
});

export const updateSecuritySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SettingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSecurityPermission(context.supabase, "manage");
    const { error } = await context.supabase
      .from("security_settings")
      .update({ ...data, updated_by: context.userId } as never)
      .eq("id", true);
    if (error) throw new Error(error.message);
    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as { email?: string } | null)?.email ?? null,
      action: "security.settings.updated",
      target: "security_settings",
      meta: data,
    });
    return { ok: true as const };
  });

// Accepts a bare IPv4/IPv6 address or CIDR block.
const CIDR = /^[0-9a-fA-F:.]+(\/\d{1,3})?$/;

export const upsertIpRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        cidr: z.string().trim().min(3).max(64).regex(CIDR, "Enter an IP address or CIDR block"),
        mode: z.enum(["allow", "deny"]),
        note: z.string().trim().max(200).optional(),
        enabled: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSecurityPermission(context.supabase, "manage");
    const row = {
      cidr: data.cidr,
      mode: data.mode,
      note: data.note?.trim() || null,
      enabled: data.enabled,
      created_by: context.userId,
    };
    const res = data.id
      ? await context.supabase.from("security_ip_rules").update(row as never).eq("id", data.id)
      : await context.supabase.from("security_ip_rules").insert(row as never);
    if (res.error) throw new Error(res.error.message);
    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as { email?: string } | null)?.email ?? null,
      action: data.id ? "security.ip_rule.updated" : "security.ip_rule.created",
      target: data.cidr,
      meta: { mode: data.mode, enabled: data.enabled },
    });
    return { ok: true as const };
  });

export const deleteIpRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSecurityPermission(context.supabase, "manage");
    const { error } = await context.supabase.from("security_ip_rules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as { email?: string } | null)?.email ?? null,
      action: "security.ip_rule.deleted",
      target: data.id,
    });
    return { ok: true as const };
  });

export const upsertRateLimit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        scope: z.string().trim().min(3).max(60).regex(/^[a-z0-9._-]+$/, "Use lowercase dotted scope keys"),
        window_seconds: z.number().int().min(1).max(86_400),
        max_requests: z.number().int().min(1).max(100_000),
        enabled: z.boolean().default(true),
        note: z.string().trim().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSecurityPermission(context.supabase, "manage");
    const row = {
      scope: data.scope,
      window_seconds: data.window_seconds,
      max_requests: data.max_requests,
      enabled: data.enabled,
      note: data.note?.trim() || null,
    };
    const res = data.id
      ? await context.supabase.from("security_rate_limits").update(row as never).eq("id", data.id)
      : await context.supabase.from("security_rate_limits").insert(row as never);
    if (res.error) throw new Error(res.error.message);
    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as { email?: string } | null)?.email ?? null,
      action: data.id ? "security.rate_limit.updated" : "security.rate_limit.created",
      target: data.scope,
      meta: { window_seconds: data.window_seconds, max_requests: data.max_requests, enabled: data.enabled },
    });
    return { ok: true as const };
  });

/* ------------------------------------------------------------ upload scans */

export type UploadScanPage = {
  rows: UploadScan[];
  total: number;
  scanning_enabled: boolean;
  policy: { max_upload_mb: number; allowed_upload_mime: string[]; block_executables: boolean };
  kpis: { scanned: number; blocked: number; quarantined: number };
};

export const listUploadScans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    PageSchema.extend({ verdict: z.enum(["all", "clean", "blocked", "quarantined"]).default("all") }).parse(d),
  )
  .handler(async ({ data, context }): Promise<UploadScanPage> => {
    await assertSecurityPermission(context.supabase, "view");

    let q = asAny(
      context.supabase
        .from("upload_scan_log")
        .select("id, created_at, filename, mime_type, size_bytes, verdict, reasons, user_id", {
          count: "exact",
        }),
    );
    if (data.verdict !== "all") q = q.eq("verdict", data.verdict);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const term = data.q ? safeTerm(data.q) : "";
    if (term) q = q.ilike("filename", `%${term}%`);

    const offset = (data.page - 1) * data.pageSize;
    const res = await q.order("created_at", { ascending: false }).range(offset, offset + data.pageSize - 1);
    if (res.error) throw new Error(res.error.message);

    type Raw = {
      id: string;
      created_at: string;
      filename: string;
      mime_type: string | null;
      size_bytes: number | null;
      verdict: string;
      reasons: string[] | null;
      user_id: string | null;
    };
    const raw = (res.data ?? []) as Raw[];
    const ids = [...new Set(raw.map((r) => r.user_id).filter((v): v is string => Boolean(v)))];
    const names = new Map<string, string>();
    if (ids.length > 0) {
      const profiles = await context.supabase.from("profiles").select("id, full_name").in("id", ids);
      for (const p of (profiles.data ?? []) as { id: string; full_name: string | null }[]) {
        names.set(p.id, p.full_name ?? "Member");
      }
    }

    const [settings, counts] = await Promise.all([
      context.supabase
        .from("security_settings")
        .select("upload_scanning_enabled, max_upload_mb, allowed_upload_mime, block_executables")
        .eq("id", true)
        .maybeSingle(),
      context.supabase.from("upload_scan_log").select("verdict").limit(5000),
    ]);
    const verdicts = (counts.data ?? []) as { verdict: string }[];
    const s = (settings.data ?? {}) as Partial<SecuritySettings>;

    return {
      rows: raw.map((r) => ({
        id: r.id,
        created_at: r.created_at,
        filename: r.filename,
        mime_type: r.mime_type,
        size_bytes: r.size_bytes,
        verdict: r.verdict,
        reasons: r.reasons ?? [],
        uploader: r.user_id ? (names.get(r.user_id) ?? "Member") : "System",
      })),
      total: res.count ?? raw.length,
      scanning_enabled: s.upload_scanning_enabled ?? true,
      policy: {
        max_upload_mb: s.max_upload_mb ?? 10,
        allowed_upload_mime: s.allowed_upload_mime ?? [],
        block_executables: s.block_executables ?? true,
      },
      kpis: {
        scanned: verdicts.length,
        blocked: verdicts.filter((v) => v.verdict === "blocked").length,
        quarantined: verdicts.filter((v) => v.verdict === "quarantined").length,
      },
    };
  });

/* ---------------------------------------------------------- live sessions */

export type LiveSessionView = {
  rows: LiveSession[];
  unmasked: boolean;
  active: number;
  idle: number;
};

/** Recent sessions with privacy-aware network detail. */
export const listLiveSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LiveSessionView> => {
    await assertSecurityPermission(context.supabase, "view");
    const unmasked = await canManageSecurity(context.supabase);

    const since = new Date(Date.now() - 12 * 3_600_000).toISOString();
    const res = await context.supabase
      .from("admin_sessions")
      .select("id, user_id, ip_address, user_agent, device, started_at, last_seen_at, ended_at")
      .gte("last_seen_at", since)
      .order("last_seen_at", { ascending: false })
      .limit(200);
    if (res.error) throw new Error(res.error.message);

    type Raw = {
      id: string;
      user_id: string;
      ip_address: string | null;
      user_agent: string | null;
      device: string | null;
      started_at: string;
      last_seen_at: string;
      ended_at: string | null;
    };
    const raw = (res.data ?? []) as Raw[];
    const ids = [...new Set(raw.map((r) => r.user_id))];
    const names = new Map<string, string>();
    if (ids.length > 0) {
      const profiles = await context.supabase.from("profiles").select("id, full_name").in("id", ids);
      for (const p of (profiles.data ?? []) as { id: string; full_name: string | null }[]) {
        names.set(p.id, p.full_name ?? "Member");
      }
    }

    const cutoff = Date.now() - 5 * 60_000;
    const rows: LiveSession[] = raw.map((r) => {
      const agent = summariseAgent(r.user_agent);
      return {
        id: r.id,
        user_id: r.user_id,
        name: names.get(r.user_id) ?? "Member",
        ip: unmasked ? (r.ip_address ?? "—") : maskIp(r.ip_address),
        device: r.device?.trim() || agent.device,
        browser: agent.browser,
        started_at: r.started_at,
        last_seen_at: r.last_seen_at,
        active: !r.ended_at && new Date(r.last_seen_at).getTime() >= cutoff,
      };
    });

    if (unmasked && rows.length > 0) {
      await writeAudit({
        actor_id: context.userId,
        actor_email: (context.claims as { email?: string } | null)?.email ?? null,
        action: "security.sessions.viewed_unmasked",
        target: "admin_sessions",
        meta: { sessions: rows.length },
      });
    }

    return {
      rows,
      unmasked,
      active: rows.filter((r) => r.active).length,
      idle: rows.filter((r) => !r.active).length,
    };
  });
