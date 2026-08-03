import { createFileRoute } from "@tanstack/react-router";
import { templateFor } from "@/lib/payment-providers";

export const Route = createFileRoute("/api/public/hooks/payments/$provider")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const code = params.provider;
        const template = templateFor(code);
        if (!template) {
          return Response.json({ error: "unknown_provider" }, { status: 404 });
        }
        const rawBody = await request.text();
        if (rawBody.length > 512 * 1024) {
          return Response.json({ error: "payload_too_large" }, { status: 413 });
        }
        const signature =
          request.headers.get(template.signatureHeader) ?? request.headers.get("x-signature");

        const { processPaymentWebhook } = await import("@/lib/payment-webhooks.server");
        const outcome = await processPaymentWebhook({ providerCode: code, rawBody, signature });
        return Response.json(outcome.body, { status: outcome.status });
      },
    },
  },
});
