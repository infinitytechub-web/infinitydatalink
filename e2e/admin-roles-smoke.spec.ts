import { test, expect, type Page, type ConsoleMessage, type Request, type Response } from "@playwright/test";

/**
 * Smoke test for /admin/roles (and sibling admin pages that historically
 * regressed on `profiles.email`).
 *
 * Fails hard when the browser console, network responses, or DOM surface
 * PostgREST / "column does not exist" / schema-cache style SQL errors.
 */

const SUPER_ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL;
const SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD;

const SQL_ERROR_PATTERNS: RegExp[] = [
  /column\s+[^\s]+\s+does not exist/i,
  /relation\s+[^\s]+\s+does not exist/i,
  /could not find a relationship/i,
  /schema cache/i,
  /\bPGRST\d{3}\b/i,
  /"code"\s*:\s*"PGRST\d{3}"/i,
  /"code"\s*:\s*"42\d{3}"/i,           // pg SQL error class 42 (syntax/undefined)
  /PostgrestError/,
  /postgrest[^"]*error/i,
  /syntax error at or near/i,
  /permission denied for (table|schema|function|relation)/i,
  /ambiguous (column|reference)/i,
  /violates row-level security/i,
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

const ADMIN_ROUTES: Array<{ path: string; heading: RegExp }> = [
  { path: "/admin/roles", heading: /roles|role governance|user roles/i },
  { path: "/admin/console", heading: /console|settings/i },
  { path: "/admin/super-admins", heading: /super\s*admin/i },
];

test.describe("admin pages SQL-error smoke", () => {
  test.skip(
    !SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD,
    "super_admin creds not provided (E2E_SUPER_ADMIN_EMAIL / _PASSWORD)",
  );

  for (const { path, heading } of ADMIN_ROUTES) {
    test(`${path} renders without SQL / PostgREST errors`, async ({ page }) => {
      const consoleErrors: string[] = [];
      const networkErrors: string[] = [];
      const sqlResponseErrors: string[] = [];

      page.on("console", (msg: ConsoleMessage) => {
        const type = msg.type();
        if (type === "error" || type === "warning") consoleErrors.push(`[${type}] ${msg.text()}`);
      });
      page.on("pageerror", (err) => consoleErrors.push(`[pageerror] ${err.message}`));
      page.on("requestfailed", (req: Request) => {
        networkErrors.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText ?? ""}`);
      });
      page.on("response", async (res: Response) => {
        const url = res.url();
        // Inspect app + backend traffic; skip static assets.
        if (!/supabase\.co|\/_serverFn\/|\/api\/|localhost:8080/.test(url)) return;
        if (/\.(css|js|mjs|map|png|jpg|jpeg|svg|webp|ico|woff2?)(\?|$)/.test(url)) return;
        let body = "";
        try {
          body = await res.text();
        } catch {
          return;
        }
        const hit = matchesSqlError(body);
        if (hit) sqlResponseErrors.push(`${res.status()} ${url} — /${hit}/`);
        // Any 4xx/5xx from supabase or a server function is suspect on its own.
        if (res.status() >= 400 && /supabase\.co|\/_serverFn\//.test(url)) {
          sqlResponseErrors.push(`${res.status()} ${url} — body: ${body.slice(0, 400)}`);
        }
      });

      if (!page.url().includes("/app") && !page.url().includes("/admin")) {
        await signIn(page, SUPER_ADMIN_EMAIL!, SUPER_ADMIN_PASSWORD!);
      }

      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, "\\/")}(\\?|$)`));
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible({
        timeout: 15_000,
      });
      await page.waitForLoadState("networkidle");

      const bodyText = await page.locator("body").innerText();
      const domHit = matchesSqlError(bodyText);
      expect(domHit, `SQL error text visible in DOM at ${path}: /${domHit}/`).toBeNull();

      // "This page didn't load" is our root error boundary — never acceptable here.
      expect(
        bodyText,
        `Root error boundary rendered at ${path}`,
      ).not.toMatch(/this page didn't load/i);

      const consoleHits = consoleErrors.filter(matchesSqlError);
      expect(consoleHits, `console SQL errors at ${path}:\n${consoleHits.join("\n")}`).toEqual([]);
      expect(
        sqlResponseErrors,
        `response SQL errors at ${path}:\n${sqlResponseErrors.join("\n")}`,
      ).toEqual([]);
      expect(networkErrors, `network failures at ${path}:\n${networkErrors.join("\n")}`).toEqual([]);
    });
  }
});
