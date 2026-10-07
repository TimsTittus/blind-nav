import { expect, test } from "@playwright/test";

test("home shows the intro, safety disclaimer, and session creator", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "blind-nav" }),
  ).toBeVisible();
  await expect(page.getByRole("note")).toContainText("Prototype only");
  await expect(
    page.getByRole("heading", { name: "Start a session" }),
  ).toBeVisible();
});

test("the skip link is the first focusable control", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to main content" }),
  ).toBeFocused();
});

test("creating an explore session navigates there and the emergency stop returns home", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Explore my surroundings").check();
  await page.getByRole("button", { name: "Start session" }).click();

  await expect(page).toHaveURL(/\/explore$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Explore" }),
  ).toBeVisible();
  await expect(page.getByText("Explore surroundings")).toBeVisible();

  await page.getByRole("button", { name: "Stop session" }).click();
  await expect(page).toHaveURL(/\/$/);
});
