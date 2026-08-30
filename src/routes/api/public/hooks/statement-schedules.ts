import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/statement-schedules")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeCronRequest } = await import("@/lib/cron-auth.server");
        const denied = authorizeCronRequest(request);
        if (denied) return denied;

        try {
          const { processDueStatementSchedules } = await import("@/lib/statement-schedules.server");
          const result = await processDueStatementSchedules();
          return new Response(JSON.stringify({ success: true, ...result }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          return new Response(
            JSON.stringify({ success: false, error: err?.message ?? String(err) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
