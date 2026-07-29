import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/savings-sweeps")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("apikey") ?? request.headers.get("authorization")?.replace(/^Bearer /, "");
        if (!auth) return new Response("unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("run_savings_sweeps");
        if (error) {
          return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        const rows = (data ?? []) as Array<{ outcome: string }>;
        const ok = rows.filter((r) => r.outcome === "success").length;
        const fail = rows.filter((r) => r.outcome === "failed").length;
        return new Response(JSON.stringify({ success: true, processed: rows.length, ok, fail }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
