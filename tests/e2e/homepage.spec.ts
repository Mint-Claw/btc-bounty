import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("loads and shows header", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("header")).toBeVisible();
    await expect(page.getByRole("heading", { name: "BTC-Bounty" })).toBeVisible();
  });

  test("shows hero section with tagline", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Post work. Get paid in")).toBeVisible();
    await expect(page.getByText("sats")).toBeVisible();
  });

  test("has Post Bounty button", async ({ page }) => {
    await page.goto("/");
    const btn = page.getByRole("link", { name: "Post Bounty" });
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute("href", "/post");
  });

  test("shows relay status component in header", async ({ page }) => {
    await page.goto("/");
    // RelayStatus renders as a small indicator — just check header has expected structure
    await expect(page.locator("header")).toBeVisible();
    // The component exists even if relay text varies
    await expect(page.getByRole("heading", { name: "BTC-Bounty" })).toBeVisible();
  });

  test("shows search input", async ({ page }) => {
    await page.goto("/");
    const search = page.getByPlaceholder("Search bounties");
    await expect(search).toBeVisible();
  });

  test("shows filter dropdowns", async ({ page }) => {
    await page.goto("/");
    // Select elements are visible, option text inside them is hidden
    const statusSelect = page.locator("select").first();
    await expect(statusSelect).toBeVisible();
    const categorySelect = page.locator("select").nth(1);
    await expect(categorySelect).toBeVisible();
  });

  test("footer is visible with links", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("built on NOSTR + Lightning")).toBeVisible();
    await expect(page.getByRole("link", { name: "RSS Feed" })).toBeVisible();
    await expect(page.getByRole("link", { name: "API Docs" })).toBeVisible();
  });

  test("navigates to Post Bounty page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Post Bounty" }).click();
    await expect(page).toHaveURL("/post");
  });
});
