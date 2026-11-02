import { useState } from "react";
import { getApi } from "../api";
import type { ClassRoom, Student, StudentContact } from "../api/types";
import { classKey } from "../lib/csv";
import {
  IMPORT_FIELD_LABEL,
  buildPreview,
  detectColumns,
  detectedNameOrder,
  readWorkbook,
  type NameOrder,
  unknownClasses,
  type ColumnMapping,
  type ImportField,
  type ImportPreviewRow,
  type SheetGrid,
} from "../lib/importStudents";
import { Banner, Button } from "./ui";

const FIELDS = Object.keys(IMPORT_FIELD_LABEL) as ImportField[];

function parentPreview(name: string, primary: string | null, extra: string | null) {
  const phones = [primary, extra].filter((phone): phone is string => Boolean(phone));
  if (!name && phones.length === 0) return <span className="muted">—</span>;
  return (
    <span className="parent-cell">
      <strong>{name || "—"}</strong>
      {phones.length > 0 ? <bdi className="ltr">{phones.join(" · ")}</bdi> : null}
    </span>
  );
}

function gradeOf(name: string): string {
  const key = classKey(name);
  if (key.startsWith("יב")) return "יב";
  if (key.startsWith("יא")) return "יא";
  return key.slice(0, 1);
}

export function ImportWizard({
  classes,
  students,
  contacts,
  canCreateClasses,
  onImported,
}: {
  classes: ClassRoom[];
  students: Student[];
  contacts: StudentContact[];
  canCreateClasses: boolean;
  onImported: (message: string) => Promise<void>;
}) {
  const [sheets, setSheets] = useState<SheetGrid[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [createClasses, setCreateClasses] = useState(true);
  const [nameOrder, setNameOrder] = useState<NameOrder>("last-first");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sheet = sheets[sheetIndex];
  const className = new Map(classes.map((room) => [room.id, room.name]));
  void contacts;
  const existing = students.map((student) => ({
    firstName: student.firstName,
    lastName: student.lastName,
    className: className.get(student.classId) ?? "",
  }));
  const preview = sheet ? buildPreview(sheet.rows, mappings, hasHeader, existing, nameOrder) : [];
  const missing = unknownClasses(preview, classes.map((room) => room.name));

  function loadSheet(nextSheets: SheetGrid[], index: number) {
    const grid = nextSheets[index];
    if (!grid) return;
    const detected = detectColumns(grid.rows);
    setSheetIndex(index);
    setHasHeader(detected.hasHeader);
    setMappings(detected.mappings);
    setNameOrder(detectedNameOrder(detected.mappings));
  }

  async function onFile(file: File) {
    setError(null);
    try {
      const next = await readWorkbook(file);
      if (next.length === 0) {
        setError("הקובץ ריק");
        return;
      }
      setSheets(next);
      loadSheet(next, 0);
    } catch {
      setError("לא הצלחנו לקרוא את הקובץ. נסו CSV בקידוד UTF-8 או Windows-1255, או אקסל.");
    }
  }

  function setField(index: number, field: ImportField) {
    setMappings((current) =>
      current.map((column) => {
        if (column.index === index) return { ...column, field };
        if (field !== "ignore" && column.field === field) return { ...column, field: "ignore" };
        return column;
      }),
    );
  }

  async function commit() {
    setBusy(true);
    setError(null);
    try {
      let rooms = classes;
      if (canCreateClasses && createClasses) {
        for (const name of missing) {
          await getApi().saveClass({ name, grade: gradeOf(name), homeroomTeacherId: null, active: true });
        }
        rooms = await getApi().listClasses();
      }
      const byKey = new Map(rooms.map((room) => [classKey(room.name), room]));
      let saved = 0;
      const failures: string[] = [];
      for (const row of preview) {
        if (row.issues.some((issue) => issue.code === "missing_name" || issue.code === "duplicate_file")) {
          failures.push(`שורה ${row.line}: ${row.issues[0]?.message ?? "דולג"}`);
          continue;
        }
        const room = byKey.get(classKey(row.className));
        if (!room) {
          failures.push(`שורה ${row.line}: הכיתה ${row.className || "חסרה"} לא קיימת`);
          continue;
        }
        const existingStudent = students.find(
          (student) =>
            student.firstName === row.firstName &&
            student.lastName === row.lastName &&
            classKey(className.get(student.classId) ?? "") === classKey(row.className),
        );
        await getApi().saveStudent({
          id: existingStudent?.id,
          firstName: row.firstName,
          lastName: row.lastName,
          gender: row.gender,
          classId: room.id,
          parentName: row.parent1Name,
          parentPhone: row.parent1E164 ?? "",
          parentPhone2: row.parent1E164b ?? "",
          parent2Name: row.parent2Name,
          parent2Phone: row.parent2E164 ?? "",
          parent2Phone2: row.parent2E164b ?? "",
          active: true,
        });
        saved += 1;
      }
      setSheets([]);
      await onImported(`נשמרו ${saved} תלמידים${failures.length ? `. ${failures.length} שורות דולגו.` : "."}`);
      if (failures.length) setError(failures.slice(0, 6).join("\n"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "הייבוא נכשל");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel stack">
      <div className="spread">
        <h2>ייבוא תלמידים</h2>
        <a className="btn btn-ghost" href={`${import.meta.env.BASE_URL}templates/students-template.csv`}>
          קובץ לדוגמה
        </a>
      </div>
      <p className="muted">אקסל, משוב או CSV. המערכת מזהה עמודות בעברית ובאנגלית, ואפשר לתקן אותן לפני השמירה.</p>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <label className="btn btn-ghost">
        בחירת קובץ
        <input
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void onFile(file);
          }}
        />
      </label>
      {sheets.length > 1 ? (
        <label className="field">
          <span>גיליון</span>
          <select value={sheetIndex} onChange={(event) => loadSheet(sheets, Number(event.target.value))}>
            {sheets.map((item, index) => (
              <option key={item.name} value={index}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {mappings.length > 0 ? (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>עמודה בקובץ</th>
                  <th>דוגמה</th>
                  <th>שיוך</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((column) => (
                  <tr key={column.index}>
                    <td>{column.header}</td>
                    <td className="muted">{column.samples.join(" · ") || "—"}</td>
                    <td>
                      <select value={column.field} onChange={(event) => setField(column.index, event.target.value as ImportField)}>
                        {FIELDS.map((field) => (
                          <option key={field} value={field}>
                            {IMPORT_FIELD_LABEL[field]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>תצוגה מקדימה</h3>
          <label className="field">
            <span>סדר השם</span>
            <select value={nameOrder} onChange={(event) => setNameOrder(event.target.value as NameOrder)}>
              <option value="last-first">משפחה ואז פרטי, כמו במשוב</option>
              <option value="first-last">פרטי ואז משפחה</option>
            </select>
          </label>
          <div className="phone-only list">
            {preview.slice(0, 8).map((row: ImportPreviewRow) => (
              <article key={row.line} className="person-card">
                <span>
                  <b>
                    {row.firstName} {row.lastName}
                  </b>
                  <span className="muted">
                    {row.className || "בלי כיתה"}
                    {row.parent1Name ? ` · אב ${row.parent1Name}` : ""}
                    {row.parent2Name ? ` · אם ${row.parent2Name}` : ""}
                  </span>
                </span>
                <span className="badge">{row.issues[0]?.message ?? "תקין"}</span>
              </article>
            ))}
          </div>
          <div className="table-scroll desktop-only">
            <table className="data-table people-table">
              <thead>
                <tr>
                  <th>שם</th>
                  <th>כיתה</th>
                  <th>אב</th>
                  <th>אם</th>
                  <th>הערה</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 12).map((row: ImportPreviewRow) => (
                  <tr key={row.line}>
                    <td>
                      {row.firstName} {row.lastName}
                    </td>
                    <td>{row.className || "—"}</td>
                    <td>{parentPreview(row.parent1Name, row.parent1E164, row.parent1E164b)}</td>
                    <td>{parentPreview(row.parent2Name, row.parent2E164, row.parent2E164b)}</td>
                    <td className="muted">{row.issues.map((issue) => issue.message).join(", ") || "תקין"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">{preview.length} שורות לקליטה.</p>
          {missing.length > 0 && canCreateClasses ? (
            <label className="row">
              <input type="checkbox" checked={createClasses} onChange={(event) => setCreateClasses(event.target.checked)} />
              ליצור כיתות חדשות: {missing.join(", ")}
            </label>
          ) : null}
          {missing.length > 0 && !canCreateClasses ? (
            <Banner tone="warn">יש כיתות שלא קיימות אצלכם: {missing.join(", ")}. בקשו מהמזכירות ליצור אותן.</Banner>
          ) : null}
          <Button disabled={busy || preview.length === 0} onClick={() => void commit()}>
            {busy ? "מייבאים…" : "ייבוא לטבלה"}
          </Button>
        </>
      ) : null}
    </section>
  );
}
