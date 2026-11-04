import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getApi } from "../api";
import type { Detention, Reason, SpecialDay, Student, WeekSchedule } from "../api/types";
import { DAY_KEYS, DEFAULT_WEEK, hoursForDate } from "../api/types";
import { useAuth } from "../auth";
import { Banner, Button, Field, studentName } from "../components/ui";
import {
  addClock,
  clockOf,
  defaultReleaseIso,
  formatTime,
  jerusalemClock,
  jerusalemDateTimeIso,
  jerusalemDow,
  jerusalemToday,
  RELEASE_CAP_MINUTES,
  releaseClockAllowed,
  withinSchoolHours,
} from "../lib/dates";
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
  const [schedule, setSchedule] = useState<WeekSchedule>(DEFAULT_WEEK);
  const [closures, setClosures] = useState<string[]>([]);
  const [specialDays, setSpecialDays] = useState<SpecialDay[]>([]);
  const [releaseTime, setReleaseTime] = useState("16:30");
  const [releaseEdited, setReleaseEdited] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [students, classes, reasonRows, detentions, settings] = await Promise.all([
          getApi().listStudents(),
          getApi().listClasses(),
          getApi().listReasons(),
          getApi().listDetentions({ date: jerusalemToday() }),
          getApi().getSettings(),
        ]);
        setSchedule(settings.schedule);
        setClosures(settings.closures);
        setSpecialDays(settings.specialDays ?? []);
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
  const todayHours = hoursForDate({ schedule, closures, specialDays }, jerusalemToday(now), jerusalemDow(now)) ?? { start: null, end: null };
  const displayHours = todayHours.start && todayHours.end
    ? { start: clockOf(todayHours.start), end: clockOf(todayHours.end) }
    : (DAY_KEYS.map((key) => schedule[key]).find((day) => day.start && day.end) ?? { start: "07:00", end: "16:00" });
  const shownStart = clockOf(displayHours.start ?? "07:00");
  const shownEnd = clockOf(displayHours.end ?? "16:00");
  const holiday = !todayHours.end;
  const markingOpen = !holiday && withinSchoolHours(todayHours.start, todayHours.end, now);
  const schoolEnd = markingOpen ? clockOf(todayHours.end ?? "") : null;
  const releaseMax = schoolEnd ? addClock(schoolEnd, RELEASE_CAP_MINUTES) : shownEnd;
  const suggestedIso = defaultReleaseIso(duration, schoolEnd, now);
  const suggestedClock = suggestedIso ? jerusalemClock(new Date(suggestedIso)) : "";
  const releaseClock = releaseEdited ? releaseTime : suggestedClock || releaseTime;
  const releaseIso = jerusalemDateTimeIso(releaseClock || jerusalemClock(now), now);
  const releaseOk = Boolean(schoolEnd) && releaseClockAllowed(releaseClock, schoolEnd ?? shownEnd);

  useEffect(() => {
    if (releaseEdited || !suggestedClock) return;
    setReleaseTime(suggestedClock);
  }, [releaseEdited, suggestedClock]);
  const reasonText = reasonId === "other" ? freeText.trim() : (reasons.find((reason) => reason.id === reasonId)?.label ?? "");
  const ready = Boolean(student) && markingOpen && releaseOk && reasonText.length > 0 && duration >= 1 && duration <= 240;

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
        releaseAt: releaseEdited ? releaseIso : null,
      });
      rememberStudent(student.id);
      const verb = student.gender === "female" ? "סומנה" : "סומן";
      navigate("/search", {
        replace: true,
        state: { flash: `${studentName(student.firstName, student.lastName)} ${verb} להשארות. עכשיו אפשר לעדכן את ההורים בוואטסאפ.` },
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
      {markingOpen ? null : (
        <Banner tone="warn">
          סימון השארות פתוח בימי לימודים בין <bdi className="ltr">{shownStart}</bdi> ל-<bdi className="ltr">{shownEnd}</bdi>
        </Banner>
      )}
      {markingOpen && schoolEnd ? (
        <p className="muted">
          ההשארות מתחילה בסיום הלימודים, <bdi className="ltr">{schoolEnd}</bdi>. שעת היציאה בין{" "}
          <bdi className="ltr">{schoolEnd}</bdi> ל-<bdi className="ltr">{releaseMax}</bdi>.
        </p>
      ) : null}
      <label className="release-card">
        <span>שעת יציאה</span>
        <strong>
          <bdi className="ltr">{formatTime(releaseIso)}</bdi>
        </strong>
        <input
          type="time"
          lang="en-GB"
          aria-label="שעת יציאה"
          min={schoolEnd ?? undefined}
          max={markingOpen ? releaseMax : undefined}
          disabled={!markingOpen}
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
      <p className="muted">הסימון נרשם על שם {session?.profile.fullName}. אחרי הסימון תוכלו לשלוח עדכון להורים מהוואטסאפ שלכם.</p>
    </div>
  );
}
