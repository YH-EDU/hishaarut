import { describe, expect, it } from "vitest";
import { classKey, displayClassName, draftsFromMatrix, parseCsv, parseGender } from "../src/lib/csv";
import { reportToCsv } from "../src/lib/exportReport";

describe("csv import", () => {
  it("reads the Hebrew template, including quoted commas", () => {
    const matrix = parseCsv("\uFEFFשם פרטי,שם משפחה,כיתה,מגדר,שם הורה,טלפון הורה\nנועה,ברק,ז'1,נ,\"ברק, מיכל\",050-7000001\n");
    const [draft] = draftsFromMatrix(matrix);
    expect(draft.firstName).toBe("נועה");
    expect(draft.lastName).toBe("ברק");
    expect(draft.gender).toBe("female");
    expect(draft.parentName).toBe("ברק, מיכל");
    expect(classKey(draft.className)).toBe(classKey("ז׳1"));
    expect(classKey("ז' - 1")).toBe(classKey("ז׳1"));
    expect(displayClassName("ז' - 1")).toBe("ז׳1");
  });

  it("flags a duplicate row and a missing header", () => {
    const drafts = draftsFromMatrix([
      ["first_name", "last_name", "class"],
      ["יוסי", "לוי", "ח1"],
      ["יוסי", "לוי", "ח1"],
    ]);
    expect(drafts[1].error).toBe("שורה כפולה בקובץ");
    expect(draftsFromMatrix([["כיתה"], ["ז1"]])[0].error).toContain("חסרות עמודות");
  });

  it("parses gender words", () => {
    expect(parseGender("זכר")).toBe("male");
    expect(parseGender("בת")).toBe("female");
    expect(parseGender("")).toBeNull();
  });
});

describe("report csv", () => {
  it("starts with a BOM and Hebrew headers", () => {
    const csv = reportToCsv([
      {
        date: "2026-11-01",
        student: "נועה ברק",
        className: "ז׳1",
        reason: "הפרעה בשיעור",
        minutes: 30,
        status: "ממתין",
        marker: "רונית",
        signer: "",
      },
    ]);
    expect(csv.startsWith("\uFEFFתאריך,תלמיד,כיתה")).toBe(true);
    expect(csv).toContain("נועה ברק");
  });
});
