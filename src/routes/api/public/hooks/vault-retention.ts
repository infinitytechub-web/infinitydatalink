/**
 * Scheduled secure purge of expired KYC vault snapshots.
 *
 * Called by pg_cron. Removes recycle-bin snapshots and their archived storage
 * objects only after the configured retention window
 * (`public.kyc_vault_retention`) has elapsed, and only when automatic purging
 * is enabled. Every purge is audit-logged.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authorizeCronRequest } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/vault-retention")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = authorizeCronRequest(request);
        if (unauthorized) return unauthorized;

        const json = (v: unknown, status = 200) =>
          new Response(JSON.stringify(v), {
            status,
            headers: { "Content-Type": "application/json" },
          });

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { loadVaultRetentionPolicy, purgeExpiredVaultEntries } =
            await import("@/lib/kyc-vault-purge.server");

          const policy = await loadVaultRetentionPolicy(supabaseAdmin as any);
          if (!policy.auto_purge_enabled) {
            return json({ success: true, skipped: "auto_purge_disabled" });
          }

          const res = await purgeExpiredVaultEntries(
            supabaseAdmin as any,
            { label: "retention-scheduler" },
            { limit: 200 },
          );
          return json({ success: true, ...res });
        } catch (err: any) {
          console.error("vault-retention purge failed", err);
          return json({ success: false, error: err?.message ?? "unknown" }, 500);
        }
      },
    },
  },
});
