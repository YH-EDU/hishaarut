export interface ReportExportRow {
  date: string;
  student: string;
  className: string;
  reason: string;
  minutes: number;
  status: string;
  marker: string;
  signer: string;
}

const HEADERS = ["תאריך", "תלמיד", "כיתה", "סיבה", "דקות", "סטטוס", "סומן על ידי", "אושר על ידי"];

function cells(row: ReportExportRow): string[] {
  return [
    row.date,
    row.student,
    row.className,
    row.reason,
    String(row.minutes),
    row.status,
    row.marker,
    row.signer,
  ];
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function reportToCsv(rows: ReportExportRow[]): string {
  const lines = [HEADERS.join(","), ...rows.map((row) => cells(row).map(csvEscape).join(","))];
  return `\uFEFF${lines.join("\n")}`;
}

export function downloadText(filename: string, contents: string, type = "text/csv;charset=utf-8"): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function downloadXlsx(filename: string, rows: ReportExportRow[]): Promise<void> {
  const xlsx = await import("xlsx");
  const data = rows.map((row) => {
    const values = cells(row);
    return Object.fromEntries(HEADERS.map((header, index) => [header, values[index]]));
  });
  const sheet = xlsx.utils.json_to_sheet(data, { header: HEADERS });
  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, sheet, "השארות");
  xlsx.writeFile(book, filename);
}
