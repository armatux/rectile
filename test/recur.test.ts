import { describe, expect, it } from "vitest";
import { nextOccurrence } from "@/lib/recur";

const d = (s: string) => new Date(s);

describe("nextOccurrence", () => {
  it("daily advances one day past 'after'", () => {
    expect(
      nextOccurrence(d("2026-07-20T09:00:00Z"), "daily", d("2026-07-23T10:00:00Z")),
    ).toEqual(d("2026-07-24T09:00:00Z"));
  });

  it("weekly keeps the weekday", () => {
    // Mon 2026-07-20 → next Monday after Thu 2026-07-23
    expect(
      nextOccurrence(d("2026-07-20T18:00:00Z"), "weekly", d("2026-07-23T00:00:00Z")),
    ).toEqual(d("2026-07-27T18:00:00Z"));
  });

  it("weekly steps forward when 'after' is far ahead", () => {
    expect(
      nextOccurrence(d("2026-07-20T18:00:00Z"), "weekly", d("2026-08-10T18:00:00Z")),
    ).toEqual(d("2026-08-17T18:00:00Z"));
  });

  it("monthly clamps to short months and recovers", () => {
    expect(
      nextOccurrence(d("2026-01-31T08:00:00Z"), "monthly", d("2026-01-31T09:00:00Z")),
    ).toEqual(d("2026-02-28T08:00:00Z"));
    expect(
      nextOccurrence(d("2026-01-31T08:00:00Z"), "monthly", d("2026-02-28T09:00:00Z")),
    ).toEqual(d("2026-03-31T08:00:00Z"));
  });

  it("yearly handles Feb 29", () => {
    expect(
      nextOccurrence(d("2028-02-29T12:00:00Z"), "yearly", d("2028-03-01T00:00:00Z")),
    ).toEqual(d("2029-02-28T12:00:00Z"));
  });

  it("is strictly after both anchors", () => {
    const from = d("2026-07-23T09:00:00Z");
    const next = nextOccurrence(from, "daily", d("2026-07-01T00:00:00Z"));
    expect(next.getTime()).toBeGreaterThan(from.getTime());
  });
});
