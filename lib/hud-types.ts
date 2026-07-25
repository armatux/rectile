import type { Project } from "@/db/schema";
import type { StalenessTier } from "@/lib/ui";
import type { CpptutorProgress } from "@/lib/cpptutor";

/** Slim, serializable project row for the HUD roster / pins / primary panel. */
export type HudProject = {
  id: number;
  slug: string;
  name: string;
  status: Project["status"];
  priority: number;
  built: number;
  total: number;
  pct: number;
  idleDays: number;
  ageDays: number;
  tier: StalenessTier;
  nextAction: string | null;
  nextActionFeatureId: number | null;
};

export type HudVitals = {
  activeProjects: number;
  avgProgress: number;
  hotCount: number;
  longestIdleDays: number;
  longestIdleName: string | null;
  activity: number[];
};

export type HudUpcoming = {
  /** "24 JUL 18:00" / "27 JUL" */
  when: string;
  title: string;
  href: string;
  source: "event" | "reminder";
};

export type HudTutor = {
  data: CpptutorProgress;
  /** ISO — serializable across the RSC boundary */
  updatedAt: string;
};

export type LauncherApp = {
  label: string;
  url: string;
};

/** Everything the HUD chrome (sidebar + topline + voice dock) needs. */
export type HudChromeData = {
  projects: HudProject[]; // non-archived, stalest first
  vitals: HudVitals;
  tutor: HudTutor | null;
  upcoming: HudUpcoming[]; // next 14 days, soonest first
  mailUnread: number | null; // null = mail link down / not configured
  briefs: string[]; // rotating assistant one-liners, real data
  launcher: LauncherApp[]; // user-defined quick links (kv "app_launcher")
};
