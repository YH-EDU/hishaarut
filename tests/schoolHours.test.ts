import { describe, expect, it } from "vitest";
import { DEFAULT_PARENT_TEMPLATE } from "../src/api/types";
import { addClock, closedMarkingMessage, defaultReleaseIso, releaseClockAllowed, withinSchoolHours } from "../src/lib/dates";
import { applyParentTemplate } from "../src/lib/messages";

describe("school hours", () => {
  const during = new Date("2026-11-02T08:00:00+02:00");
  const after = new Date("2026-11-02T18:00:00+02:00");

  it("allows a mark only from the start until the bell", () => {
    expect(withinSchoolHours("07:00", "16:00", during)).toBe(true);
    expect(withinSchoolHours("07:00", "16:00", after)).toBe(false);
    expect(withinSchoolHours("07:00", "16:00", new Date("2026-11-02T07:00:00+02:00"))).toBe(true);
    expect(withinSchoolHours("07:00", "16:00", new Date("2026-11-02T16:00:00+02:00"))).toBe(false);
    expect(withinSchoolHours(null, null, during)).toBe(false);
  });

  it("caps the release three hours after the bell", () => {
    const release = defaultReleaseIso(240, "14:00", during);
    expect(release && new Date(release).toISOString()).toBe(new Date("2026-11-02T17:00:00+02:00").toISOString());
    expect(addClock("22:30", 180)).toBe("23:59");
    expect(releaseClockAllowed("17:00", "14:00")).toBe(true);
    expect(releaseClockAllowed("13:30", "14:00")).toBe(false);
    expect(releaseClockAllowed("18:00", "14:00")).toBe(false);
  });

  it("states the open hours", () => {
    expect(closedMarkingMessage("07:00", "16:00")).toBe("סימון השארות פתוח בימי לימודים בין 07:00 ל-16:00");
  });
});

describe("parent template", () => {
  const base = { parentName: null, studentName: "יוסף לוי", className: "ז׳1", releaseTime: "16:30" };
  it("turns preset reasons into a sentence and signs with the teacher", () => {
    expect(applyParentTemplate(DEFAULT_PARENT_TEMPLATE, { ...base, reason: "היעדרות משיעור", teacherName: "הרב כהן" })).toBe(
      "שלום,\nהריני לעדכן שיוסף לוי נעדר משיעור, ולכן יישאר היום בסוף היום עד השעה 16:30.\nתודה, הרב כהן",
    );
  });
  it("uses בשל for free text and drops a missing signature", () => {
    expect(applyParentTemplate(DEFAULT_PARENT_TEMPLATE, { ...base, reason: "שימוש בטלפון", teacherName: " " })).toBe(
      "שלום,\nהריני לעדכן שיוסף לוי יישאר היום בסוף היום בשל שימוש בטלפון עד השעה 16:30.\nתודה.",
    );
  });
  it("handles a missing reason", () => {
    expect(applyParentTemplate(DEFAULT_PARENT_TEMPLATE, { ...base, reason: "" })).toBe(
      "שלום,\nהריני לעדכן שיוסף לוי יישאר היום בסוף היום עד השעה 16:30.\nתודה.",
    );
  });
  it("keeps older named templates working", () => {
    expect(applyParentTemplate("שלום {parent_name}, {student_name}", { ...base, parentName: "", studentName: "א", reason: "" })).toBe("שלום, א");
  });
});
