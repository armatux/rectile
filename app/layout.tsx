import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TopBar } from "@/components/TopBar";
import { SwRegister } from "@/components/SwRegister";
import { OfflineSync } from "@/components/OfflineSync";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "Scala", template: "%s · Scala" },
  description: "Self-hosted project hub",
  applicationName: "Scala",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Scala",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrains.variable} antialiased`}>
        <div className="wallpaper" aria-hidden />
        <div className="relative z-10 mx-auto flex min-h-dvh max-w-[1400px] flex-col">
          <TopBar />
          <main className="safe-x safe-bottom flex-1 pb-16">{children}</main>
        </div>
        <SwRegister />
        <OfflineSync />
      </body>
    </html>
  );
}
