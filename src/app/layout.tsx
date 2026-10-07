import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "blind-nav — assistive navigation prototype",
  description:
    "Browser-based prototype for AI-assisted navigation and obstacle awareness for visually impaired users. Prototype only — not a certified safety device.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Allow user zoom — never disable it (accessibility requirement).
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {/* Skip link for keyboard / screen-reader users. */}
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
