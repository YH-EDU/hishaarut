import { describe, expect, it } from "vitest";
import { renderDetentionMessage } from "../src/lib/messages";

describe("renderDetentionMessage", () => {
  it("matches the parent marked message stored by the database", () => {
    expect(
      renderDetentionMessage({
        event: "marked",
        audience: "parent",
        gender: "female",
        studentName: "נועה ברק",
        className: "ז׳1",
        reason: "הפרעה בשיעור",
        minutes: 30,
        school: "בית הספר",
        markerName: "רונית מורה",
      }),
    ).toBe("שלום, הודעה מבית הספר:\nנועה ברק נשארה היום אחרי שעות הלימודים.\nסיבה: הפרעה בשיעור\nמשך: 30 דקות.");
  });

  it("matches the completion message and adds the class for the homeroom", () => {
    expect(
      renderDetentionMessage({
        event: "completed",
        audience: "parent",
        gender: "female",
        studentName: "מאיה אברהם",
        className: "ז׳1",
        reason: "איחור לשיעור",
        minutes: 15,
        school: "בית הספר",
        markerName: "רונית מורה",
      }),
    ).toBe("שלום, הודעה מבית הספר:\nמאיה אברהם סיימה את ההשארות והיא בדרכה הביתה.");

    expect(
      renderDetentionMessage({
        event: "marked",
        audience: "homeroom",
        gender: "male",
        studentName: "איתי חדד",
        className: "ז׳1",
        reason: "חיסור בתפילה",
        minutes: 20,
        school: "בית הספר",
        markerName: "רונית מורה",
      }),
    ).toContain("איתי חדד מכיתה ז׳1 נשאר");
    expect(
      renderDetentionMessage({
        event: "marked",
        audience: "homeroom",
        gender: "male",
        studentName: "איתי חדד",
        className: "ז׳1",
        reason: "חיסור בתפילה",
        minutes: 20,
        school: "בית הספר",
        markerName: "רונית מורה",
      }),
    ).toContain("סומן על ידי: רונית מורה.");
  });
});
