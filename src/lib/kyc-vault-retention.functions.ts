/**
 * Vault retention policy administration.
 *
 * Reading/updating the policy and running a manual purge are restricted to
 * super admins (verified through the authenticated client, so RLS applies) and
 * every mutation is audit-logged.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit } from "@/lib/audit-log";
import { loadRoleSet } from "@/lib/role-guards";
import type { VaultRetentionPolicy, VaultPurgeResult } from "@/lib/kyc-vault-purge.server";

export type { VaultRetentionPolicy, VaultPurgeResult };

async function superAdminCtx(context: any) {
  // `public.has_role` was removed when the security-definer helpers moved to the
  // private schema, so verify the role directly through the authenticated client
  // (RLS lets a user read their own role rows).
  const roles = await loadRoleSet(context.supabase, context.userId as string);
  if (!roles.has("super_admin")) throw new Error("Forbidden: super_admin role required");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return {
    admin: supabaseAdmin as any,
    actor: {
      userId: context.userId as string,
      email: ((context.claims as any)?.email ?? null) as string | null,
      role: "super_admin",
    },
  };
}

export const getVaultRetention = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { admin } = await superAdminCtx(context);
    const { loadVaultRetentionPolicy, listVaultPurgeCandidates } = await import(
      "@/lib/kyc-vault-purge.server"
    );
    const policy = await loadVaultRetentionPolicy(admin);
    const candidates = await listVaultPurgeCandidates(admin, 500);

    const { count } = await admin
      .from("recycle_bin")
      .select("id", { count: "exact", head: true })
      .eq("entity_table", "kyc_review");

    const { data: nextRows } = await admin
      .from("recycle_bin")
      .select("purge_after")
      .eq("entity_table", "kyc_review")
      .gt("purge_after", new Date().toISOString())
      .order("purge_after", { ascending: true })
      .limit(1);

    return {
      policy,
      total_entries: count ?? 0,
      due_now: candidates.length,
      due_documents: candidates.reduce(
        (n, c) => n + (((c.payload ?? {}).documents ?? []) as unknown[]).length,
        0,
      ),
      next_purge_at: nextRows?.[0]?.purge_after ?? null,
    };
  });

export const updateVaultRetention = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        auto_purge_enabled: z.boolean(),
        retention_years: z.number().int().min(1).max(25),
        legal_hold_days: z.number().int().min(0).max(3650),
        reason: z.string().trim().min(5).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin, actor } = await superAdminCtx(context);
    const { loadVaultRetentionPolicy } = await import("@/lib/kyc-vault-purge.server");
    const before = await loadVaultRetentionPolicy(admin);

    const { error } = await context.supabase
      .from("kyc_vault_retention")
      .update({
        auto_purge_enabled: data.auto_purge_enabled,
        retention_years: data.retention_years,
        legal_hold_days: data.legal_hold_days,
        updated_by: context.userId,
      })
      .eq("id", 1);
    if (error) throw new Error(error.message);

    // Re-stamp the scheduled removal date on existing snapshots so the policy
    // applies retroactively rather than only to future archives.
    const { data: recalculated, error: rErr } = await context.supabase.rpc(
      "reapply_kyc_vault_retention",
    );
    if (rErr) throw new Error(rErr.message);

    await writeAudit({
      actor_id: actor.userId,
      actor_email: actor.email,
      actor_role: actor.role,
      action: "kyc.vault_retention_updated",
      target: "kyc_vault_retention",
      meta: {
        before: {
          auto_purge_enabled: before.auto_purge_enabled,
          retention_years: before.retention_years,
          legal_hold_days: before.legal_hold_days,
        },
        after: {
          auto_purge_enabled: data.auto_purge_enabled,
          retention_years: data.retention_years,
          legal_hold_days: data.legal_hold_days,
        },
        entries_rescheduled: (recalculated as number) ?? 0,
        reason: data.reason,
      },
    });

    return { ok: true as const, entries_rescheduled: (recalculated as number) ?? 0 };
  });

/** Dry-run: which snapshots would a purge remove right now? */
export const previewVaultPurge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { admin, actor } = await superAdminCtx(context);
    const { purgeExpiredVaultEntries } = await import("@/lib/kyc-vault-purge.server");
    return purgeExpiredVaultEntries(admin, { ...actor, label: "manual-preview" }, { dryRun: true });
  });

export const runVaultPurge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        confirm: z.literal("PURGE"),
        reason: z.string().trim().min(5).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin, actor } = await superAdminCtx(context);
    const { purgeExpiredVaultEntries } = await import("@/lib/kyc-vault-purge.server");
    const res = await purgeExpiredVaultEntries(admin, {
      ...actor,
      label: `manual:${data.reason}`,
    });
    return res;
  });
