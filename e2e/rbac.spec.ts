import { test, expect, type Page } from "@playwright/test";

const MEMBER_EMAIL = process.env.E2E_MEMBER_EMAIL;
const MEMBER_PASSWORD = process.env.E2E_MEMBER_PASSWORD;
const SUPER_ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL;
const SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD;

const PROTECTED_ROUTES = [
  "/admin",
  "/admin/loans",
  "/admin/members",
  "/admin/audit",
  "/admin/reports",
  "/admin/super-admins",
  "/admin/super-admins/history",
];

const SUPER_ADMIN_ONLY = ["/admin/super-admins", "/admin/super-admins/history"];

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).first().fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle");
}

test.describe("RBAC — unauthenticated", () => {
  for (const route of PROTECTED_ROUTES) {
    test(`redirects ${route} to /auth`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/auth/);
    });
  }
});

test.describe("RBAC — member", () => {
  test.skip(!MEMBER_EMAIL || !MEMBER_PASSWORD, "member creds not provided");

  test("member is redirected out of /admin", async ({ page }) => {
    await signIn(page, MEMBER_EMAIL!, MEMBER_PASSWORD!);
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin(\/|$)/);
  });

  for (const route of SUPER_ADMIN_ONLY) {
    test(`member cannot reach ${route}`, async ({ page }) => {
      await signIn(page, MEMBER_EMAIL!, MEMBER_PASSWORD!);
      await page.goto(route);
      // Either bounced away, or landing page shows no Super Admin content.
      await expect(page.getByText(/Super Admin directory|grant.*history/i)).toHaveCount(0);
    });
  }
});

test.describe("RBAC — super_admin", () => {
  test.skip(!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD, "super_admin creds not provided");

  test("super_admin lands on the admin dashboard after sign-in", async ({ page }) => {
    await signIn(page, SUPER_ADMIN_EMAIL!, SUPER_ADMIN_PASSWORD!);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/admin(\/|$)/);
  });

  test("super_admin can view the directory and grant history", async ({ page }) => {
    await signIn(page, SUPER_ADMIN_EMAIL!, SUPER_ADMIN_PASSWORD!);
    await page.goto("/admin/super-admins");
    await expect(page.getByText(/Super Admin directory/i)).toBeVisible();
    await page.goto("/admin/super-admins/history");
    await expect(page.getByText(/grant.*history/i)).toBeVisible();
    await expect(page.getByText(/Events \(/)).toBeVisible();
  });
});
