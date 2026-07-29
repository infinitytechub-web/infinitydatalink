import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/notification-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth =
          request.headers.get("apikey") ?? request.headers.get("authorization")?.replace(/^Bearer /, "");
        if (!auth) return new Response("unauthorized", { status: 401 });

        try {
          const { dispatchNotificationOutbox } = await import("@/lib/notification-dispatch.server");
          const result = await dispatchNotificationOutbox(50);
          return new Response(JSON.stringify({ success: true, ...result }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ success: false, error: err?.message ?? String(err) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
