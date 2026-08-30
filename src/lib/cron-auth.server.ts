/**
 * Shared authentication for scheduled (/api/public/hooks/*) endpoints.
 *
 * These routes bypass site auth, so every caller MUST present a secret that
 * matches one of the trusted scheduler credentials with strict equality.
 * A merely present-but-wrong header is rejected.
 */

function pickTrustedSecrets(): string[] {
  // Only non-public secrets may authorize scheduler runs. The Supabase
  // publishable/anon key ships to every browser and is NOT a credential.
  return [process.env.CRON_SECRET, process.env.SUPABASE_SERVICE_ROLE_KEY].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
}

function extractPresented(request: Request): string[] {
  const values: string[] = [];
  const apikey = request.headers.get("apikey");
  if (apikey) values.push(apikey.trim());
  const authorization = request.headers.get("authorization");
  if (authorization) values.push(authorization.replace(/^Bearer\s+/i, "").trim());
  const cron = request.headers.get("x-cron-secret");
  if (cron) values.push(cron.trim());
  return values.filter(Boolean);
}

/**
 * Returns null when the caller is authorized, otherwise a 401/500 Response
 * that the handler should return immediately.
 */
export function authorizeCronRequest(request: Request): Response | null {
  const trusted = pickTrustedSecrets();
  if (trusted.length === 0) {
    // Fail closed: without a configured secret nothing may trigger these jobs.
    return new Response(
      JSON.stringify({ success: false, error: "scheduler auth not configured" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const presented = extractPresented(request);
  const ok = presented.some((value) => trusted.some((secret) => secret === value));
  if (!ok) {
    return new Response(JSON.stringify({ success: false, error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}
