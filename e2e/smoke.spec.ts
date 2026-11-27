import { expect, test } from "@playwright/test";

test("registers an account, signs in, and creates a user end-to-end", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: /sign in to your account/i })).toBeVisible();

  await page.getByRole("button", { name: /create account/i }).click();
  const authEmail = `admin-${Date.now()}@example.com`;
  await page.getByLabel("Full name").fill("Admin User");
  await page.getByLabel("Work email").fill(authEmail);
  await page.getByLabel("Password", { exact: true }).fill("Password123!");
  await page.getByRole("button", { name: /^create account$/i }).click();

  await expect(page.getByRole("link", { name: /astraea hris/i })).toBeVisible();
  await page.getByRole("button", { name: /new user/i }).click();
  await expect(page.getByRole("heading", { name: "Create User" })).toBeVisible();

  const uniqueEmail = `smoke-${Date.now()}@example.com`;
  await page.getByLabel("Name", { exact: true }).fill("Smoke Test User");
  await page.getByLabel("Email", { exact: true }).fill(uniqueEmail);
  await page.getByRole("button", { name: "Add User" }).click();

  await expect(page.getByText(uniqueEmail)).toBeVisible();
});
