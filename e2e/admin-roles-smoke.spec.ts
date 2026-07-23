import { test, expect, type Page, type ConsoleMessage, type Request } from "@playwright/test";

/**
 * Smoke test for /admin/roles.
 *
 * Verifies the page renders without runtime SQL errors (e.g. the historical
 * `column profiles.email does not exist` regression). Signs in as a
 * super_admin so the route is actually reachable behind the RBAC gate.
 *
 * Env:
 *   E2E_SUPER_ADMIN_EMAIL / E2E_SUPER_ADMIN_PASSWORD
 */

const SUPER_ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL;
const SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD;

// Signals that indicate a runtime SQL failure surfaced in the UI or network.
const SQL_ERROR_PATTERNS: RegExp[] = [
  /column .* does not exist/i,
  /relation .* does not exist/i,
  /could not find a relationship/i,
  /schema cache/i,
  /PGRST\d+/i,
  /syntax error at or near/i,
  /permission denied for (table|schema|function)/i,
  /ambiguous (column|reference)/i,
];

function matchesSqlError(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const p of SQL_ERROR_PATTERNS) {
    if (p.test(text)) return p.source;
  }
  return null;
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).first().fill(password);
  await Promise.all([
    page.waitForLoadState("networkidle"),
    page.getByRole("button", { name: /sign in/i }).click(),
  ]);
}

test.describe("/admin/roles smoke", () => {
  test.skip(
    !SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD,
    "super_admin creds not provided (E2E_SUPER_ADMIN_EMAIL / _PASSWORD)",
  );

  test("renders without SQL / PostgREST errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    const networkErrors: string[] = [];

    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));
    page.on("requestfailed", (req: Request) => {
      networkErrors.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText ?? ""}`);
    });

    const sqlResponseErrors: string[] = [];
    page.on("response", async (res) => {
      if (res.status() < 400) return;
      const url = res.url();
      if (!/supabase\.co|\/_serverFn\/|\/api\//.test(url)) return;
      try {
        const body = await res.text();
        const hit = matchesSqlError(body);
        if (hit) sqlResponseErrors.push(`${res.status()} ${url} — /${hit}/`);
      } catch {
        // ignore body read failures
      }
    });

    await signIn(page, SUPER_ADMIN_EMAIL!, SUPER_ADMIN_PASSWORD!);

    await page.goto("/admin/roles");
    await expect(page).toHaveURL(/\/admin\/roles(\?|$)/);

    // Page chrome should render (heading or a known control on the roles page).
    await expect(
      page.getByRole("heading", { name: /roles|role governance|user roles/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Let async loaders settle so any failed server-fn call surfaces.
    await page.waitForLoadState("networkidle");

    // No SQL-shaped errors visible in the DOM.
    const bodyText = await page.locator("body").innerText();
    const domHit = matchesSqlError(bodyText);
    expect(domHit, `SQL error text visible in DOM: /${domHit}/`).toBeNull();

    // No SQL-shaped errors from console, network, or server responses.
    const consoleHits = consoleErrors.filter(matchesSqlError);
    expect(consoleHits, `console SQL errors:\n${consoleHits.join("\n")}`).toEqual([]);
    expect(sqlResponseErrors, `response SQL errors:\n${sqlResponseErrors.join("\n")}`).toEqual([]);
    expect(networkErrors, `network failures:\n${networkErrors.join("\n")}`).toEqual([]);
  });
});
