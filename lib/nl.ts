import { isRepeat, type Repeat } from "./recur";

/**
 * Natural-language quick-add parser: "pay rent friday 18:00 #flat every month"
 * → { title: "pay rent", dueAt, repeat: "monthly", projectSlug: "flat" }.
 *
 * English + German keywords. Matched tokens are stripped from the title.
 * Pure and Date-in/Date-out so it runs identically on client and server.
 */

export type ParsedReminder = {
  title: string;
  dueAt?: Date;
  repeat?: Repeat;
  projectSlug?: string;
};

const WEEKDAYS: [RegExp, number][] = [
  [/\b(?:mon(?:day)?|montag)\b/i, 1],
  [/\b(?:tue(?:s(?:day)?)?|dienstag)\b/i, 2],
  [/\b(?:wed(?:nesday)?|mittwoch)\b/i, 3],
  [/\b(?:thu(?:rs(?:day)?)?|donnerstag)\b/i, 4],
  [/\b(?:fri(?:day)?|freitag)\b/i, 5],
  [/\b(?:sat(?:urday)?|samstag)\b/i, 6],
  [/\b(?:sun(?:day)?|sonntag)\b/i, 7],
];

const REPEAT_WORDS: [RegExp, Repeat][] = [
  [/\b(?:every ?day|daily|jeden tag|t[äa]glich)\b/i, "daily"],
  [/\b(?:every ?week|weekly|jede woche|w[öo]chentlich)\b/i, "weekly"],
  [/\b(?:every ?month|monthly|jeden monat|monatlich)\b/i, "monthly"],
  [/\b(?:every ?year|yearly|annually|jedes jahr|j[äa]hrlich)\b/i, "yearly"],
];

const UNIT_MS: Record<string, number> = {
  m: 60_000,
  min: 60_000,
  minute: 60_000,
  minutes: 60_000,
  minuten: 60_000,
  h: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
  stunde: 3_600_000,
  stunden: 3_600_000,
  d: 86_400_000,
  day: 86_400_000,
  days: 86_400_000,
  tag: 86_400_000,
  tagen: 86_400_000,
  w: 604_800_000,
  week: 604_800_000,
  weeks: 604_800_000,
  woche: 604_800_000,
  wochen: 604_800_000,
};

function atMidnight(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function nextWeekday(now: Date, isoDay: number): Date {
  const d = atMidnight(now);
  const cur = ((d.getDay() + 6) % 7) + 1; // ISO: Mon=1..Sun=7
  const ahead = ((isoDay - cur) % 7 + 7) % 7 || 7; // strictly future
  d.setDate(d.getDate() + ahead);
  return d;
}

/**
 * Reminder tag on a calendar entry: "!30m" / "!2h" / "!1d" / "!remind"
 * (default 30m) → minutes of lead time for a pre-event reminder push.
 */
export function parseRemindTag(input: string): {
  text: string;
  remindBeforeMin?: number;
} {
  const m = /(?:^|\s)!(?:(\d+) ?(m|min|h|std|d)|remind|erinnerung)(?=\s|$)/i.exec(
    input,
  );
  if (!m) return { text: input };
  const unit = m[2]?.toLowerCase();
  const mins = m[1]
    ? +m[1] * (unit === "h" || unit === "std" ? 60 : unit === "d" ? 1440 : 1)
    : 30;
  return {
    text: input.replace(m[0], " ").replace(/\s+/g, " ").trim(),
    remindBeforeMin: Math.min(mins, 10_080),
  };
}

export function parseReminderText(
  input: string,
  now: Date,
  knownSlugs?: string[],
): ParsedReminder {
  let rest = ` ${input} `;
  const strip = (re: RegExp): RegExpExecArray | null => {
    const m = re.exec(rest);
    if (m) rest = rest.replace(m[0], " ");
    return m;
  };

  let projectSlug: string | undefined;
  const slugM = strip(/(?<=\s)#([a-z0-9][a-z0-9-]*)(?=\s)/i);
  if (slugM) {
    const s = slugM[1].toLowerCase();
    if (!knownSlugs || knownSlugs.includes(s)) projectSlug = s;
  }

  let repeat: Repeat | undefined;
  let repeatDay: number | undefined;
  for (const [re, day] of WEEKDAYS) {
    const m = strip(
      new RegExp(`\\b(?:every|jeden)\\s+${re.source.slice(2, -2)}\\b`, "i"),
    );
    if (m) {
      repeat = "weekly";
      repeatDay = day;
      break;
    }
  }
  if (!repeat) {
    for (const [re, r] of REPEAT_WORDS) {
      if (strip(re)) {
        repeat = r;
        break;
      }
    }
  }

  /* ---- date ---- */
  let date: Date | undefined;
  let hasExplicitDate = false;

  const iso = strip(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    date = new Date(+iso[1], +iso[2] - 1, +iso[3]);
    hasExplicitDate = true;
  }
  if (!date) {
    // DD.MM. / DD.MM.YYYY (German), not part of a longer dotted token
    const de = strip(/(?<=\s)(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})?(?=[\s,])/);
    if (de) {
      const y = de[3] ? (+de[3] < 100 ? 2000 + +de[3] : +de[3]) : now.getFullYear();
      date = new Date(y, +de[2] - 1, +de[1]);
      if (!de[3] && date < atMidnight(now)) date.setFullYear(y + 1);
      hasExplicitDate = true;
    }
  }
  if (!date && strip(/\b(?:tomorrow|tmrw|morgen)\b/i)) {
    date = atMidnight(now);
    date.setDate(date.getDate() + 1);
    hasExplicitDate = true;
  }
  if (!date && strip(/\b(?:[üu]bermorgen)\b/i)) {
    date = atMidnight(now);
    date.setDate(date.getDate() + 2);
    hasExplicitDate = true;
  }
  let tonight = false;
  if (!date && strip(/\btonight\b/i)) {
    date = atMidnight(now);
    tonight = true;
    hasExplicitDate = true;
  }
  if (!date && strip(/\b(?:today|heute)\b/i)) {
    date = atMidnight(now);
    hasExplicitDate = true;
  }
  if (!date && strip(/\bnext week\b/i)) {
    date = atMidnight(now);
    date.setDate(date.getDate() + 7);
    hasExplicitDate = true;
  }

  let relative: Date | undefined;
  if (!date) {
    const rel = strip(/\bin (\d+) ?([a-zä]+)\b/i);
    if (rel && UNIT_MS[rel[2].toLowerCase()]) {
      relative = new Date(now.getTime() + +rel[1] * UNIT_MS[rel[2].toLowerCase()]);
    }
  }

  if (!date && !relative) {
    for (const [re, day] of WEEKDAYS) {
      const m = strip(
        new RegExp(`\\b(?:on |next |am )?${re.source.slice(2, -2)}\\b`, "i"),
      );
      if (m) {
        date = nextWeekday(now, day);
        hasExplicitDate = true;
        break;
      }
    }
  }

  /* ---- time ---- */
  let hours: number | undefined;
  let minutes = 0;
  const hm = strip(/\b(?:at |@ ?|um )?([01]?\d|2[0-3]):([0-5]\d)\b/i);
  if (hm) {
    hours = +hm[1];
    minutes = +hm[2];
  } else {
    const ampm = strip(/\b(1[0-2]|[1-9]) ?(am|pm)\b/i);
    if (ampm) {
      hours = (+ampm[1] % 12) + (ampm[2].toLowerCase() === "pm" ? 12 : 0);
    } else {
      const uhr = strip(/\b(2[0-3]|1?\d) ?uhr\b/i);
      if (uhr) hours = +uhr[1];
      else {
        const at = strip(/\b(?:at|um) (2[0-3]|1?\d)\b/i);
        if (at) hours = +at[1];
      }
    }
  }

  /* ---- compose ---- */
  let dueAt: Date | undefined;
  if (relative) {
    dueAt = relative;
  } else if (date || hours !== undefined || repeat) {
    const d = date ? new Date(date) : atMidnight(now);
    if (hours !== undefined) d.setHours(hours, minutes, 0, 0);
    else if (tonight) d.setHours(20, 0, 0, 0);
    else d.setHours(9, 0, 0, 0);
    if (repeat === "weekly" && repeatDay !== undefined && !hasExplicitDate) {
      const wd = nextWeekday(now, repeatDay);
      d.setFullYear(wd.getFullYear(), wd.getMonth(), wd.getDate());
    }
    // a time (or bare cadence) that already passed rolls to the next day
    if (d <= now && !hasExplicitDate) d.setDate(d.getDate() + 1);
    dueAt = d;
  }

  const title =
    rest
      .replace(/\s+/g, " ")
      .replace(/^[\s,.:;–-]+|[\s,.:;–-]+$/g, "")
      .trim() || input.trim();

  const out: ParsedReminder = { title };
  if (dueAt) out.dueAt = dueAt;
  if (repeat && isRepeat(repeat)) out.repeat = repeat;
  if (projectSlug) out.projectSlug = projectSlug;
  return out;
}
