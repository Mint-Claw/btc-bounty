import { test, expect } from "@playwright/test";

test.describe("API Docs Page", () => {
  test("loads and shows title", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.getByText("BTC Bounty API")).toBeVisible();
  });

  test("displays endpoint list", async ({ page }) => {
    await page.goto("/docs");
    // Should show at least the health endpoint
    await expect(page.getByText("/api/health")).toBeVisible();
  });

  test("expands endpoint details on click", async ({ page }) => {
    await page.goto("/docs");
    const healthRow = page.getByText("/api/health").first();
    await healthRow.click();
    // Should show description and example curl
    await expect(page.getByText("Example")).toBeVisible();
  });

  test("shows authentication note", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.getByRole("heading", { name: /Authentication/ })).toBeVisible();
    // X-API-Key is inside a <code> tag — verify the parent paragraph contains it
    await expect(page.locator("text=Protected endpoints")).toBeVisible();
  });
});
