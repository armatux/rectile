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

/* ---- live bridge payloads (lesson console) ---- */

export type PlayerHeader = {
  level: number;
  title: string;
  prestige: number;
  xp: number;
  xp_lifetime: number;
  xp_level_floor: number;
  xp_level_next: number;
  streak: number;
  streak_best: number;
  freezes: number;
};

export type LessonFlags = {
  id: string;
  title: string;
  read: boolean;
  quiz_done: boolean;
  exercise_done: boolean;
  has_quiz: boolean;
  has_exercise: boolean;
  done: boolean;
};

export type BridgeModule = {
  id: string;
  title: string;
  description: string;
  done: number;
  total: number;
  unlocked: boolean;
  mastered: boolean;
  requires: string[];
  lessons: LessonFlags[];
};

export type BridgeTrack = {
  id: string;
  title: string;
  icon: string;
  tagline: string;
  done: number;
  total: number;
  unlocked: boolean;
  unlock_hint: string;
  modules: BridgeModule[];
};

export type BridgeTree = {
  player: PlayerHeader;
  tracks: BridgeTrack[];
  terminal_session: boolean;
};

export type BridgeLesson = LessonFlags & {
  module: { id: string; title: string };
  track: { id: string; title: string; icon: string };
  body: string;
  quiz_len: number;
  player: PlayerHeader;
};

export type Unlock = { kind: "track" | "module"; id: string; title: string };

export type MutationExtras = {
  events?: string[];
  primers?: string[];
  unlocks?: Unlock[];
  player?: PlayerHeader;
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
  next_id?: string | null;
  synced?: string;
};
