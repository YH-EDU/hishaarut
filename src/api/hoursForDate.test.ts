import { describe, expect, it } from "vitest";
import { DEFAULT_WEEK, hoursForDate } from "./types";

describe("hoursForDate", () => {
  const base = { schedule: DEFAULT_WEEK, closures: ["2026-11-10"], specialDays: [{ date: "2026-11-11", start: null, end: "12:30" }] };
  it("uses the weekly hours by default", () => {
    expect(hoursForDate(base, "2026-11-08", 0)?.end).toBe(DEFAULT_WEEK.sun.end);
  });
  it("returns null on a no-school date", () => {
    expect(hoursForDate(base, "2026-11-10", 2)).toBeNull();
  });
  it("a special day overrides the end time", () => {
    expect(hoursForDate(base, "2026-11-11", 3)).toEqual({ start: DEFAULT_WEEK.wed.start, end: "12:30" });
  });
});
