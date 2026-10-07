import { expect, test, type Page } from "@playwright/test";

type MockWindow = Window &
  typeof globalThis & {
    __tracks?: MediaStreamTrack[];
    __failWith?: string | null;
  };

/**
 * Replaces getUserMedia before any page script runs. While `window.__failWith`
 * is set, calls reject with that DOMException name (React StrictMode calls
 * start twice in dev, so failure is a mode, not a one-shot queue). Otherwise a
 * synthetic canvas stream is returned. Every track is recorded on
 * `window.__tracks` so tests can verify cleanup.
 */
async function mockCamera(page: Page, failWith: string | null = null) {
  await page.addInitScript((initialFailure: string | null) => {
    const w = window as MockWindow;
    w.__tracks = [];
    w.__failWith = initialFailure;
    const getUserMedia = async () => {
      if (w.__failWith) throw new DOMException("mock", w.__failWith);
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const context = canvas.getContext("2d")!;
      let tick = 0;
      setInterval(() => {
        context.fillStyle = tick++ % 2 ? "#336699" : "#993366";
        context.fillRect(0, 0, 640, 480);
      }, 50);
      const stream = canvas.captureStream(20);
      w.__tracks!.push(...stream.getTracks());
      return stream;
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia, enumerateDevices: async () => [] },
    });
  }, failWith);
}

async function startNavigation(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page).toHaveURL(/\/navigate$/);
}

const cameraStatus = (page: Page) =>
  page.getByRole("listitem").filter({ hasText: "Camera:" });

test("camera unavailable: shows fallback UI and stays honestly UNKNOWN", async ({
  page,
}) => {
  await mockCamera(page, "NotFoundError");
  await startNavigation(page);

  const camera = page.getByRole("region", { name: "Camera view" });
  await expect(
    camera.getByText("No camera was found on this device."),
  ).toBeVisible();
  await expect(
    camera.getByText("Guidance is not available without the camera."),
  ).toBeVisible();
  await expect(
    camera.getByRole("button", { name: "Try camera again" }),
  ).toBeVisible();
  await expect(cameraStatus(page)).toContainText("Unavailable");
  await expect(page.getByText("UNKNOWN", { exact: true })).toBeVisible();
  await expect(page.getByText("SAFE", { exact: true })).toHaveCount(0);
});

test("permission denied, then granted on retry: preview becomes active", async ({
  page,
}) => {
  await mockCamera(page, "NotAllowedError");
  await startNavigation(page);

  const camera = page.getByRole("region", { name: "Camera view" });
  await expect(camera.getByText(/Camera permission was denied/)).toBeVisible();
  await page.evaluate(() => {
    (window as MockWindow).__failWith = null; // user grants access
  });
  await camera.getByRole("button", { name: "Try camera again" }).click();

  await expect(cameraStatus(page)).toContainText("Active");
  await expect(camera.locator("video")).toBeVisible();
  await expect(
    camera.getByRole("button", { name: "Try camera again" }),
  ).toHaveCount(0);
});

test("browser without MediaDevices shows the unsupported fallback", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
  });
  await startNavigation(page);
  const camera = page.getByRole("region", { name: "Camera view" });
  await expect(camera.getByText(/cannot access a camera here/)).toBeVisible();
  await expect(cameraStatus(page)).toContainText("Not supported");
  await expect(camera.getByRole("button")).toHaveCount(0);
});

test("active camera logs frame metadata only, about once per second (dev)", async ({
  page,
}) => {
  await mockCamera(page);
  const logs: string[] = [];
  page.on("console", (message) => {
    if (message.text().startsWith("[camera] frame")) logs.push(message.text());
  });
  await startNavigation(page);
  await expect(cameraStatus(page)).toContainText("Active");

  await expect
    .poll(() => logs.length, { timeout: 8000 })
    .toBeGreaterThanOrEqual(2);
  expect(logs.length).toBeLessThanOrEqual(8);
  expect(logs[0]).toContain("sequence");
  expect(logs[0]).toContain("image/jpeg");
});

test("pause and tab-hidden disable the track; resume restores it", async ({
  page,
}) => {
  await mockCamera(page);
  await startNavigation(page);
  await expect(cameraStatus(page)).toContainText("Active");
  const enabled = () =>
    page.evaluate(() => (window as MockWindow).__tracks!.at(-1)!.enabled);

  await page.getByRole("button", { name: "Pause guidance" }).click();
  await expect(cameraStatus(page)).toContainText("Paused");
  expect(await enabled()).toBe(false);
  await page.getByRole("button", { name: "Pause guidance" }).click();
  await expect(cameraStatus(page)).toContainText("Active");
  expect(await enabled()).toBe(true);

  const setHidden = (hidden: boolean) =>
    page.evaluate((value) => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => (value ? "hidden" : "visible"),
      });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);
  await setHidden(true);
  await expect(cameraStatus(page)).toContainText("Paused");
  expect(await enabled()).toBe(false);
  await setHidden(false);
  await expect(cameraStatus(page)).toContainText("Active");
});

test("stopping the session ends every camera track", async ({ page }) => {
  await mockCamera(page);
  await startNavigation(page);
  await expect(cameraStatus(page)).toContainText("Active");

  await page.getByRole("button", { name: "Stop session" }).click();
  await expect(page).toHaveURL(/\/$/);
  const states = await page.evaluate(() =>
    (window as MockWindow).__tracks!.map((t) => t.readyState),
  );
  expect(states.length).toBeGreaterThan(0);
  expect(states.every((s) => s === "ended")).toBe(true);
});

test("camera is not persisted: no frames in web storage", async ({ page }) => {
  await mockCamera(page);
  await startNavigation(page);
  await expect(cameraStatus(page)).toContainText("Active");
  await page.waitForTimeout(2500);
  const dump = await page.evaluate(async () => ({
    local: JSON.stringify({ ...localStorage }),
    session: JSON.stringify({ ...sessionStorage }),
    idb: (await indexedDB.databases()).map((d) => d.name),
  }));
  expect(dump.local).not.toMatch(/data:image|blob:/);
  expect(dump.session).not.toMatch(/data:image|blob:/);
  expect(dump.idb).toEqual([]);
});
