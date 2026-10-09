import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  headers: async () => [
    {
      /**
       * Cross-origin isolation, required for `SharedArrayBuffer` and therefore
       * for multi-threaded WASM inference in the local perception backend.
       * Phase 13 measured single-threaded WASM at roughly 1.5× the
       * multi-threaded time, so the app still works without this — it is just
       * slower.
       *
       * The cost is that cross-origin resources must opt in via CORP/CORS.
       * This app loads no third-party scripts, fonts or frames, so nothing is
       * currently affected; adding any would need `crossorigin` attributes.
       */
      source: "/:path*",
      headers: [
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
      ],
    },
    {
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Service-Worker-Allowed", value: "/" },
      ],
    },
    {
      source: "/manifest.json",
      headers: [{ key: "Cache-Control", value: "public, max-age=3600" }],
    },
  ],
};

export default nextConfig;
