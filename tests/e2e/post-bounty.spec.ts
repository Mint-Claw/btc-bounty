import { test, expect } from "@playwright/test";

test.describe("Post Bounty Page", () => {
  test("loads post bounty page", async ({ page }) => {
    await page.goto("/post");
    await expect(page.getByText(/post.*bounty/i)).toBeVisible();
  });

  test("shows NIP-07 extension prompt (no extension in headless)", async ({ page }) => {
    await page.goto("/post");
    // In headless Chrome, NIP07Guard shows extension required message
    await expect(page.getByText("NOSTR Extension Required")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("link", { name: /Alby/i })).toBeVisible();
  });

  test("back navigation works", async ({ page }) => {
    await page.goto("/post");
    const homeLink = page.getByRole("link", { name: /BTC-Bounty|home|back|browse/i });
    if (await homeLink.isVisible()) {
      await homeLink.click();
      await expect(page).toHaveURL("/");
    }
  });
});

test.describe("404 Page", () => {
  test("shows 404 for invalid routes", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");
    await expect(page.getByText("404")).toBeVisible();
  });

  test("has link back to bounties", async ({ page }) => {
    await page.goto("/nonexistent-route");
    await expect(page.getByRole("link", { name: /browse bounties/i })).toBeVisible();
  });
});
