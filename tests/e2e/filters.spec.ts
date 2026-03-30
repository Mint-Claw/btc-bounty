import { test, expect } from "@playwright/test";

test.describe("Filter Controls", () => {
  test("status filter updates URL", async ({ page }) => {
    await page.goto("/");
    const statusSelect = page.getByRole("combobox").first();
    await statusSelect.selectOption("OPEN");
    await expect(page).toHaveURL(/status=OPEN/);
  });

  test("category filter updates URL", async ({ page }) => {
    await page.goto("/");
    const categorySelect = page.getByRole("combobox").nth(1);
    await categorySelect.selectOption("code");
    await expect(page).toHaveURL(/category=code/);
  });

  test("sort filter updates URL for non-default", async ({ page }) => {
    await page.goto("/");
    const sortSelect = page.getByRole("combobox").nth(2);
    await sortSelect.selectOption("reward_high");
    await expect(page).toHaveURL(/sort=reward_high/);
  });

  test("sort=newest does not appear in URL", async ({ page }) => {
    await page.goto("/?sort=reward_high");
    const sortSelect = page.getByRole("combobox").nth(2);
    await sortSelect.selectOption("newest");
    // newest is default, should not be in URL
    await expect(page).not.toHaveURL(/sort=/);
  });

  test("clear button appears when filters active", async ({ page }) => {
    await page.goto("/");
    // No clear button initially
    await expect(page.getByText("✕ Clear")).not.toBeVisible();
    // Set a filter
    const statusSelect = page.getByRole("combobox").first();
    await statusSelect.selectOption("OPEN");
    // Clear button should appear
    await expect(page.getByText("✕ Clear")).toBeVisible();
  });

  test("clear button resets all filters", async ({ page }) => {
    await page.goto("/?status=OPEN&category=code&sort=reward_high");
    await expect(page.getByText("✕ Clear")).toBeVisible();
    await page.getByText("✕ Clear").click();
    // URL should be clean
    await expect(page).toHaveURL("/");
    // Dropdowns should be reset
    const statusSelect = page.getByRole("combobox").first();
    await expect(statusSelect).toHaveValue("");
  });

  test("URL params pre-fill filters on load", async ({ page }) => {
    await page.goto("/?status=COMPLETED&category=design");
    const statusSelect = page.getByRole("combobox").first();
    const categorySelect = page.getByRole("combobox").nth(1);
    await expect(statusSelect).toHaveValue("COMPLETED");
    await expect(categorySelect).toHaveValue("design");
  });

  test("search updates URL with q param", async ({ page }) => {
    await page.goto("/");
    const search = page.getByPlaceholder("Search bounties");
    await search.fill("bitcoin");
    // Should update URL (may have slight delay for state)
    await expect(page).toHaveURL(/q=bitcoin/, { timeout: 3_000 });
  });
});
