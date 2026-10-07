import type { NextConfig } from "next";

/**
 * Next.js configuration.
 *
 * Kept intentionally minimal for the foundation phase. Feature-specific
 * configuration (headers for camera/geolocation permissions policy, security
 * headers, etc.) will be added in later phases alongside the features that
 * require them, and documented in docs/decisions.md.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `typedRoutes` gives compile-time checking of internal navigation links.
  typedRoutes: true,
};

export default nextConfig;
