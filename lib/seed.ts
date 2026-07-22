import { db } from "@/db";
import { projects } from "@/db/schema";
import { addFeature, addLink, addLogEntry, createProject } from "./repo";
import { eq } from "drizzle-orm";

const DAY = 86_400_000;

function daysAgo(n: number) {
  return new Date(Date.now() - n * DAY);
}

/** Inserts 3 demo projects. No-op if any projects already exist. */
export async function seedDemoData(): Promise<boolean> {
  const count = await db.$count(projects);
  if (count > 0) return false;

  // 1 — fresh, active, mid-progress
  const drone = await createProject({
    name: "FPV Drone Build",
    description:
      "5-inch freestyle quad from parts. Betaflight tuning, DJI O4 video, custom 3D-printed mounts.",
    category: "hardware",
    priority: 1,
    tags: ["hardware", "3d-printing"],
  });
  const droneFeatures = [
    { title: "Frame assembly + motor mounting", status: "built" as const },
    { title: "Solder ESC/FC stack + smoke test", status: "built" as const },
    { title: "Betaflight base config + modes", status: "built" as const },
    { title: "O4 air unit install + camera mount print", status: "in_progress" as const },
    { title: "PID tune maiden flight", status: "planned" as const },
    { title: "GPS rescue setup", status: "planned" as const },
    { title: "Spare props + field kit", status: "planned" as const },
  ];
  for (const f of droneFeatures) await addFeature(drone.slug, f);
  await addLogEntry(drone.slug, "ESC stack soldered, all 4 motors spin — **smoke test passed**.");
  await addLogEntry(drone.slug, "Printed the O4 mount v2 in TPU, fits much better than v1.");
  await addLink(drone.slug, { label: "Betaflight docs", url: "https://betaflight.com/docs" });
  await addLink(drone.slug, { label: "Build log thread", url: "https://intofpv.com" });

  // 2 — stale-ish, half built
  const homelab = await createProject({
    name: "Homelab Monitoring",
    description:
      "Grafana + Prometheus + node_exporter across Proxmox nodes and containers. Alerting to phone.",
    category: "infra",
    priority: 2,
    tags: ["homelab", "infra"],
  });
  const homelabFeatures = [
    { title: "Prometheus + node_exporter on all nodes", status: "built" as const },
    { title: "Grafana dashboards for CPU/RAM/disk", status: "built" as const },
    { title: "Alertmanager → ntfy push alerts", status: "in_progress" as const },
    { title: "SMART disk health panel", status: "planned" as const },
    { title: "UPS runtime metrics", status: "planned" as const },
  ];
  for (const f of homelabFeatures) await addFeature(homelab.slug, f);
  await addLogEntry(homelab.slug, "Dashboards live for all 3 nodes. Alert rules still noisy — need tuning.");
  await addLink(homelab.slug, { label: "Grafana", url: "https://grafana.example.lan" });

  // 3 — idea stage, nothing built, very stale
  const synth = await createProject({
    name: "Eurorack Sequencer",
    description:
      "RP2040-based 8-step sequencer module. CV/gate out, OLED, rotary encoder UI.",
    category: "electronics",
    status: "idea",
    priority: 3,
    tags: ["hardware", "music"],
  });
  const synthFeatures = [
    { title: "Schematic: CV DAC + gate outs", status: "planned" as const },
    { title: "Breadboard prototype", status: "planned" as const },
    { title: "Panel design", status: "planned" as const },
  ];
  for (const f of synthFeatures) await addFeature(synth.slug, f);
  await addLogEntry(synth.slug, "Sketched the UI flow on paper. MCP4728 looks right for 4x CV out.");

  // Backdate timestamps so staleness tiers are visible immediately:
  // drone fresh (1d), homelab stale (12d), synth dying (34d).
  await db.update(projects).set({ lastTouchedAt: daysAgo(1), createdAt: daysAgo(90) })
    .where(eq(projects.slug, drone.slug));
  await db.update(projects).set({ lastTouchedAt: daysAgo(12), createdAt: daysAgo(200) })
    .where(eq(projects.slug, homelab.slug));
  await db.update(projects).set({ lastTouchedAt: daysAgo(34), createdAt: daysAgo(60) })
    .where(eq(projects.slug, synth.slug));

  return true;
}
