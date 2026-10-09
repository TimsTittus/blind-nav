import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ServiceWorkerRegistrar } from "./service-worker-registrar";
import "./globals.css";

export const metadata: Metadata = {
  title: "blind-nav — assistive navigation prototype",
  description:
    "Browser-based prototype for AI-assisted navigation and obstacle awareness for visually impaired users. Prototype only — not a certified safety device.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "blind-nav",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Allow user zoom — never disable it (accessibility requirement).
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0c" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <nav aria-label="Primary" className="primary-nav">
          <Link href="/">Home</Link>
          <Link href="/navigate">Navigate</Link>
          <Link href="/explore">Explore</Link>
        </nav>
        <main id="main">{children}</main>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
