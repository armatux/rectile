/**
 * Minimal ICS (RFC 5545) parser + occurrence expansion — enough for
 * calendar subscriptions like Proton Calendar share links.
 *
 * Supported: VEVENT with DTSTART/DTEND (UTC "Z", TZID=..., VALUE=DATE),
 * SUMMARY/LOCATION/DESCRIPTION, EXDATE, and RRULE with FREQ
 * DAILY/WEEKLY/MONTHLY/YEARLY + INTERVAL/COUNT/UNTIL (+ BYDAY for WEEKLY).
 * Exotic recurrences degrade to "first occurrence only".
 */

export type IcsEvent = {
  uid: string;
  title: string;
  location?: string;
  startsAt: Date;
  endsAt?: Date;
  allDay: boolean;
};

/* ---------------------------- line-level parse ---------------------------- */

function unfold(text: string): string[] {
  const raw = text.split(/\r?\n/);
  const lines: string[] = [];
  for (const l of raw) {
    if ((l.startsWith(" ") || l.startsWith("\t")) && lines.length) {
      lines[lines.length - 1] += l.slice(1);
    } else if (l.length) {
      lines.push(l);
    }
  }
  return lines;
}

type Prop = { name: string; params: Record<string, string>; value: string };

function parseLine(line: string): Prop | null {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...paramParts] = head.split(";");
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name: name.toUpperCase(), params, value };
}

/* ------------------------------- date parse ------------------------------- */

/** UTC ms offset of `timeZone` at the given UTC instant. */
function tzOffsetMs(timeZone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(at).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - at.getTime();
}

/** Parse an ICS date/date-time property value into a UTC Date. */
export function parseIcsDate(value: string, params: Record<string, string>): {
  date: Date;
  allDay: boolean;
} | null {
  if (params.VALUE === "DATE" || /^\d{8}$/.test(value)) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
    if (!m) return null;
    return {
      date: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])),
      allDay: true,
    };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!m) return null;
  const utcGuess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  if (m[7] === "Z" || !params.TZID) {
    return { date: new Date(utcGuess), allDay: false };
  }
  try {
    // wall-clock in TZID → UTC (two-pass to converge across DST edges)
    let off = tzOffsetMs(params.TZID, new Date(utcGuess));
    off = tzOffsetMs(params.TZID, new Date(utcGuess - off));
    return { date: new Date(utcGuess - off), allDay: false };
  } catch {
    return { date: new Date(utcGuess), allDay: false };
  }
}

/* --------------------------------- RRULE ---------------------------------- */

type RRule = {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  count?: number;
  until?: Date;
  byDay?: number[]; // JS weekday numbers, WEEKLY only
};

const DAY_NUM: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function parseRRule(value: string): RRule | null {
  const parts = Object.fromEntries(
    value.split(";").map((p) => {
      const eq = p.indexOf("=");
      return [p.slice(0, eq).toUpperCase(), p.slice(eq + 1)];
    }),
  );
  const freq = parts.FREQ as RRule["freq"];
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return null;
  const rule: RRule = { freq, interval: Math.max(1, Number(parts.INTERVAL ?? 1) || 1) };
  if (parts.COUNT) rule.count = Number(parts.COUNT);
  if (parts.UNTIL) {
    const u = parseIcsDate(parts.UNTIL, {});
    if (u) rule.until = u.date;
  }
  if (freq === "WEEKLY" && parts.BYDAY) {
    const days = parts.BYDAY.split(",")
      .map((d) => DAY_NUM[d.slice(-2)])
      .filter((d) => d !== undefined);
    if (days.length) rule.byDay = days;
  }
  return rule;
}

function addByFreq(d: Date, freq: RRule["freq"], n: number): Date {
  const x = new Date(d);
  if (freq === "DAILY") x.setUTCDate(x.getUTCDate() + n);
  else if (freq === "WEEKLY") x.setUTCDate(x.getUTCDate() + 7 * n);
  else if (freq === "MONTHLY") x.setUTCMonth(x.getUTCMonth() + n);
  else x.setUTCFullYear(x.getUTCFullYear() + n);
  return x;
}

const MAX_OCCURRENCES = 500;

function expand(
  start: Date,
  rule: RRule,
  exdates: Set<number>,
  windowStart: Date,
  windowEnd: Date,
): Date[] {
  const out: Date[] = [];
  let produced = 0;

  if (rule.freq === "WEEKLY" && rule.byDay?.length) {
    // walk day by day from the start-of-week of DTSTART, gated by interval
    const weekAnchor = new Date(start);
    weekAnchor.setUTCDate(weekAnchor.getUTCDate() - weekAnchor.getUTCDay());
    for (let week = 0; produced < MAX_OCCURRENCES; week++) {
      if (week % rule.interval !== 0) {
        if (addByFreq(weekAnchor, "WEEKLY", week) > windowEnd) break;
        continue;
      }
      const base = addByFreq(weekAnchor, "WEEKLY", week);
      if (base > windowEnd && produced >= (rule.count ?? 0)) break;
      for (const day of rule.byDay) {
        const occ = new Date(base);
        occ.setUTCDate(occ.getUTCDate() + day);
        occ.setUTCHours(start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds());
        if (occ < start) continue;
        produced++;
        if (rule.count && produced > rule.count) return out;
        if (rule.until && occ > rule.until) return out;
        if (occ > windowEnd) return out;
        if (occ >= windowStart && !exdates.has(occ.getTime())) out.push(occ);
      }
    }
    return out;
  }

  for (let i = 0; produced < MAX_OCCURRENCES; i++) {
    const occ = addByFreq(start, rule.freq, i * rule.interval);
    produced++;
    if (rule.count && produced > rule.count) break;
    if (rule.until && occ > rule.until) break;
    if (occ > windowEnd) break;
    if (occ >= windowStart && !exdates.has(occ.getTime())) out.push(occ);
  }
  return out;
}

/* --------------------------------- events --------------------------------- */

function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

/** Parse an ICS document and expand occurrences inside [windowStart, windowEnd]. */
export function parseIcs(text: string, windowStart: Date, windowEnd: Date): IcsEvent[] {
  const lines = unfold(text);
  const out: IcsEvent[] = [];
  let cur: Prop[] | null = null;

  for (const line of lines) {
    if (/^BEGIN:VEVENT$/i.test(line)) {
      cur = [];
      continue;
    }
    if (/^END:VEVENT$/i.test(line)) {
      if (cur) {
        const ev = buildEvent(cur, windowStart, windowEnd);
        out.push(...ev);
      }
      cur = null;
      continue;
    }
    if (cur) {
      const p = parseLine(line);
      if (p) cur.push(p);
    }
  }
  out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return out;
}

function buildEvent(props: Prop[], windowStart: Date, windowEnd: Date): IcsEvent[] {
  const get = (name: string) => props.find((p) => p.name === name);
  const dtstart = get("DTSTART");
  const summary = get("SUMMARY");
  if (!dtstart) return [];
  const start = parseIcsDate(dtstart.value, dtstart.params);
  if (!start) return [];

  const dtend = get("DTEND");
  const end = dtend ? parseIcsDate(dtend.value, dtend.params) : null;
  const durationMs = end ? end.date.getTime() - start.date.getTime() : 0;

  const uid = get("UID")?.value ?? `${start.date.toISOString()}-${summary?.value ?? ""}`;
  const title = summary ? unescapeText(summary.value) : "(untitled)";
  const location = get("LOCATION") ? unescapeText(get("LOCATION")!.value) : undefined;

  const exdates = new Set<number>();
  for (const p of props.filter((x) => x.name === "EXDATE")) {
    for (const v of p.value.split(",")) {
      const d = parseIcsDate(v.trim(), p.params);
      if (d) exdates.add(d.date.getTime());
    }
  }

  const rruleProp = get("RRULE");
  const rule = rruleProp ? parseRRule(rruleProp.value) : null;

  const starts: Date[] = rule
    ? expand(start.date, rule, exdates, windowStart, windowEnd)
    : start.date >= windowStart && start.date <= windowEnd && !exdates.has(start.date.getTime())
      ? [start.date]
      : [];

  return starts.map((s, i) => ({
    uid: starts.length > 1 ? `${uid}#${i}` : uid,
    title,
    location,
    startsAt: s,
    endsAt: durationMs > 0 ? new Date(s.getTime() + durationMs) : undefined,
    allDay: start.allDay,
  }));
}
