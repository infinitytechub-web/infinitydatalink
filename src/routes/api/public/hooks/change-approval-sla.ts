import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled job: reminds reviewers (and escalation roles) when a pending change
 * approval has been waiting longer than the configured SLA thresholds.
 * Idempotent — each request/stage is reminded at most once per repeat window.
 */
export const Route = createFileRoute("/api/public/hooks/change-approval-sla")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeCronRequest } = await import("@/lib/cron-auth.server");
        const denied = authorizeCronRequest(request);
        if (denied) return denied;

        try {
          const { runChangeSlaReminders } = await import("@/lib/change-sla-reminders.server");
          const result = await runChangeSlaReminders();
          return new Response(JSON.stringify({ success: true, ...result }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          console.error("change-approval-sla failed", err?.message ?? err);
          return new Response(
            JSON.stringify({ success: false, error: err?.message ?? String(err) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
