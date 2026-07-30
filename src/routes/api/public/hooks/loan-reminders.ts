import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/loan-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeCronRequest } = await import("@/lib/cron-auth.server");
        const denied = authorizeCronRequest(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("run_loan_repayment_reminders", {
          _days_ahead: 3,
        } as never);
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
            due_soon: Number(row?.due_soon ?? 0),
            overdue: Number(row?.overdue ?? 0),
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
