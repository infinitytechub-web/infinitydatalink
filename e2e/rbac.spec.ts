import { test, expect, type Page } from "@playwright/test";

/**
 * Super Admin RBAC coverage.
 *
 * Environment (see e2e/README.md):
 *   E2E_BASE_URL              default http://localhost:8080
 *   E2E_MEMBER_EMAIL / _PASSWORD          member-only user
 *   E2E_SUPER_ADMIN_EMAIL / _PASSWORD     super_admin user
 */

const MEMBER_EMAIL = process.env.E2E_MEMBER_EMAIL;
const MEMBER_PASSWORD = process.env.E2E_MEMBER_PASSWORD;
const SUPER_ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL;
const SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD;

// All admin routes require staff. Redirects to /auth when signed-out.
const ADMIN_ROUTES = [
  "/admin",
  "/admin/loans",
  "/admin/members",
  "/admin/savings",
  "/admin/payments",
  "/admin/audit",
  "/admin/reports",
  "/admin/security",
  "/admin/settings",
  "/admin/super-admins",
  "/admin/super-admins/history",
];

// Routes that ONLY super_admin may reach. Members must be denied.
const SUPER_ADMIN_ONLY = ["/admin/super-admins", "/admin/super-admins/history"];

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(email);
  await page
    .getByLabel(/password/i)
    .first()
    .fill(password);
  await Promise.all([
    page.waitForLoadState("networkidle"),
    page.getByRole("button", { name: /sign in/i }).click(),
  ]);
}

async function signOut(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    // Best-effort local cleanup so subsequent tests start signed-out.
    localStorage.clear();
    sessionStorage.clear();
  });
}

test.describe("Unauthenticated visitors", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  for (const route of ADMIN_ROUTES) {
    test(`GET ${route} redirects to /auth`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/auth(\?|$)/);
      // Must not show any admin chrome or PII.
      await expect(page.getByText(/Super Admin directory/i)).toHaveCount(0);
      await expect(page.getByText(/grant.*history/i)).toHaveCount(0);
    });
  }
});

test.describe("Member (non-staff) role", () => {
  test.skip(!MEMBER_EMAIL || !MEMBER_PASSWORD, "member creds not provided");

  test.beforeEach(async ({ page }) => {
    await signIn(page, MEMBER_EMAIL!, MEMBER_PASSWORD!);
  });

  test("landing after sign-in is the member portal, not the admin dashboard", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/app(\/|$)/);
  });

  for (const route of SUPER_ADMIN_ONLY) {
    test(`member navigating to ${route} sees no super_admin content`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByText(/Super Admin directory/i)).toHaveCount(0);
      await expect(page.getByText(/grant & revoke history/i)).toHaveCount(0);
      // A denied user should not see any grant/revoke rows either.
      await expect(page.getByText(/Events \(/)).toHaveCount(0);
    });
  }

  test("member cannot invoke listSuperAdmins server function", async ({ request }) => {
    // Even if the network is reachable, unauthorized callers must be rejected.
    const res = await request.post("/_serverFn/admin-roles/listSuperAdmins", {
      data: {},
      failOnStatusCode: false,
    });
    expect([401, 403, 404]).toContain(res.status());
  });
});

test.describe("Super Admin role", () => {
  test.skip(!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD, "super_admin creds not provided");

  test.beforeEach(async ({ page }) => {
    await signIn(page, SUPER_ADMIN_EMAIL!, SUPER_ADMIN_PASSWORD!);
  });

  test("super_admin is routed to /admin on sign-in", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/admin(\/|$)/);
    await expect(page.getByText(/Approval queue|Activity feed|Dashboard/i)).toBeVisible();
  });

  test("super_admin can navigate the directory and history via the sidebar", async ({ page }) => {
    await page.goto("/admin");

    // Directory
    await page.goto("/admin/super-admins");
    await expect(page.getByText(/Super Admin directory/i)).toBeVisible();

    // Jump via in-page link to the history page
    await page.getByRole("link", { name: /grant history|view grant history/i }).click();
    await expect(page).toHaveURL(/\/admin\/super-admins\/history/);
    await expect(page.getByText(/Events \(/)).toBeVisible();
  });

  test("super_admin can sort and paginate the grant history", async ({ page }) => {
    await page.goto("/admin/super-admins/history");
    await expect(page.getByText(/Events \(/)).toBeVisible();

    // Toggle sort by When (occurred_at)
    await page.getByRole("button", { name: /^When/i }).click();
    await expect(page).toHaveURL(/sortBy=occurred_at.*sortDir=asc|sortDir=asc.*sortBy=occurred_at/);

    // Change page size
    await page.getByLabel(/rows per page/i).selectOption("100");
    await expect(page).toHaveURL(/pageSize=100/);
  });

  test("super_admin can trigger a CSV export", async ({ page }) => {
    await page.goto("/admin/super-admins/history");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /export csv/i }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^super-admin-history-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
