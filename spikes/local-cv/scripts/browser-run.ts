/**
 * Drives browser/index.html in Playwright engines and saves the results.
 * Requires `bun scripts/serve-browser.ts` running. Desktop engines only — these
 * are not phone measurements.
 *
 *   bun scripts/browser-run.ts [--headed] [chromium|firefox|webkit ...]
 *
 * Headless Chromium on Linux only exposes a software (SwiftShader) WebGPU
 * adapter, which the page detects and skips. `--headed` opens a visible window
 * so Chromium can use the real GPU.
 */
import { writeFile } from "node:fs/promises";
import { chromium, firefox, webkit, type BrowserType } from "@playwright/test";
import { RESULTS_DIR } from "../src/dataset";

const ENGINES: Record<string, { type: BrowserType; args: string[] }> = {
  chromium: {
    type: chromium,
    args: [
      "--enable-unsafe-webgpu",
      "--enable-features=Vulkan,WebGPU",
      "--use-angle=vulkan",
      "--ignore-gpu-blocklist",
    ],
  },
  firefox: { type: firefox, args: [] },
  webkit: { type: webkit, args: [] },
};

const headed = process.argv.includes("--headed");
const names = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const selected = names.length > 0 ? names : Object.keys(ENGINES);
for (const name of selected) {
  const engine = ENGINES[name];
  if (!engine) throw new Error(`unknown engine ${name}`);
  const browser = await engine.type.launch({
    headless: !headed,
    args: engine.args,
  });
  try {
    const page = await browser.newPage();
    const consoleLines: string[] = [];
    page.on("console", (m) => {
      if (m.text().startsWith("[bench]"))
        console.log(`${name}: ${m.text().slice(0, 400)}`);
      if (
        /warn|error/i.test(m.type()) ||
        /EP|fallback|assigned/i.test(m.text())
      ) {
        consoleLines.push(`${m.type()}: ${m.text().slice(0, 300)}`);
      }
    });
    await page.goto("http://127.0.0.1:4317/");
    await page.click("#run");
    await page.waitForFunction(() => "__benchResult" in window, null, {
      timeout: 30 * 60_000,
    });
    const result = await page.evaluate(
      () => (window as unknown as { __benchResult: unknown }).__benchResult,
    );
    const out = {
      engine: name,
      version: browser.version(),
      result,
      console: consoleLines.slice(0, 40),
    };
    await writeFile(
      `${RESULTS_DIR}/browser-${name}.json`,
      JSON.stringify(out, null, 2) + "\n",
    );
    console.log(JSON.stringify(out, null, 1).slice(0, 6000));
  } finally {
    await browser.close();
  }
}
