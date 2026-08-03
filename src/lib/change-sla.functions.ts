/**
 * Change-approval SLA reminder configuration and manual runs.
 *
 * Reading requires `approvals.view`; changing the thresholds or firing a run
 * on demand requires `approvals.manage`. Every write is audited.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit-log";
import { CHANGE_SLA_DEFAULTS, type ChangeSlaSettings } from "@/lib/change-sla";

export type { ChangeSlaSettings };

export const SLA_CHANNELS = [
  { key: "in_app", label: "In-app", hint: "Notification centre entry for each reviewer" },
  { key: "email", label: "Email", hint: "Queued to the notification outbox" },
  { key: "sms", label: "SMS", hint: "Only reaches officers with a phone number on file" },
] as const;

export const SLA_ROLES = [
  { key: "super_admin", label: "Super admin" },
  { key: "admin", label: "Admin" },
  { key: "manager", label: "Manager" },
  { key: "compliance_officer", label: "Compliance officer" },
  { key: "finance_officer", label: "Finance officer" },
  { key: "loan_officer", label: "Loan officer" },
  { key: "auditor", label: "Auditor" },
] as const;

const roleEnum = z.enum(SLA_ROLES.map((r) => r.key) as [string, ...string[]]);

const Schema = z
  .object({
    enabled: z.boolean(),
    warn_after_hours: z.number().int().min(1).max(2000),
    breach_after_hours: z.number().int().min(1).max(2000),
    repeat_hours: z.number().int().min(1).max(720),
    channels: z.array(z.enum(["in_app", "email", "sms"])).min(1, "Pick at least one channel"),
    notify_roles: z.array(roleEnum).min(1, "Pick at least one reviewer role"),
    escalate_roles: z.array(roleEnum).min(1, "Pick at least one escalation role"),
    notify_requester: z.boolean(),
  })
  .refine((v) => v.breach_after_hours >= v.warn_after_hours, {
    message: "The breach threshold must be at or after the warning threshold",
    path: ["breach_after_hours"],
  });

const SELECT =
  "enabled, warn_after_hours, breach_after_hours, repeat_hours, channels, notify_roles, escalate_roles, notify_requester, updated_at";

export const getChangeSlaSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ settings: ChangeSlaSettings; canManage: boolean }> => {
    await assertPermission(context.supabase, context.userId, "approvals", "view");
    const { data, error } = await context.supabase
      .from("change_sla_settings")
      .select(SELECT)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const manage = await context.supabase.rpc("has_permission_for", {
      _module: "approvals",
      _action: "manage",
    });
    return {
      settings: { ...CHANGE_SLA_DEFAULTS, ...((data ?? {}) as Partial<ChangeSlaSettings>) },
      canManage: manage.data === true,
    };

  });

export const updateChangeSlaSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Schema.parse(d))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "approvals", "manage");
    const { error } = await context.supabase
      .from("change_sla_settings")
      .update({ ...data, updated_by: context.userId } as never)
      .eq("id", true);
    if (error) throw new Error(error.message);
    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as { email?: string } | null)?.email ?? null,
      action: "settings.change.sla_settings_updated",
      target: "change_sla_settings",
      meta: data as unknown as Record<string, unknown>,
    });
    return { ok: true as const };
  });

/** Fires a reminder pass immediately so officers can verify the configuration. */
export const runChangeSlaRemindersNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPermission(context.supabase, context.userId, "approvals", "manage");
    const { runChangeSlaReminders } = await import("@/lib/change-sla-reminders.server");
    return runChangeSlaReminders({
      actorId: context.userId,
      actorEmail: (context.claims as { email?: string } | null)?.email ?? null,
    });
  });
