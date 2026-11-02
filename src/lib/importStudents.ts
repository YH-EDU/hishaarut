import type { Gender } from "../api/types";
import { classKey, displayClassName, parseCsv, parseGender } from "./csv";
import { splitPhoneNumbers } from "./phone";

export type ImportField =
  | "ignore"
  | "fullName"
  | "firstName"
  | "lastName"
  | "className"
  | "gender"
  | "parent1Name"
  | "parent1Phone"
  | "parent2Name"
  | "parent2Phone";

export type NameOrder = "first-last" | "last-first";

export const IMPORT_FIELD_LABEL: Record<ImportField, string> = {
  ignore: "לא לייבא",
  fullName: "שם מלא",
  firstName: "שם פרטי",
  lastName: "שם משפחה",
  className: "כיתה",
  gender: "מגדר",
  parent1Name: "שם האב",
  parent1Phone: "טלפון האב",
  parent2Name: "שם האם",
  parent2Phone: "טלפון האם",
};

export interface SheetGrid {
  name: string;
  rows: string[][];
}

export interface ColumnMapping {
  index: number;
  header: string;
  field: ImportField;
  samples: string[];
}

export interface ImportIssue {
  code: "missing_name" | "missing_phone" | "invalid_phone" | "duplicate_file" | "duplicate_existing" | "new_class";
  message: string;
}

export interface ImportPreviewRow {
  line: number;
  firstName: string;
  lastName: string;
  className: string;
  gender: Gender | null;
  parent1Name: string;
  parent1Phone: string;
  parent1E164: string | null;
  parent1E164b: string | null;
  parent2Name: string;
  parent2Phone: string;
  parent2E164: string | null;
  parent2E164b: string | null;
  issues: ImportIssue[];
}

const HEADER_FIELDS: Array<[string, ImportField]> = [
  ["שם משפחה ושם פרטי", "fullName"],
  ["שם פרטי ושם משפחה", "fullName"],
  ["שם התלמיד", "fullName"],
  ["שם תלמיד", "fullName"],
  ["שם מלא", "fullName"],
  ["student name", "fullName"],
  ["full name", "fullName"],
  ["fullname", "fullName"],
  ["שם פרטי", "firstName"],
  ["first name", "firstName"],
  ["firstname", "firstName"],
  ["given name", "firstName"],
  ["שם משפחה", "lastName"],
  ["last name", "lastName"],
  ["lastname", "lastName"],
  ["surname", "lastName"],
  ["family name", "lastName"],
  ["כיתה", "className"],
  ["כתה", "className"],
  ["כיתת אם", "className"],
  ["כיתה אם", "className"],
  ["כיתת אב", "className"],
  ["class name", "className"],
  ["classname", "className"],
  ["class", "className"],
  ["מגדר", "gender"],
  ["מין", "gender"],
  ["gender", "gender"],
  ["sex", "gender"],
  ["שם הורה 1", "parent1Name"],
  ["שם הורה1", "parent1Name"],
  ["הורה 1", "parent1Name"],
  ["שם האב", "parent1Name"],
  ["שם אב", "parent1Name"],
  ["שם הורה", "parent1Name"],
  ["parent name", "parent1Name"],
  ["parent1 name", "parent1Name"],
  ["שם הורה 2", "parent2Name"],
  ["שם הורה2", "parent2Name"],
  ["הורה 2", "parent2Name"],
  ["שם האם", "parent2Name"],
  ["שם אם", "parent2Name"],
  ["parent2 name", "parent2Name"],
  ["נייד האב", "parent1Phone"],
  ["טלפון האב", "parent1Phone"],
  ["טלפון אב", "parent1Phone"],
  ["נייד אב", "parent1Phone"],
  ["טלפון הורה 1", "parent1Phone"],
  ["טלפון הורה1", "parent1Phone"],
  ["נייד הורה", "parent1Phone"],
  ["טלפון הורה", "parent1Phone"],
  ["טלפון נייד", "parent1Phone"],
  ["parent phone", "parent1Phone"],
  ["parent1 phone", "parent1Phone"],
  ["mobile", "parent1Phone"],
  ["phone", "parent1Phone"],
  ["נייד האם", "parent2Phone"],
  ["טלפון האם", "parent2Phone"],
  ["טלפון אם", "parent2Phone"],
  ["נייד אם", "parent2Phone"],
  ["טלפון הורה 2", "parent2Phone"],
  ["טלפון הורה2", "parent2Phone"],
  ["parent2 phone", "parent2Phone"],
];

const IGNORED_HEADERS = new Set([
  "מס",
  "מספר",
  "ת לידה",
  "תאריך לידה",
  "רחוב",
  "מס בית",
  "מספר בית",
  "תאור ישוב",
  "ישוב",
  "יישוב",
  "עיר",
  "ת ז",
  "תז",
  "ת ז תלמיד",
  "תז תלמיד",
  "תעודת זהות",
  "מספר זהות",
  "זהות",
  "national id",
  "student id",
  "zehut",
]);

export function normHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/["״']/g, "")
    .replace(/[._:/\\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function headerField(value: string): ImportField | null {
  const key = normHeader(value);
  if (!key || IGNORED_HEADERS.has(key)) return null;
  if (key === "תלמיד") return "fullName";
  const found = HEADER_FIELDS.find(([alias]) => alias === key);
  return found ? found[1] : null;
}

function hebrewCount(value: string): number {
  return value.match(/[\u0590-\u05FF]/g)?.length ?? 0;
}

export function decodeHebrewCsv(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^\uFEFF/, "");
  let windows = "";
  try {
    windows = new TextDecoder("windows-1255").decode(bytes);
  } catch {
    windows = "";
  }
  if (!windows) return utf8;
  if (utf8.includes("\uFFFD") && hebrewCount(windows) >= hebrewCount(utf8)) return windows;
  if (hebrewCount(windows) > hebrewCount(utf8) + 1) return windows;
  return utf8;
}

function nonEmpty(rows: string[][], index: number): string[] {
  return rows.map((row) => (row[index] ?? "").trim()).filter(Boolean).slice(0, 40);
}

function ratio(values: string[], test: (value: string) => boolean): number {
  if (values.length === 0) return 0;
  return values.filter(test).length / values.length;
}

function looksLikeClass(value: string): boolean {
  const key = classKey(value);
  return /^(יא|יב|[א-ת])\d{0,2}$/.test(key) || /^[a-z]\d{0,2}$/.test(key);
}

function contentField(values: string[]): ImportField | null {
  if (ratio(values, (value) => splitPhoneNumbers(value).length > 0) >= 0.6) return "parent1Phone";
  if (ratio(values, looksLikeClass) >= 0.6) return "className";
  if (ratio(values, (value) => value.split(/\s+/).length >= 2 && /[\u0590-\u05FF]/.test(value) && !/\d/.test(value)) >= 0.6) {
    return "fullName";
  }
  return null;
}

export function detectColumns(matrix: string[][]): { hasHeader: boolean; mappings: ColumnMapping[] } {
  const width = matrix.reduce((max, row) => Math.max(max, row.length), 0);
  const first = matrix[0] ?? [];
  const headerHits = first.filter((cell) => headerField(cell)).length;
  const hasHeader = headerHits >= 2 || (headerHits >= 1 && first.some((cell) => /שם|כיתה|תלמיד|class|name/i.test(cell)));
  const body = hasHeader ? matrix.slice(1) : matrix;
  const used = new Set<ImportField>();
  const mappings: ColumnMapping[] = [];

  for (let index = 0; index < width; index += 1) {
    const header = hasHeader ? (first[index] ?? "").trim() : `עמודה ${index + 1}`;
    const samples = nonEmpty(body, index).slice(0, 3);
    const ignored = hasHeader && IGNORED_HEADERS.has(normHeader(header));
    const fromHeader = hasHeader && !ignored ? headerField(header) : null;
    let field: ImportField = ignored ? "ignore" : (fromHeader ?? contentField(nonEmpty(body, index)) ?? "ignore");
    if (field !== "ignore" && used.has(field)) {
      if (field === "parent1Phone") field = used.has("parent2Phone") ? "ignore" : "parent2Phone";
      else if (field === "parent1Name") field = used.has("parent2Name") ? "ignore" : "parent2Name";
      else field = "ignore";
    }
    if (field !== "ignore") used.add(field);
    mappings.push({ index, header: header || `עמודה ${index + 1}`, field, samples });
  }
  return { hasHeader, mappings };
}

function cell(row: string[], mappings: ColumnMapping[], field: ImportField): string {
  const mapping = mappings.find((item) => item.field === field);
  if (!mapping) return "";
  return (row[mapping.index] ?? "").trim();
}

const LAST_NAME_PREFIXES = new Set(["בן", "בר", "אבו", "אבן", "דה", "ואן", "אל"]);

export function detectedNameOrder(mappings: ColumnMapping[]): NameOrder {
  const header = normHeader(mappings.find((item) => item.field === "fullName")?.header ?? "");
  if (header === "שם תלמיד" || header === "שם התלמיד") return "last-first";
  const family = header.indexOf("משפחה");
  const given = header.indexOf("פרטי");
  if (family >= 0 && (given < 0 || family < given)) return "last-first";
  return "first-last";
}

export function splitFullName(value: string, order: NameOrder): { firstName: string; lastName: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) {
    return order === "last-first" ? { firstName: "", lastName: parts[0] } : { firstName: parts[0], lastName: "" };
  }
  if (order === "last-first") {
    const lastCount = LAST_NAME_PREFIXES.has(parts[0]) && parts.length > 2 ? 2 : 1;
    return { lastName: parts.slice(0, lastCount).join(" "), firstName: parts.slice(lastCount).join(" ") };
  }
  const prefixAt = parts.findIndex((part, index) => index > 0 && LAST_NAME_PREFIXES.has(part) && index < parts.length - 1);
  if (prefixAt > 0) {
    return { firstName: parts.slice(0, prefixAt).join(" "), lastName: parts.slice(prefixAt).join(" ") };
  }
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

export function buildPreview(
  matrix: string[][],
  mappings: ColumnMapping[],
  hasHeader: boolean,
  existing: Array<{ firstName: string; lastName: string; className: string }>,
  order: NameOrder = detectedNameOrder(mappings),
): ImportPreviewRow[] {
  const body = hasHeader ? matrix.slice(1) : matrix;
  const seenNames = new Set<string>();
  const existingNames = new Set(existing.map((item) => `${classKey(item.className)}|${item.firstName}|${item.lastName}`));

  return body
    .map((row, index) => {
      const full = cell(row, mappings, "fullName");
      const split = splitFullName(full, order);
      const firstName = cell(row, mappings, "firstName") || split.firstName;
      const lastName = cell(row, mappings, "lastName") || split.lastName;
      const rawClass = cell(row, mappings, "className");
      const className = rawClass ? displayClassName(rawClass) : "";
      const parent1Raw = cell(row, mappings, "parent1Phone");
      const parent2Raw = cell(row, mappings, "parent2Phone");
      const parent1Numbers = splitPhoneNumbers(parent1Raw);
      const parent2Numbers = splitPhoneNumbers(parent2Raw);
      const preview: ImportPreviewRow = {
        line: (hasHeader ? 2 : 1) + index,
        firstName,
        lastName,
        className,
        gender: parseGender(cell(row, mappings, "gender")),
        parent1Name: cell(row, mappings, "parent1Name"),
        parent1Phone: parent1Raw,
        parent1E164: parent1Numbers[0] ?? null,
        parent1E164b: parent1Numbers[1] ?? null,
        parent2Name: cell(row, mappings, "parent2Name"),
        parent2Phone: parent2Raw,
        parent2E164: parent2Numbers[0] ?? null,
        parent2E164b: parent2Numbers[1] ?? null,
        issues: [],
      };
      if (!firstName || !lastName) preview.issues.push({ code: "missing_name", message: "חסר שם פרטי או שם משפחה" });
      const anyNumber = parent1Numbers.length + parent2Numbers.length > 0;
      if (!anyNumber) {
        if (parent1Raw || parent2Raw) preview.issues.push({ code: "invalid_phone", message: "טלפון לא תקין" });
        else preview.issues.push({ code: "missing_phone", message: "חסר טלפון הורה" });
      }
      const nameKey = `${classKey(className)}|${firstName}|${lastName}`;
      if (firstName && lastName && seenNames.has(nameKey)) {
        preview.issues.push({ code: "duplicate_file", message: "כפילות בקובץ" });
      }
      if (firstName && lastName) seenNames.add(nameKey);
      if (firstName && lastName && existingNames.has(nameKey)) {
        preview.issues.push({ code: "duplicate_existing", message: "כבר קיים ויעודכן" });
      }
      return preview;
    })
    .filter((row) => row.firstName || row.lastName || row.className || row.parent1Phone || row.parent2Phone);
}

export function unknownClasses(rows: ImportPreviewRow[], classNames: string[]): string[] {
  const known = new Set(classNames.map(classKey));
  const missing = new Set<string>();
  rows.forEach((row) => {
    if (row.className && !known.has(classKey(row.className))) missing.add(row.className.trim());
  });
  return [...missing];
}

export async function gridsFromBytes(bytes: Uint8Array, filename: string): Promise<SheetGrid[]> {
  const name = filename.toLowerCase();
  if (name.endsWith(".csv")) return [{ name: filename, rows: parseCsv(decodeHebrewCsv(bytes)) }];
  const xlsx = await import("xlsx");
  const book = xlsx.read(bytes, { type: "array", codepage: 1255 });
  return book.SheetNames.map((sheetName) => {
    const matrix = xlsx.utils.sheet_to_json(book.Sheets[sheetName], {
      header: 1,
      raw: false,
      defval: "",
    }) as unknown[][];
    return {
      name: sheetName,
      rows: matrix.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "").trim()) : [])),
    };
  }).filter((sheet) => sheet.rows.some((row) => row.some(Boolean)));
}

export async function readWorkbook(file: File): Promise<SheetGrid[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.type.includes("csv") || file.type.startsWith("text/")) {
    return [{ name: file.name, rows: parseCsv(decodeHebrewCsv(bytes)) }];
  }
  return gridsFromBytes(bytes, file.name);
}
