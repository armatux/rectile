import { HudChrome } from "@/components/hud/HudChrome";
import { PrecachePing } from "@/components/PrecachePing";
import { getHudChrome } from "@/lib/hud";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const chrome = await getHudChrome();
  return (
    <>
      <PrecachePing
        urls={[
          "/",
          "/stale",
          "/offline",
          "/cpptutor",
          "/calendar",
          "/reminders",
          "/review",
          "/share",
          "/archive",
          ...chrome.projects.map((p) => `/p/${p.slug}`),
        ]}
      />
      <HudChrome data={chrome} mode="core" />
    </>
  );
}
