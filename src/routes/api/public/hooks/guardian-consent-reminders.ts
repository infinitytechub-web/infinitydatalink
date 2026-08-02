import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled job: reminds compliance staff and guardians when a minor account's
 * guardian consent / safeguarding attestations are still pending or incomplete.
 * Idempotent per member per UTC day.
 */
export const Route = createFileRoute("/api/public/hooks/guardian-consent-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeCronRequest } = await import("@/lib/cron-auth.server");
        const denied = authorizeCronRequest(request);
        if (denied) return denied;

        try {
          const { runGuardianConsentReminders } = await import(
            "@/lib/guardian-consent-reminders.server"
          );
          const result = await runGuardianConsentReminders();
          return new Response(JSON.stringify({ success: true, ...result }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          console.error("guardian-consent-reminders failed", err?.message ?? err);
          return new Response(
            JSON.stringify({ success: false, error: err?.message ?? String(err) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
