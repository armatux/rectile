import { describe, expect, it } from "vitest";
import { parseReminderText } from "@/lib/nl";

// Thursday, 2026-07-23 14:30 local
const NOW = new Date(2026, 6, 23, 14, 30, 0);

describe("parseReminderText", () => {
  it("plain title parses to no deadline", () => {
    const p = parseReminderText("buy milk", NOW);
    expect(p).toEqual({ title: "buy milk" });
  });

  it("weekday + time", () => {
    const p = parseReminderText("pay rent friday 18:00", NOW);
    expect(p.title).toBe("pay rent");
    expect(p.dueAt).toEqual(new Date(2026, 6, 24, 18, 0, 0));
  });

  it("tomorrow defaults to 09:00", () => {
    const p = parseReminderText("call insurer tomorrow", NOW);
    expect(p.title).toBe("call insurer");
    expect(p.dueAt).toEqual(new Date(2026, 6, 24, 9, 0, 0));
  });

  it("bare time already passed rolls to next day", () => {
    const p = parseReminderText("standup 09:15", NOW);
    expect(p.dueAt).toEqual(new Date(2026, 6, 24, 9, 15, 0));
  });

  it("bare future time stays today", () => {
    const p = parseReminderText("gym 18:00", NOW);
    expect(p.dueAt).toEqual(new Date(2026, 6, 23, 18, 0, 0));
  });

  it("tonight = 20:00", () => {
    const p = parseReminderText("backup tonight", NOW);
    expect(p.dueAt).toEqual(new Date(2026, 6, 23, 20, 0, 0));
  });

  it("in N units", () => {
    const p = parseReminderText("tea in 10 min", NOW);
    expect(p.title).toBe("tea");
    expect(p.dueAt).toEqual(new Date(NOW.getTime() + 10 * 60_000));
  });

  it("german date DD.MM. + uhr", () => {
    const p = parseReminderText("tüv 15.9. 8 uhr", NOW);
    expect(p.title).toBe("tüv");
    expect(p.dueAt).toEqual(new Date(2026, 8, 15, 8, 0, 0));
  });

  it("past DD.MM. without year rolls to next year", () => {
    const p = parseReminderText("geburtstag 01.02.", NOW);
    expect(p.dueAt).toEqual(new Date(2027, 1, 1, 9, 0, 0));
  });

  it("every monday = weekly anchored next monday", () => {
    const p = parseReminderText("review notes every monday 10:00", NOW);
    expect(p.repeat).toBe("weekly");
    expect(p.dueAt).toEqual(new Date(2026, 6, 27, 10, 0, 0));
  });

  it("every month keeps today's date next occurrence", () => {
    const p = parseReminderText("pay rent every month 09:00", NOW);
    expect(p.repeat).toBe("monthly");
    // 09:00 today already passed → tomorrow
    expect(p.dueAt).toEqual(new Date(2026, 6, 24, 9, 0, 0));
  });

  it("daily german", () => {
    const p = parseReminderText("tabletten täglich 8 uhr", NOW);
    expect(p.repeat).toBe("daily");
    expect(p.title).toBe("tabletten");
  });

  it("#slug extraction with allowlist", () => {
    const p = parseReminderText("fix login bug #rectile tomorrow", NOW, ["rectile"]);
    expect(p.projectSlug).toBe("rectile");
    expect(p.title).toBe("fix login bug");
    const q = parseReminderText("call #unknown", NOW, ["rectile"]);
    expect(q.projectSlug).toBeUndefined();
  });

  it("does not eat version-like tokens", () => {
    const p = parseReminderText("release v1.2 next week", NOW);
    expect(p.title).toBe("release v1.2");
    expect(p.dueAt).toEqual(new Date(2026, 6, 30, 9, 0, 0));
  });

  it("iso date", () => {
    const p = parseReminderText("deadline 2026-08-01 12:00", NOW);
    expect(p.dueAt).toEqual(new Date(2026, 7, 1, 12, 0, 0));
  });
});
