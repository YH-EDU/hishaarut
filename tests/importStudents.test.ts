import { describe, expect, it } from "vitest";
import { classKey, displayClassName } from "../src/lib/csv";
import { toE164 } from "../src/lib/phone";
import { buildPreview, decodeHebrewCsv, detectColumns, gridsFromBytes, splitFullName } from "../src/lib/importStudents";

describe("toE164", () => {
  it("accepts local, plus, and dashed Israeli mobiles", () => {
    expect(toE164("052-123-4567")).toBe("+972521234567");
    expect(toE164("+972 52 123 4567")).toBe("+972521234567");
    expect(toE164("972521234567")).toBe("+972521234567");
    expect(toE164("לא מספר")).toBeNull();
  });
});

describe("smart import", () => {
  it("maps a Mashov-style Hebrew header", () => {
    const matrix = [
      ["שם משפחה", "שם פרטי", "כיתה", "ת.ז.", "שם האב", "נייד האב", "שם האם", "נייד האם"],
      ["לוי", "יוסי", "ז'1", "123456782", "דוד לוי", "052-1111111", "רחל לוי", "054-2222222"],
    ];
    const detected = detectColumns(matrix);
    expect(detected.hasHeader).toBe(true);
    expect(detected.mappings.find((column) => column.header === "שם פרטי")?.field).toBe("firstName");
    expect(detected.mappings.find((column) => column.header === "נייד האב")?.field).toBe("parent1Phone");
    expect(detected.mappings.find((column) => column.header === "נייד האם")?.field).toBe("parent2Phone");
    const [row] = buildPreview(matrix, detected.mappings, true, []);
    expect(row.firstName).toBe("יוסי");
    expect(row.lastName).toBe("לוי");
    expect(row.parent1E164).toBe("+972521111111");
    expect(row.parent2E164).toBe("+972542222222");
    expect(detected.mappings.find((column) => column.header === "ת.ז.")?.field).toBe("ignore");
    expect(row.issues.some((issue) => issue.code === "new_class")).toBe(false);
  });

  it("splits a Mashov full name as family name first and flags a duplicate and a bad phone", () => {
    const matrix = [
      ["שם התלמיד", "כיתה", "טלפון הורה"],
      ["ברק נועה", "ז׳1", "050-7000001"],
      ["ברק נועה", "ז׳1", "050-7000001"],
      ["חדד איתי", "ז׳1", "123"],
    ];
    const detected = detectColumns(matrix);
    const rows = buildPreview(matrix, detected.mappings, true, [
      { firstName: "נועה", lastName: "ברק", className: "ז׳1" },
    ]);
    expect(rows[0].firstName).toBe("נועה");
    expect(rows[0].lastName).toBe("ברק");
    expect(rows[0].issues.some((issue) => issue.code === "duplicate_existing")).toBe(true);
    expect(rows[1].issues.some((issue) => issue.code === "duplicate_file")).toBe(true);
    expect(rows[2].issues.some((issue) => issue.code === "invalid_phone")).toBe(true);
  });

  it("reads Windows-1255 Hebrew when UTF-8 is not the encoding", () => {
    const text = "שם פרטי,שם משפחה\nיוסי,לוי\n";
    const map = new Map<string, number>();
    for (let i = 0; i < 256; i += 1) {
      map.set(new TextDecoder("windows-1255").decode(Uint8Array.of(i)), i);
    }
    const bytes = Uint8Array.from([...text].map((char) => map.get(char) ?? 0x3f));
    expect(decodeHebrewCsv(bytes)).toContain("יוסי");
    expect(splitFullName("לוי יוסי", "last-first")).toEqual({ lastName: "לוי", firstName: "יוסי" });
    expect(splitFullName("בן חמו אליה יוסף", "last-first")).toEqual({ lastName: "בן חמו", firstName: "אליה יוסף" });
  });

  it("reads a small Mashov workbook: class, family-name-first, and both parent numbers", async () => {
    const xlsx = await import("xlsx");
    const matrix = [
      ["מס'", "שם תלמיד", "כיתת אם", "ת.ז. תלמיד", "ת.לידה", "רחוב", "מס' בית", "תאור ישוב", "שם האב ", "נייד אב ", "שם האם ", "נייד אם "],
      ["1", "בן חמו אליה יוסף", "ז' - 1", "222893620", "10/01/2014", "הרכס", "22", "ירושלים", "עמרם", "050-2612526 ,053-5286346", "עידית", "053-5286346 ,050-2612526"],
      ["2", "מן עקיבא", "ז' - 1", "221995210", "11/02/2014", "מצפה", "", "מצפה", "מיכאל", "", "דינה", "052-7284183"],
      ["3", "אברהם נתאי", "ח' - 4", "338917818", "19/01/2014", "הרכס", "16", "מעלה אדומים", "אופיר", "050-5066179", "שר", "050-5949525"],
    ];
    const book = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(book, xlsx.utils.aoa_to_sheet(matrix), "גיליון1");
    const bytes = new Uint8Array(xlsx.write(book, { type: "array", bookType: "xlsx" }));
    const [grid] = await gridsFromBytes(bytes, "mashov-sample.xlsx");
    const detected = detectColumns(grid.rows);
    expect(detected.mappings.find((column) => column.header.startsWith("כיתת אם"))?.field).toBe("className");
    expect(detected.mappings.find((column) => column.header.startsWith("מס'"))?.field).toBe("ignore");
    expect(detected.mappings.find((column) => column.header.includes("ת.ז"))?.field).toBe("ignore");
    expect(detected.mappings.find((column) => column.header.includes("לידה"))?.field).toBe("ignore");
    const rows = buildPreview(grid.rows, detected.mappings, true, [{ firstName: "נתאי", lastName: "אברהם", className: "ז׳1" }]);
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.issues.some((issue) => issue.code === "missing_name"))).toHaveLength(0);
    expect(rows.every((row) => classKey(row.className) === classKey(displayClassName(row.className)))).toBe(true);
    const ben = rows.find((row) => row.lastName === "בן חמו");
    expect(ben?.firstName).toBe("אליה יוסף");
    expect(ben?.className).toBe("ז׳1");
    expect(ben?.parent1E164).toBe("+972502612526");
    expect(ben?.parent1E164b).toBe("+972535286346");
    const man = rows.find((row) => row.lastName === "מן");
    expect(man?.firstName).toBe("עקיבא");
    expect(man?.parent1E164).toBeNull();
    expect(man?.parent2E164).toBe("+972527284183");
    expect(man?.issues.some((issue) => issue.code === "invalid_phone" || issue.code === "missing_phone")).toBe(false);
  });
});

