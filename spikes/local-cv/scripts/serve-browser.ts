/**
 * Static server for the in-browser benchmark (browser/index.html). Sends
 * COOP/COEP so onnxruntime-web can use multi-threaded WASM.
 *
 *   bun scripts/serve-browser.ts   → http://localhost:4317
 */
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ROUTES: Array<[prefix: string, dir: string]> = [
  ["/ort/", `${ROOT}node_modules/onnxruntime-web/dist/`],
  ["/models/", `${ROOT}models/`],
  ["/hf/", `${ROOT}.cache/`],
  ["/images/", `${ROOT}data/images/`],
  ["/data/", `${ROOT}data/`],
  ["/", `${ROOT}browser/`],
];

const server = Bun.serve({
  port: 4317,
  hostname: "127.0.0.1",
  async fetch(req) {
    const path = decodeURIComponent(new URL(req.url).pathname);
    if (path.includes("..")) return new Response("bad path", { status: 400 });
    const route = ROUTES.find(([prefix]) => path.startsWith(prefix));
    if (!route) return new Response("not found", { status: 404 });
    const rel = path.slice(route[0].length) || "index.html";
    const file = Bun.file(route[1] + rel);
    if (!(await file.exists()))
      return new Response("not found", { status: 404 });
    return new Response(file, {
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cache-Control": "no-store",
      },
    });
  },
});
console.log(`browser benchmark at http://${server.hostname}:${server.port}/`);
