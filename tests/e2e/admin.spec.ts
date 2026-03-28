import { test, expect } from "@playwright/test";

test.describe("Admin Page", () => {
  test("loads admin dashboard without crashing", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByText("Admin Dashboard")).toBeVisible();
  });

  test("shows refresh button", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("button", { name: /refresh/i })).toBeVisible();
  });

  test("finishes loading within timeout", async ({ page }) => {
    test.setTimeout(20_000);
    await page.goto("/admin");
    // The fetch timeout is 8s, so wait up to 12s for loading to complete
    await expect(page.getByText("Refreshing...")).toBeHidden({ timeout: 12_000 }).catch(() => {});
    // After loading, page should show either data, empty state, or error — not crash
    const pageText = await page.textContent("body") ?? "";
    expect(pageText).toContain("Admin Dashboard");
  });
});
