/** Payload written by ~/cpptutor/rectile_sync.py to kv key "cpptutor_progress". */

export type SkillModule = {
  id: string;
  title: string;
  done: number;
  total: number;
  unlocked: boolean;
  mastered: boolean;
  requires: string[];
};

export type SkillTrack = {
  id: string;
  title: string;
  icon: string;
  tagline: string;
  done: number;
  total: number;
  unlocked: boolean;
  unlock_hint: string;
  requires: string[];
  modules: SkillModule[];
};

export type CpptutorProgress = {
  level: number;
  title: string;
  prestige: number;
  xp: number;
  xp_lifetime: number;
  xp_level_floor: number;
  xp_level_next: number;
  done: number;
  total: number;
  tracks?: { id: string; title: string; done: number; total: number }[];
  streak: number;
  streak_best: number;
  freezes?: number;
  skill_tree?: SkillTrack[];
  /** ISO day -> lesson completions that day (last ~26 weeks). */
  activity?: Record<string, number>;
  next_lesson: string | null;
  next_module: string | null;
  next_track: string | null;
  synced?: string;
};
