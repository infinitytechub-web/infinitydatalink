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
        const { data, error } = await supabaseAdmin.rpc("post_savings_interest", {
          _period_end: undefined,
          _dry_run: false,
          _actor: undefined,
          _note: "scheduled run",
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
            accounts: Number(row?.accounts_processed ?? 0),
            credited: Number(row?.accounts_credited ?? 0),
            total_interest: Number(row?.total_interest ?? 0),
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
