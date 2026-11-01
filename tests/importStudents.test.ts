import { describe, expect, it } from "vitest";
import { toE164 } from "../src/lib/phone";
import { buildPreview, decodeHebrewCsv, detectColumns, splitFullName } from "../src/lib/importStudents";

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
    expect(row.nationalId).toBe("123456782");
    expect(row.issues.some((issue) => issue.code === "new_class")).toBe(false);
  });

  it("splits a full-name column and flags a duplicate and a bad phone", () => {
    const matrix = [
      ["שם התלמיד", "כיתה", "טלפון הורה"],
      ["נועה ברק", "ז׳1", "050-7000001"],
      ["נועה ברק", "ז׳1", "050-7000001"],
      ["איתי חדד", "ז׳1", "123"],
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
  });
});
