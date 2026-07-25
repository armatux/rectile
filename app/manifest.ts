import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  const base: MetadataRoute.Manifest = {
    name: "rectile",
    short_name: "rectile",
    description: "Self-hosted project operations terminal",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#07040d",
    theme_color: "#07040d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
  // Web Share Target (Android/Chromium installed PWA; iOS Safari lacks it):
  // sharing text/URLs into the app lands on /share as query params.
  return {
    ...base,
    share_target: {
      action: "/share",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
    // long-press app icon → jump straight into a mode (Android/desktop PWA)
    shortcuts: [
      { name: "Calendar", url: "/calendar", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Mail", url: "/mail", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Reminders", url: "/reminders", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Vault", url: "/vault", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  } as MetadataRoute.Manifest;
}
