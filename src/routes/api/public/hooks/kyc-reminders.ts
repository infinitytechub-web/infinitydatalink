import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled job: reminds members whose KYC resubmission deadline is close
 * (or has just passed) and warns those running low on resubmission attempts.
 * Reminder state is tracked per profile in the database, so repeated runs are
 * idempotent and a member never receives the same notice twice.
 */
export const Route = createFileRoute("/api/public/hooks/kyc-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeCronRequest } = await import("@/lib/cron-auth.server");
        const denied = authorizeCronRequest(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("run_kyc_resubmission_reminders" as never);
        if (error) {
          return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        const row: any = Array.isArray(data) ? data[0] : data;
        return new Response(
          JSON.stringify({
            success: true,
            deadline_soon: Number(row?.deadline_soon ?? 0),
            final_day: Number(row?.final_day ?? 0),
            low_attempts: Number(row?.low_attempts ?? 0),
            expired: Number(row?.expired ?? 0),
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
