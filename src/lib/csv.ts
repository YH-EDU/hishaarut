import type { Gender } from "../api/types";

export interface ImportDraft {
  line: number;
  firstName: string;
  lastName: string;
  className: string;
  gender: Gender | null;
  parentName: string;
  parentPhone: string;
  error?: string;
}

const HEADER_ALIASES: Record<string, keyof Omit<ImportDraft, "line" | "error" | "gender"> | "gender"> = {
  "שם פרטי": "firstName",
  "שם משפחה": "lastName",
  כיתה: "className",
  מגדר: "gender",
  "שם הורה": "parentName",
  "טלפון הורה": "parentPhone",
  first_name: "firstName",
  last_name: "lastName",
  firstname: "firstName",
  lastname: "lastName",
  class: "className",
  class_name: "className",
  gender: "gender",
  parent_name: "parentName",
  parent_phone: "parentPhone",
  phone: "parentPhone",
};

export function classKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['׳’‘״"]/g, "")
    .replace(/[-–—־]/g, "")
    .replace(/\s+/g, "");
}

/** Display form used in the database, for example ז׳1. */
export function classRank(name: string): string {
  const key = classKey(name);
  const match = key.match(/^(יב|יא|[א-ת])(\d*)$/);
  if (!match) return `ת${key}`;
  const grade = match[1] === "יא" ? "כ" : match[1] === "יב" ? "ככ" : match[1];
  return `${grade}${(match[2] ?? "").padStart(2, "0")}`;
}

export function displayClassName(name: string): string {
  const key = classKey(name);
  const match = key.match(/^(יב|יא|[א-ת])(\d{0,2})$/);
  if (!match) return name.trim();
  const [, letters, number] = match;
  return number ? `${letters}\u05F3${number}` : letters;
}

export function parseGender(value: string): Gender | null {
  const v = value.trim().toLowerCase();
  if (["ז", "זכר", "בן", "male", "m", "boy"].includes(v)) return "male";
  if (["נ", "נקבה", "בת", "female", "f", "girl"].includes(v)) return "female";
  return null;
}

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => value.length > 0));
}

export function draftsFromMatrix(matrix: string[][]): ImportDraft[] {
  if (matrix.length === 0) return [];
  const header = matrix[0].map((cell) => cell.trim().replace(/^\uFEFF/, ""));
  const columns = header.map((cell) => HEADER_ALIASES[cell] ?? HEADER_ALIASES[cell.toLowerCase()]);
  if (!columns.includes("firstName") || !columns.includes("lastName")) {
    return [
      {
        line: 1,
        firstName: "",
        lastName: "",
        className: "",
        gender: null,
        parentName: "",
        parentPhone: "",
        error: "חסרות עמודות שם פרטי ושם משפחה",
      },
    ];
  }

  const seen = new Set<string>();
  const drafts: ImportDraft[] = [];
  matrix.slice(1).forEach((cells, index) => {
    const record: Record<string, string> = {};
    columns.forEach((key, column) => {
      if (key) record[key] = cells[column] ?? "";
    });
    const draft: ImportDraft = {
      line: index + 2,
      firstName: (record.firstName ?? "").trim(),
      lastName: (record.lastName ?? "").trim(),
      className: (record.className ?? "").trim(),
      gender: parseGender(record.gender ?? ""),
      parentName: (record.parentName ?? "").trim(),
      parentPhone: (record.parentPhone ?? "").trim(),
    };
    if (!draft.firstName || !draft.lastName) {
      draft.error = "חסר שם";
    } else {
      const key = `${classKey(draft.className)}|${draft.firstName}|${draft.lastName}`;
      if (seen.has(key)) draft.error = "שורה כפולה בקובץ";
      seen.add(key);
    }
    drafts.push(draft);
  });
  return drafts;
}

export async function readSpreadsheet(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type.includes("csv") || file.type.startsWith("text/")) {
    return parseCsv(await file.text());
  }
  const xlsx = await import("xlsx");
  const book = xlsx.read(await file.arrayBuffer(), { type: "array" });
  const sheet = book.Sheets[book.SheetNames[0]];
  const matrix = xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
  }) as unknown[][];
  return matrix.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "").trim()) : []));
}
