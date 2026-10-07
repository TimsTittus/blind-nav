import { expect, test, type Page } from "@playwright/test";

async function startNavigation(page: Page) {
  await page.goto("/");
  await page.getByLabel("Destination (optional)").fill("SJCET");
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page).toHaveURL(/\/navigate$/);
}

test("home opens and offers session creation", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Start a session" }),
  ).toBeVisible();
  await expect(page.getByLabel("Navigate to a destination")).toBeChecked();
});

test("creating a session enters Navigation Mode with honest UNKNOWN status", async ({
  page,
}) => {
  await startNavigation(page);

  await expect(
    page.getByRole("heading", { level: 1, name: "Navigation mode" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Camera view" })).toBeVisible();
  await expect(page.getByText("Destination", { exact: true })).toBeVisible();
  await expect(page.getByText("SJCET")).toBeVisible();
  await expect(page.getByText("UNKNOWN", { exact: true })).toBeVisible();
  await expect(page.getByText("SAFE", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Simulated data")).toBeVisible();

  const group = page.getByRole("group", { name: "Session controls" });
  await expect(
    group.getByRole("button", { name: "Voice guidance" }),
  ).toBeVisible();
  await expect(
    group.getByRole("button", { name: "Pause guidance" }),
  ).toBeVisible();
  await expect(
    group.getByRole("button", { name: "Stop session" }),
  ).toBeVisible();
});

test("pausing degrades to UNKNOWN and announces politely", async ({ page }) => {
  await startNavigation(page);
  await page.getByRole("button", { name: "Pause guidance" }).click();
  await expect(
    page.getByRole("button", { name: "Pause guidance" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("status")).toContainText("Paused");
});

test("stopping the session returns home and clears it", async ({ page }) => {
  await startNavigation(page);
  await page.getByRole("button", { name: "Stop session" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "Start a session" }),
  ).toBeVisible();

  await page.goto("/navigate");
  await expect(page.getByText("No active session.")).toBeVisible();
});

test("the controls are reachable and operable by keyboard", async ({
  page,
}) => {
  await startNavigation(page);
  const voice = page.getByRole("button", { name: "Voice guidance" });
  const pause = page.getByRole("button", { name: "Pause guidance" });
  const stop = page.getByRole("button", { name: "Stop session" });

  await voice.focus();
  await expect(voice).toBeFocused();
  await page.keyboard.press("Space");
  await expect(voice).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("Tab");
  await expect(pause).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(stop).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/$/);
});

test("debug overlay shows session info and simulated scenarios (dev only)", async ({
  page,
}) => {
  await startNavigation(page);
  await page.getByRole("button", { name: "Debug", exact: true }).click();
  const debug = page.getByRole("complementary", {
    name: "Developer debug information",
  });
  await expect(debug).toBeVisible();
  for (const name of [
    "Session ID",
    "Mode",
    "Perception",
    "GPS",
    "AI",
    "Safety level",
    "Last analysis",
    "Analysis latency",
  ]) {
    await expect(debug.getByText(name, { exact: true })).toBeVisible();
  }

  await debug.getByLabel("Simulated scenario").selectOption("critical");
  await expect(page.locator(".instruction").getByRole("alert")).toContainText(
    "STOP. Obstacle directly ahead.",
  );
  await expect(page.getByText("CRITICAL", { exact: true })).toBeVisible();
  await expect(debug.getByText("n/a")).toHaveCount(0);

  await debug.getByRole("button", { name: "Close debug" }).click();
  await expect(debug).toBeHidden();
});

for (const viewport of [
  { name: "mobile portrait", width: 375, height: 667 },
  { name: "mobile landscape", width: 667, height: 375 },
  { name: "desktop", width: 1280, height: 800 },
]) {
  test(`layout fits without horizontal scroll and keeps camera ratio (${viewport.name})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await startNavigation(page);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    const box = await page
      .getByRole("region", { name: "Camera view" })
      .boundingBox();
    expect(box).not.toBeNull();
    const ratio = box!.width / box!.height;
    expect([4 / 3, 16 / 9].some((r) => Math.abs(ratio - r) < 0.05)).toBe(true);
    await expect(
      page.getByRole("button", { name: "Stop session" }),
    ).toBeInViewport();
  });
}
