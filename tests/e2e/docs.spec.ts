import { test, expect } from "@playwright/test";

test.describe("API Docs Page", () => {
  test("loads and shows title", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.getByText("BTC Bounty API")).toBeVisible();
  });

  test("displays endpoint list", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.getByText("/api/health")).toBeVisible();
  });

  test("expands endpoint details on click", async ({ page }) => {
    await page.goto("/docs");
    // Click on the health endpoint row
    const healthRow = page.locator("button", { hasText: "/api/health" });
    await healthRow.click();
    // Should show the example curl command
    await expect(page.getByText("curl")).toBeVisible({ timeout: 5_000 });
  });

  test("shows authentication note", async ({ page }) => {
    await page.goto("/docs");
    // Auth section has emoji prefix: "🔐 Authentication"
    await expect(page.getByText(/Authentication/)).toBeVisible();
    await expect(page.getByText("X-API-Key")).toBeVisible();
  });
});
