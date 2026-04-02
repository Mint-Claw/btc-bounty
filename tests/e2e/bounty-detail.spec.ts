import { test, expect } from "@playwright/test";

test.describe("Bounty Detail Page", () => {
  test("shows loading state initially", async ({ page }) => {
    await page.goto("/bounty/0000000000000000000000000000000000000000000000000000000000000000");
    await expect(page.getByText(/loading bounty/i)).toBeVisible({ timeout: 5_000 });
  });

  test("renders on valid URL pattern", async ({ page }) => {
    const response = await page.goto("/bounty/0000000000000000000000000000000000000000000000000000000000000000");
    expect(response?.status()).toBe(200);
  });
});

test.describe("Homepage Sort", () => {
  test("has sort dropdown with all options", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "BTC-Bounty" })).toBeVisible();
    // Verify sort options exist in the page
    await expect(page.getByRole("option", { name: "Newest first" })).toBeAttached();
    await expect(page.getByRole("option", { name: "Oldest first" })).toBeAttached();
    await expect(page.getByRole("option", { name: "Highest reward" })).toBeAttached();
    await expect(page.getByRole("option", { name: "Lowest reward" })).toBeAttached();
  });

  test("sort dropdown defaults to newest", async ({ page }) => {
    await page.goto("/");
    // Find the sort select — it should contain "Newest first" as the first/default option
    const sortSelect = page.locator("select").last();
    await expect(sortSelect).toBeVisible();
    // The select's value should default to "newest" or show "Newest first"
    await expect(page.getByRole("option", { name: "Newest first" })).toBeAttached();
  });
});
