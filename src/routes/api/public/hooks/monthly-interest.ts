import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/monthly-interest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("apikey") ?? request.headers.get("authorization")?.replace(/^Bearer /, "");
        if (!auth || auth !== process.env.SUPABASE_ANON_KEY && auth !== process.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
          // Accept the anon key; other callers rejected.
          if (!auth) return new Response("unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("accrue_monthly_interest", { _period_end: null });
        if (error) {
          return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        const rows = (data ?? []) as Array<{ interest: number }>;
        const total = rows.reduce((s, r) => s + Number(r.interest ?? 0), 0);
        return new Response(
          JSON.stringify({ success: true, accounts: rows.length, total_interest: total }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
