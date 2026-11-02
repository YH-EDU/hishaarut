import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getApi } from "../api";
import type { Detention, Reason, Student } from "../api/types";
import { useAuth } from "../auth";
import { Banner, Button, Field, studentName } from "../components/ui";
import { formatTime, jerusalemClock, jerusalemDateTimeIso, jerusalemToday } from "../lib/dates";
import { rememberStudent } from "./SearchPage";

const DURATIONS = [15, 30, 45, 60];

export function MarkPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [student, setStudent] = useState<Student | null>(null);
  const [className, setClassName] = useState("");
  const [classActive, setClassActive] = useState(true);
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [existing, setExisting] = useState<Detention[]>([]);
  const [reasonId, setReasonId] = useState<string | "other" | "">("");
  const [freeText, setFreeText] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [customMinutes, setCustomMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [releaseTime, setReleaseTime] = useState(() => jerusalemClock(new Date(Date.now() + 30 * 60000)));
  const [releaseEdited, setReleaseEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [students, classes, reasonRows, detentions] = await Promise.all([
          getApi().listStudents(),
          getApi().listClasses(),
          getApi().listReasons(),
          getApi().listDetentions({ date: jerusalemToday() }),
        ]);
        const found = students.find((item) => item.id === id) ?? null;
        const room = classes.find((item) => item.id === found?.classId);
        setStudent(found);
        setClassName(room?.name ?? "");
        setClassActive(room?.active ?? false);
        const active = reasonRows.filter((reason) => reason.active);
        setReasons(active);
        if (active.length === 0) setReasonId("other");
        setExisting(detentions.filter((item) => item.studentId === id && item.status === "pending"));
      } catch (err) {
        setError(err instanceof Error ? err.message : "אירעה שגיאה");
      }
    })();
  }, [id]);

  const duration = customMinutes ? Number(customMinutes) : minutes;
  const releaseIso = jerusalemDateTimeIso(releaseTime || jerusalemClock());
  const reasonText = reasonId === "other" ? freeText.trim() : (reasons.find((reason) => reason.id === reasonId)?.label ?? "");
  const ready = Boolean(student) && reasonText.length > 0 && duration >= 1 && duration <= 240;

  async function submit() {
    if (!student || !ready) return;
    setBusy(true);
    setError(null);
    try {
      await getApi().createDetention({
        studentId: student.id,
        reasonId: reasonId === "other" ? null : reasonId,
        reasonText,
        durationMinutes: duration,
        notes: notes.trim() || null,
        releaseAt: releaseIso,
      });
      rememberStudent(student.id);
      const verb = student.gender === "female" ? "סומנה" : "סומן";
      navigate("/search", {
        replace: true,
        state: { flash: `${studentName(student.firstName, student.lastName)} ${verb} להשארות` },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "השמירה נכשלה");
      setBusy(false);
    }
  }

  if (!student && !error) return <p>טוען…</p>;
  if (!student) return <Banner tone="danger">{error ?? "התלמיד לא נמצא"}</Banner>;
  if (!student.active) {
    return (
      <div className="stack">
        <Link className="back-link" to="/search">
          חזרה לחיפוש
        </Link>
        <h1>{studentName(student.firstName, student.lastName)}</h1>
        <Banner tone="warn">התלמיד בארכיון ולא ניתן לסמן אותו. ההיסטוריה נשארת בדוחות.</Banner>
      </div>
    );
  }
  if (!classActive) {
    return (
      <div className="stack">
        <Link className="back-link" to="/search">
          חזרה לחיפוש
        </Link>
        <h1>{studentName(student.firstName, student.lastName)}</h1>
        <Banner tone="warn">הכיתה בארכיון ולא ניתן לסמן ממנה. ההיסטוריה נשארת בדוחות.</Banner>
      </div>
    );
  }

  return (
    <div className="stack">
      <Link className="back-link" to="/search">חזרה לחיפוש</Link>
      <div>
        <h1>{studentName(student.firstName, student.lastName)}</h1>
        <p className="muted">{className}</p>
      </div>
      {existing.length > 0 ? (
        <Banner tone="warn">
          כבר יש השארות פתוחה היום: {existing.map((item) => `${item.reasonText}, ${item.durationMinutes} דק׳`).join(" · ")}
        </Banner>
      ) : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <section className="card stack">
        <h2>סיבה</h2>
        <div className="chips">
          {reasons.map((reason) => (
            <button
              key={reason.id}
              type="button"
              className="chip"
              aria-pressed={reasonId === reason.id}
              onClick={() => setReasonId(reason.id)}
            >
              {reason.label}
            </button>
          ))}
          <button type="button" className="chip" aria-pressed={reasonId === "other"} onClick={() => setReasonId("other")}>
            אחר
          </button>
        </div>
        {reasonId === "other" ? (
          <Field label="פירוט הסיבה">
            <input value={freeText} onChange={(event) => setFreeText(event.target.value)} maxLength={160} />
          </Field>
        ) : null}
      </section>
      <section className="card stack">
        <h2>משך בדקות</h2>
        <div className="chips">
          {DURATIONS.map((value) => (
            <button
              key={value}
              type="button"
              className="chip"
              aria-pressed={!customMinutes && minutes === value}
              onClick={() => {
                setMinutes(value);
                setCustomMinutes("");
                if (!releaseEdited) setReleaseTime(jerusalemClock(new Date(Date.now() + value * 60000)));
              }}
            >
              {value}
            </button>
          ))}
        </div>
        <Field label="משך אחר">
          <input
            inputMode="numeric"
            value={customMinutes}
            placeholder="למשל 20"
            onChange={(event) => setCustomMinutes(event.target.value.replace(/\D/g, "").slice(0, 3))}
          />
        </Field>
      </section>
      <label className="release-card">
        <span>שעת יציאה</span>
        <strong>
          <bdi className="ltr">{formatTime(releaseIso)}</bdi>
        </strong>
        <input
          type="time"
          lang="en-GB"
          aria-label="שעת יציאה"
          value={releaseTime}
          onChange={(event) => {
            setReleaseEdited(true);
            setReleaseTime(event.target.value);
          }}
        />
      </label>
      <details>
        <summary>הערה פנימית, לא נשלחת להורים</summary>
        <Field label="הערה">
          <textarea value={notes} maxLength={500} onChange={(event) => setNotes(event.target.value)} />
        </Field>
      </details>
      <Button className="sticky-action" block disabled={!ready || busy} onClick={() => void submit()}>
        {busy ? "שומרים…" : "סמן להשארות"}
      </Button>
      <p className="muted">הסימון נרשם על שם {session?.profile.fullName}. המזכירות תשלח את ההודעה להורה ולמחנך.</p>
    </div>
  );
}
