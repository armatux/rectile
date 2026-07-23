import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { TopBar } from "@/components/TopBar";
import { SwRegister } from "@/components/SwRegister";
import { OfflineSync } from "@/components/OfflineSync";

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const grotesk = Space_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "rectile", template: "%s · rectile" },
  description: "Self-hosted project operations terminal",
  applicationName: "rectile",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "rectile",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#07040d",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${jetbrains.variable} ${grotesk.variable} antialiased`}>
        <div className="grid-floor" aria-hidden />
        <div className="relative z-10 mx-auto flex min-h-dvh max-w-[1400px] flex-col">
          <TopBar />
          <main className="safe-x safe-bottom flex-1 pb-16">{children}</main>
        </div>
        <div className="vignette" aria-hidden />
        <SwRegister />
        <OfflineSync />
      </body>
    </html>
  );
}
