import { useEffect, useMemo, useState } from "react";
import { getApi } from "../api";
import type { ClassRoom, Detention, DetentionStatus, Reason } from "../api/types";
import { STATUS_LABEL } from "../api/types";
import { useAuth } from "../auth";
import { PageHeader } from "../components/PageHeader";
import { Banner, Button, Field, studentName } from "../components/ui";
import { formatDate, jerusalemToday, shiftDate } from "../lib/dates";
import { downloadText, downloadXlsx, reportToCsv, type ReportExportRow } from "../lib/exportReport";

const STATUS_ORDER: DetentionStatus[] = ["completed", "no_show", "pending", "cancelled"];
const STATUS_SUMMARY: Record<DetentionStatus, string> = {
  completed: "שוחררו",
  no_show: "לא הגיעו",
  pending: "ממתינים",
  cancelled: "בוטלו",
};

export function ReportsPage() {
  const role = useAuth().session?.profile.role;
  const userId = useAuth().session?.userId;
  const today = jerusalemToday();
  const [from, setFrom] = useState(shiftDate(today, -30));
  const [to, setTo] = useState(today);
  const [classId, setClassId] = useState("");
  const [reason, setReason] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<DetentionStatus | "">("");
  const [rows, setRows] = useState<Detention[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [school, setSchool] = useState("נשארים");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void Promise.all([getApi().listClasses(), getApi().listReasons(), getApi().getSettings()])
      .then(([nextClasses, nextReasons, settings]) => {
        setClasses(nextClasses);
        setReasons(nextReasons);
        setSchool(settings.schoolName);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "אירעה שגיאה"));
  }, []);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setRows(await getApi().listReport(from, to));
    } catch (err) {
      setError(err instanceof Error ? err.message : "הדוח נכשל");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void run();
    // Initial range only. Later runs come from the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = name.trim();
    return rows.filter((row) => {
      if (classId && row.classId !== classId) return false;
      if (reason && row.reasonText !== reason) return false;
      if (status && row.status !== status) return false;
      if (q && !`${row.studentFirstName} ${row.studentLastName}`.includes(q)) return false;
      return true;
    });
  }, [rows, classId, reason, name, status]);

  const byReason = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((row) => map.set(row.reasonText, (map.get(row.reasonText) ?? 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const exportRows: ReportExportRow[] = filtered.map((row) => ({
    date: row.detentionDate,
    student: studentName(row.studentFirstName, row.studentLastName),
    className: row.className,
    reason: row.reasonText,
    minutes: row.durationMinutes,
    status: STATUS_LABEL[row.status],
    marker: row.markerName,
    signer: row.signerName ?? "",
  }));

  return (
    <div className="stack">
      <div className="print-only">
        <h1>{school}</h1>
        <p>
          דוח השארות {formatDate(from)} – {formatDate(to)}
        </p>
      </div>
      <div className="no-print">
        <PageHeader title="דוחות" lede={
            role === "admin" || role === "secretary"
              ? "כל ההשארות בבית הספר, לפי תלמיד, כיתה, סיבה וטווח תאריכים. אפשר לייצא או להדפיס."
              : role === "homeroom"
                ? "ההשארות של הכיתה שלך וההשארות שסימנת, לפי תאריכים. אפשר לייצא או להדפיס."
                : "ההשארות שסימנת, לפי תאריכים. אפשר לייצא או להדפיס."
          } />
      </div>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <section className="card stack no-print">
        <div className="row">
          <Field label="מתאריך">
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field label="עד תאריך">
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </Field>
        </div>
        <Field label="כיתה">
          <select value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="">כל הכיתות</option>
            {classes
              .filter(
                (room) =>
                  role === "admin" ||
                  role === "secretary" ||
                  room.homeroomTeacherId === userId ||
                  rows.some((row) => row.classId === room.id),
              )
              .map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="סיבה">
          <select value={reason} onChange={(event) => setReason(event.target.value)}>
            <option value="">כל הסיבות</option>
            {reasons.map((item) => (
              <option key={item.id} value={item.label}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="סטטוס">
          <select value={status} onChange={(event) => setStatus(event.target.value as DetentionStatus | "")}>
            <option value="">כל הסטטוסים</option>
            {STATUS_ORDER.map((key) => (
              <option key={key} value={key}>
                {STATUS_LABEL[key]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="תלמיד">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="חלק מהשם" />
        </Field>
        <Button onClick={() => void run()}>{loading ? "טוען…" : "הצגת דוח"}</Button>
      </section>
      <div className="summary">
        <div>
          <strong>{filtered.length}</strong>
          השארות
        </div>
        <div>
          <strong>{new Set(filtered.map((row) => row.studentId)).size}</strong>
          תלמידים
        </div>
      </div>
      <div className="summary summary-status">
        {STATUS_ORDER.map((key) => (
          <div key={key}>
            <strong>{filtered.filter((row) => row.status === key).length}</strong>
            {STATUS_SUMMARY[key]}
          </div>
        ))}
      </div>
      <div className="chips">
        {byReason.map(([label, count]) => (
          <span key={label} className="badge">
            {label} · {count}
          </span>
        ))}
      </div>
      <div className="row no-print">
        <Button
          variant="ghost"
          onClick={() => downloadText(`hishaarut-${from}-${to}.csv`, reportToCsv(exportRows))}
        >
          ייצוא CSV
        </Button>
        <Button variant="ghost" onClick={() => void downloadXlsx(`hishaarut-${from}-${to}.xlsx`, exportRows)}>
          ייצוא אקסל
        </Button>
        <Button variant="ghost" onClick={() => window.print()}>
          הדפסה
        </Button>
      </div>
      <div className="phone-only list">
        {filtered.map((row) => (
          <article key={row.id} className="person-card">
            <span>
              <b>{studentName(row.studentFirstName, row.studentLastName)}</b>
              <span className="muted">
                {formatDate(row.detentionDate)} · {row.className} · {row.reasonText} · {row.durationMinutes} דק׳
              </span>
            </span>
            <span className="badge">{STATUS_LABEL[row.status]}</span>
          </article>
        ))}
        {filtered.length === 0 ? <p className="empty">אין נתונים בטווח הזה.</p> : null}
      </div>
      <div className="card table-wrap desktop-only">
        <table>
          <thead>
            <tr>
              <th>תאריך</th>
              <th>תלמיד</th>
              <th>כיתה</th>
              <th>סיבה</th>
              <th>דקות</th>
              <th>סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                <td>{formatDate(row.detentionDate)}</td>
                <td>{studentName(row.studentFirstName, row.studentLastName)}</td>
                <td>{row.className}</td>
                <td>{row.reasonText}</td>
                <td>{row.durationMinutes}</td>
                <td>{STATUS_LABEL[row.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? <p className="empty">אין נתונים בטווח הזה.</p> : null}
      </div>
    </div>
  );
}
