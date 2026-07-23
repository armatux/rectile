/**
 * Recurrence for reminders. The pattern is just the cadence — the anchor
 * (weekday / day-of-month / date) lives in dueAt itself, so advancing is
 * plain date math and never disagrees with what the user scheduled.
 */

export const REPEATS = ["daily", "weekly", "monthly", "yearly"] as const;
export type Repeat = (typeof REPEATS)[number];

export function isRepeat(v: unknown): v is Repeat {
  return typeof v === "string" && (REPEATS as readonly string[]).includes(v);
}

export function repeatLabel(repeat: string): string {
  return `↻ ${repeat.toUpperCase()}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * First occurrence after BOTH `from` and `after`, preserving `from`'s
 * time-of-day (and day-of-month for monthly/yearly, clamped to month length).
 */
export function nextOccurrence(from: Date, repeat: Repeat, after: Date): Date {
  const d = new Date(from);
  const later = after > from ? after : from;
  switch (repeat) {
    case "daily":
      do d.setUTCDate(d.getUTCDate() + 1);
      while (d <= later);
      return d;
    case "weekly":
      do d.setUTCDate(d.getUTCDate() + 7);
      while (d <= later);
      return d;
    case "monthly": {
      const dom = from.getUTCDate();
      let y = from.getUTCFullYear();
      let m = from.getUTCMonth();
      do {
        m++;
        if (m > 11) {
          m = 0;
          y++;
        }
        d.setUTCFullYear(y, m, 1);
        d.setUTCDate(Math.min(dom, daysInMonth(y, m)));
      } while (d <= later);
      return d;
    }
    case "yearly": {
      const dom = from.getUTCDate();
      const mon = from.getUTCMonth();
      let y = from.getUTCFullYear();
      do {
        y++;
        d.setUTCFullYear(y, mon, 1);
        d.setUTCDate(Math.min(dom, daysInMonth(y, mon)));
      } while (d <= later);
      return d;
    }
  }
}
