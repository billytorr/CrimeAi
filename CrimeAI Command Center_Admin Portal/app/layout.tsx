import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CrimeAI Command Center",
  description: "Internal operations portal for the Public Safety Crime Center.",
  icons: { icon: "/icon.svg" },
  robots: { index: false, follow: false }, // internal tool — never indexed
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
