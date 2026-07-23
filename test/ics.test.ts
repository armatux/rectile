import { describe, expect, it } from "vitest";
import { parseIcs } from "@/lib/ics";

const WIN_START = new Date("2026-07-01T00:00:00Z");
const WIN_END = new Date("2026-08-31T23:59:59Z");

function ics(body: string): string {
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`;
}

describe("parseIcs", () => {
  it("parses a plain UTC event", () => {
    const evs = parseIcs(
      ics(
        "BEGIN:VEVENT\r\nUID:a1\r\nSUMMARY:Zahnarzt\r\nDTSTART:20260728T090000Z\r\nDTEND:20260728T100000Z\r\nEND:VEVENT",
      ),
      WIN_START,
      WIN_END,
    );
    expect(evs).toHaveLength(1);
    expect(evs[0].title).toBe("Zahnarzt");
    expect(evs[0].startsAt.toISOString()).toBe("2026-07-28T09:00:00.000Z");
    expect(evs[0].endsAt?.toISOString()).toBe("2026-07-28T10:00:00.000Z");
    expect(evs[0].allDay).toBe(false);
  });

  it("converts TZID wall-clock times to UTC (CEST = UTC+2 in July)", () => {
    const evs = parseIcs(
      ics(
        "BEGIN:VEVENT\r\nUID:a2\r\nSUMMARY:Meeting\r\nDTSTART;TZID=Europe/Zurich:20260715T140000\r\nDTEND;TZID=Europe/Zurich:20260715T150000\r\nEND:VEVENT",
      ),
      WIN_START,
      WIN_END,
    );
    expect(evs[0].startsAt.toISOString()).toBe("2026-07-15T12:00:00.000Z");
  });

  it("handles all-day events and folded lines", () => {
    const evs = parseIcs(
      ics(
        "BEGIN:VEVENT\r\nUID:a3\r\nSUMMARY:Very long summary that is\r\n  folded across lines\r\nDTSTART;VALUE=DATE:20260720\r\nEND:VEVENT",
      ),
      WIN_START,
      WIN_END,
    );
    expect(evs[0].allDay).toBe(true);
    expect(evs[0].title).toBe("Very long summary that is folded across lines");
  });

  it("expands weekly RRULE with BYDAY and COUNT", () => {
    const evs = parseIcs(
      ics(
        "BEGIN:VEVENT\r\nUID:a4\r\nSUMMARY:Gym\r\nDTSTART:20260706T170000Z\r\nDTEND:20260706T180000Z\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,TH;COUNT=4\r\nEND:VEVENT",
      ),
      WIN_START,
      WIN_END,
    );
    expect(evs.map((e) => e.startsAt.toISOString())).toEqual([
      "2026-07-06T17:00:00.000Z", // Mon
      "2026-07-09T17:00:00.000Z", // Thu
      "2026-07-13T17:00:00.000Z", // Mon
      "2026-07-16T17:00:00.000Z", // Thu
    ]);
  });

  it("honors EXDATE and UNTIL on daily rules", () => {
    const evs = parseIcs(
      ics(
        "BEGIN:VEVENT\r\nUID:a5\r\nSUMMARY:Standup\r\nDTSTART:20260713T080000Z\r\nRRULE:FREQ=DAILY;UNTIL=20260716T080000Z\r\nEXDATE:20260714T080000Z\r\nEND:VEVENT",
      ),
      WIN_START,
      WIN_END,
    );
    expect(evs.map((e) => e.startsAt.getUTCDate())).toEqual([13, 15, 16]);
  });
});
