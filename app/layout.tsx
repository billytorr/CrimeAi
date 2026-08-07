import type { Metadata, Viewport } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { LanguageProvider } from "@/components/LanguageProvider";

// ⚠️ This is the App Store / Play / search description. It must stay true of
// what the product actually does. The old copy promised "No facial
// recognition" — no longer accurate now that identity verification matches a
// selfie against the user's own ID. What remains true, and is the claim worth
// making, is that we never identify strangers and never predict who offends.
// Guarded by lib/public-claims.test.ts. See DATA-GOVERNANCE.md.
const DESC = "Talk to CrimeAI about safety near you. Real, cited data from verified neighbors. We never identify strangers from a photo and never predict who commits crime. Public safety, done right.";

export const metadata: Metadata = {
  metadataBase: new URL("https://crimeai.app"),
  applicationName: "CrimeAI",
  title: { default: "CrimeAI — Public Safety Crime Center", template: "%s · CrimeAI" },
  description: DESC,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CrimeAI",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/icon.svg"],
  },
  // Logo shows on search engines, shared links, and app-download previews.
  openGraph: {
    type: "website",
    siteName: "CrimeAI",
    title: "CrimeAI — Public Safety Crime Center",
    description: DESC,
    images: [{ url: "/og.png", width: 1024, height: 1024, alt: "CrimeAI" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "CrimeAI — Public Safety Crime Center",
    description: DESC,
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0b10",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

// Applies the saved theme before first paint so there's no flash of the
// wrong theme. Must stay inline and dependency-free.
const THEME_BOOT = `(function(){try{if(location.protocol==="capacitor:"||location.protocol==="ionic:")document.documentElement.classList.add("native");var t=localStorage.getItem("pscc_theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",t==="light"?"#ffffff":"#0a0b10");}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
