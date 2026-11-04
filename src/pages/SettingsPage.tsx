import { useEffect, useState } from "react";
import { getApi } from "../api";
import type { DayKey, Reason, SchoolSettings, WeekSchedule } from "../api/types";
import { DEFAULT_PARENT_TEMPLATE } from "../api/types";
import { useAuth } from "../auth";
import { EmptyState, PageHeader } from "../components/PageHeader";
import { Banner, Button, Field } from "../components/ui";
import { formatDate, jerusalemToday } from "../lib/dates";
import { applyParentTemplate } from "../lib/messages";

const DAY_FIELDS: Array<{ key: DayKey; label: string }> = [
  { key: "sun", label: "ראשון" },
  { key: "mon", label: "שני" },
  { key: "tue", label: "שלישי" },
  { key: "wed", label: "רביעי" },
  { key: "thu", label: "חמישי" },
  { key: "fri", label: "שישי" },
  { key: "sat", label: "שבת" },
];

export function SettingsPage() {
  const isAdmin = useAuth().session?.profile.role === "admin";
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [settings, setSettings] = useState<SchoolSettings | null>(null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function load() {
    const [nextReasons, nextSettings] = await Promise.all([getApi().listReasons(), getApi().getSettings()]);
    setReasons(nextReasons);
    setSettings(nextSettings);
  }

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "אירעה שגיאה"));
  }, []);

  return (
    <div className="stack">
      <PageHeader title="הגדרות" lede="שעות הלימודים קובעות מתי אפשר לסמן ומתי התלמידים יוצאים. פרטים אישיים (שם, תואר, טלפון, תפקיד) משנים בעמוד החשבון שלי." />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {info ? <Banner>{info}</Banner> : null}
      {settings ? (
        <ScheduleForm
          settings={settings}
          onSaved={async (message) => {
            setInfo(message);
            await load();
          }}
          onError={setError}
        />
      ) : null}
      {isAdmin ? <section className="panel stack">
        <h2>סיבות השארות</h2>
        <p className="muted">אלה הכפתורים במסך הסימון. הסתרה משאירה את ההיסטוריה, אבל הסיבה לא תופיע לסימון חדש.</p>
        {reasons.length === 0 ? (
          <EmptyState title="אין סיבות" detail="הוסיפו לפחות סיבה אחת, למשל הפרעה בשיעור." />
        ) : (
          <>
          <div className="phone-only list">
            {reasons.map((reason) => (
              <div key={reason.id} className="person-card">
                <span>
                  <b>{reason.label}</b>
                  <span className="muted">{reason.active ? "פעילה" : "מוסתרת"}</span>
                </span>
                <Button
                  variant="ghost"
                  onClick={() =>
                    void getApi()
                      .saveReason({ ...reason, active: !reason.active })
                      .then(async () => {
                        setInfo("הסיבה עודכנה");
                        await load();
                      })
                      .catch((err: unknown) => setError(err instanceof Error ? err.message : "השמירה נכשלה"))
                  }
                >
                  {reason.active ? "הסתרה" : "הפעלה"}
                </Button>
              </div>
            ))}
          </div>
          <div className="table-scroll desktop-only">
            <table className="data-table">
              <thead>
                <tr>
                  <th>סיבה</th>
                  <th>מצב</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {reasons.map((reason) => (
                  <tr key={reason.id}>
                    <td>{reason.label}</td>
                    <td>{reason.active ? "פעילה" : "מוסתרת"}</td>
                    <td>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          void getApi()
                            .saveReason({ ...reason, active: !reason.active })
                            .then(async () => {
                              setInfo("הסיבה עודכנה");
                              await load();
                            })
                            .catch((err: unknown) => setError(err instanceof Error ? err.message : "השמירה נכשלה"))
                        }
                      >
                        {reason.active ? "הסתרה" : "הפעלה"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
        <div className="toolbar">
          <input value={label} placeholder="סיבה חדשה" onChange={(event) => setLabel(event.target.value)} />
          <Button
            disabled={!label.trim()}
            onClick={() =>
              void getApi()
                .saveReason({ label, active: true, sortOrder: (reasons.at(-1)?.sortOrder ?? 0) + 10 })
                .then(async () => {
                  setLabel("");
                  setInfo("הסיבה נוספה");
                  await load();
                })
                .catch((err: unknown) => setError(err instanceof Error ? err.message : "השמירה נכשלה"))
            }
          >
            הוספה
          </Button>
        </div>
      </section> : null}
      {isAdmin && settings ? <SchoolForm settings={settings} onSaved={async () => { setInfo("ההגדרות נשמרו"); await load(); }} onError={setError} /> : null}
    </div>
  );
}

function SchoolForm({
  settings,
  onSaved,
  onError,
}: {
  settings: SchoolSettings;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState(settings);

  return (
    <section className="panel stack">
      <h2>בית הספר</h2>
      <p className="muted">כל חשבון גוגל יכול להיכנס ולבקש תפקיד. הנתונים נפתחים רק אחרי שמנהל או מזכירות מאשרים. דומיין לאישור אוטומטי הוא רשות.</p>
      <Field label="שם בית הספר בהודעות">
        <input value={draft.schoolName} onChange={(event) => setDraft({ ...draft, schoolName: event.target.value })} />
      </Field>
      <Field label="דומיין לאישור אוטומטי כמורה">
        <input
          className="ltr"
          placeholder="school.example"
          value={draft.autoApproveDomain ?? ""}
          onChange={(event) => setDraft({ ...draft, autoApproveDomain: event.target.value })}
        />
      </Field>
      <Field label="מספר הוואטסאפ של בית הספר (מוצג לצוות)">
        <input
          className="ltr"
          value={draft.whatsappDisplayNumber ?? ""}
          onChange={(event) => setDraft({ ...draft, whatsappDisplayNumber: event.target.value })}
        />
      </Field>
      <Button
        disabled={!draft.schoolName.trim()}
        onClick={() =>
          void getApi()
            .updateSettings({
              ...draft,
              allowedEmailDomain: null,
              autoApproveDomain: draft.autoApproveDomain?.trim() || null,
              whatsappPhoneNumberId: draft.whatsappPhoneNumberId?.trim() || null,
              whatsappDisplayNumber: draft.whatsappDisplayNumber?.trim() || null,
            })
            .then(() => getApi().setAllowedEmails([]))
            .then(onSaved)
            .catch((err: unknown) => onError(err instanceof Error ? err.message : "השמירה נכשלה"))
        }
      >
        שמירת הגדרות
      </Button>
    </section>
  );
}

function ScheduleForm({
  settings,
  onSaved,
  onError,
}: {
  settings: SchoolSettings;
  onSaved: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [schedule, setSchedule] = useState<WeekSchedule>(settings.schedule);
  const [template, setTemplate] = useState(settings.parentMessageTemplate || DEFAULT_PARENT_TEMPLATE);
  const preview = applyParentTemplate(template, {
    parentName: "דוד כהן",
    studentName: "יוסף לוי",
    className: "ז׳1",
    releaseTime: "16:30",
    reason: "הפרעה בשיעור",
  });

  function setDay(key: DayKey, part: "start" | "end", value: string) {
    setSchedule({ ...schedule, [key]: { ...schedule[key], [part]: value || null } });
  }

  function saveHours() {
    for (const day of DAY_FIELDS) {
      const row = schedule[day.key];
      const start = row.start || null;
      const end = row.end || null;
      if (Boolean(start) !== Boolean(end)) {
        onError(`ביום ${day.label} צריך גם שעת התחלה וגם שעת סיום, או להשאיר את היום סגור`);
        return;
      }
      if (start && end && start >= end) {
        onError(`ביום ${day.label} שעת ההתחלה צריכה להיות לפני שעת הסיום`);
        return;
      }
    }
    void getApi()
      .updateSchedule(schedule)
      .then(() => onSaved("שעות הלימודים נשמרו"))
      .catch((err: unknown) => onError(err instanceof Error ? err.message : "השמירה נכשלה"));
  }

  return (
    <>
      <section className="panel stack">
        <h2>שעות לימודים קבועות</h2>
        <p className="muted">הלוח הקבוע לכל שבוע. ההשארות מתחילה בשעת הסיום, ושעת היציאה מחושבת ממנה (עד שלוש שעות אחריה). שורה ריקה, כמו שבת, היא יום ללא לימודים. ברירת המחדל: א׳–ה׳ 16:00, ג׳ 14:00, ו׳ 12:00.</p>
        <div className="hours-grid">
          <div className="hours-grid-head">
            <span>יום</span>
            <span>התחלה</span>
            <span>סיום</span>
          </div>
          {DAY_FIELDS.map((day) => (
            <div className="hours-row" key={day.key}>
              <span>{day.label}</span>
              <input
                type="time"
                lang="en-GB"
                aria-label={`התחלה ${day.label}`}
                value={schedule[day.key].start ?? ""}
                onChange={(event) => setDay(day.key, "start", event.target.value)}
              />
              <input
                type="time"
                lang="en-GB"
                aria-label={`סיום ${day.label}`}
                value={schedule[day.key].end ?? ""}
                onChange={(event) => setDay(day.key, "end", event.target.value)}
              />
            </div>
          ))}
        </div>
        <Button onClick={saveHours}>שמירת השעות</Button>
      </section>
      <SpecialDays settings={settings} onSaved={onSaved} onError={onError} />
      <section className="panel stack">
        <h2>הודעה להורים</h2>
        <p className="muted">נשלחת בנפרד לאב ולאם, כל אחד בשמו. אם אין שם, הפתיחה היא «שלום».</p>
        <ul className="placeholder-list">
          <li><bdi className="ltr">{"{parent_name}"}</bdi> שם ההורה</li>
          <li><bdi className="ltr">{"{student_name}"}</bdi> שם התלמיד</li>
          <li><bdi className="ltr">{"{class}"}</bdi> כיתה</li>
          <li><bdi className="ltr">{"{release_time}"}</bdi> שעת יציאה</li>
          <li><bdi className="ltr">{"{reason_clause}"}</bdi> שם התלמיד והסיבה במשפט</li>
          <li><bdi className="ltr">{"{teacher_sign}"}</bdi> חתימת המורה</li>
          <li><bdi className="ltr">{"{reason}"}</bdi> סיבה</li>
        </ul>
        <Field label="נוסח">
          <textarea rows={8} value={template} maxLength={2000} onChange={(event) => setTemplate(event.target.value)} />
        </Field>
        <h3>תצוגה מקדימה</h3>
        <pre className="message-preview">{preview}</pre>
        <Button
          onClick={() =>
            void getApi()
              .updateParentTemplate(template)
              .then(() => onSaved("נוסח ההודעה נשמר"))
              .catch((err: unknown) => onError(err instanceof Error ? err.message : "השמירה נכשלה"))
          }
        >
          שמירת הנוסח
        </Button>
      </section>
    </>
  );
}

/** One-off dates: no school, or different hours (e.g. a short day before a holiday). */
function SpecialDays({
  settings,
  onSaved,
  onError,
}: {
  settings: SchoolSettings;
  onSaved: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<"closed" | "hours">("closed");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const today = jerusalemToday();
  const days = [
    ...settings.closures.map((day) => ({ date: day, text: "אין לימודים" })),
    ...(settings.specialDays ?? []).map((day) => ({
      date: day.date,
      text: day.start ? `${day.start}–${day.end}` : `סיום ${day.end}`,
    })),
  ]
    .filter((day) => day.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const invalid = !date || (kind === "hours" && (!end || (Boolean(start) && start >= end)));

  return (
    <section className="panel stack">
      <h2>יום מיוחד</h2>
      <p className="muted">לתאריך אחד בלבד: יום חופש, או יום קצר / ארוך. גובר על הלוח הקבוע, ושעת היציאה מחושבת לפיו.</p>
      <Field label="תאריך">
        <input type="date" min={today} value={date} onChange={(event) => setDate(event.target.value)} />
      </Field>
      <fieldset className="choice-row">
        <legend>מה קורה ביום הזה</legend>
        <label className="choice">
          <input type="radio" name="special-kind" checked={kind === "closed"} onChange={() => setKind("closed")} />
          אין לימודים
        </label>
        <label className="choice">
          <input type="radio" name="special-kind" checked={kind === "hours"} onChange={() => setKind("hours")} />
          שעות אחרות
        </label>
      </fieldset>
      {kind === "hours" ? (
        <div className="row">
          <Field label="התחלה (לא חובה)">
            <input type="time" lang="en-GB" value={start} onChange={(event) => setStart(event.target.value)} />
          </Field>
          <Field label="סיום הלימודים">
            <input type="time" lang="en-GB" value={end} onChange={(event) => setEnd(event.target.value)} />
          </Field>
        </div>
      ) : null}
      <Button
        disabled={invalid}
        onClick={() =>
          void getApi()
            .setSpecialDay(date, kind === "hours" ? start || null : null, kind === "hours" ? end : null)
            .then(() => {
              setDate("");
              setStart("");
              setEnd("");
              return onSaved("היום המיוחד נשמר");
            })
            .catch((err: unknown) => onError(err instanceof Error ? err.message : "השמירה נכשלה"))
        }
      >
        שמירת היום
      </Button>
      {days.length === 0 ? (
        <p className="muted">אין ימים מיוחדים קרובים.</p>
      ) : (
        <ul className="list" aria-label="ימים מיוחדים">
          {days.map((day) => (
            <li className="closure-row" key={day.date}>
              <span>
                <b>{formatDate(day.date)}</b> <span className="muted">{day.text}</span>
              </span>
              <Button
                variant="ghost"
                aria-label={`הסרת ${formatDate(day.date)}`}
                onClick={() =>
                  void getApi()
                    .removeClosure(day.date)
                    .then(() => onSaved("היום הוחזר ללוח הקבוע"))
                    .catch((err: unknown) => onError(err instanceof Error ? err.message : "המחיקה נכשלה"))
                }
              >
                הסרה
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
