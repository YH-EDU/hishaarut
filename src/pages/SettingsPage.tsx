import { useEffect, useState } from "react";
import { getApi } from "../api";
import type { DayEnds, Reason, SchoolSettings } from "../api/types";
import { useAuth } from "../auth";
import { EmptyState, PageHeader } from "../components/PageHeader";
import { Banner, Button, Field } from "../components/ui";

const DAY_FIELDS: Array<{ key: keyof DayEnds; label: string }> = [
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
      <PageHeader title="הגדרות" lede="שעות סיום הלימודים קובעות מתי מתחילה ההשארות. מנהל או מזכירות יכולים לעדכן אותן." />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {info ? <Banner>{info}</Banner> : null}
      {settings ? <DayEndsForm settings={settings} onSaved={async () => { setInfo("שעות הסיום נשמרו"); await load(); }} onError={setError} /> : null}
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
      <p className="muted">כל חשבון גוגל יכול להיכנס ולבקש תפקיד. הנתונים נפתחים רק אחרי שמנהל או מזכירות מאשרים. דומיין לאישור אוטומטי הוא רשות, וכבוי כברירת מחדל.</p>
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
      <Field label="מספר הוואטסאפ העסקי שמוצג לצוות">
        <input
          className="ltr"
          value={draft.whatsappDisplayNumber ?? ""}
          onChange={(event) => setDraft({ ...draft, whatsappDisplayNumber: event.target.value })}
        />
      </Field>
      <Field label="Phone number ID לשלב 2">
        <input
          className="ltr"
          value={draft.whatsappPhoneNumberId ?? ""}
          onChange={(event) => setDraft({ ...draft, whatsappPhoneNumberId: event.target.value })}
        />
      </Field>
      <Field label="אופן שליחה">
        <select
          value={draft.notificationMode}
          onChange={(event) => setDraft({ ...draft, notificationMode: event.target.value as SchoolSettings["notificationMode"] })}
        >
          <option value="manual_link">שלב 1: קישור wa.me מהמזכירות</option>
          <option value="cloud_api">שלב 2: Cloud API (עדיין לא ממומש)</option>
        </select>
      </Field>
      <Banner tone="warn">אסימון הוואטסאפ לא נשמר כאן. בשלב 2 הוא יישמר רק כסוד של פונקציית השרת.</Banner>
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

function DayEndsForm({
  settings,
  onSaved,
  onError,
}: {
  settings: SchoolSettings;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [ends, setEnds] = useState<DayEnds>(settings.dayEnds);
  return (
    <section className="panel stack">
      <h2>סיום יום הלימודים</h2>
      <p className="muted">ההשארות מתחילה בשעה הזו. אם סימנו אחריה, הספירה מתחילה מרגע הסימון. שעה ריקה, כמו שבת, אומרת שאין לימודים.</p>
      <div className="day-grid">
        {DAY_FIELDS.map((day) => (
          <Field key={day.key} label={day.label}>
            <input
              type="time"
              lang="en-GB"
              value={ends[day.key] ?? ""}
              onChange={(event) => setEnds({ ...ends, [day.key]: event.target.value || null })}
            />
          </Field>
        ))}
      </div>
      <Button
        onClick={() =>
          void getApi()
            .updateDayEnds(ends)
            .then(onSaved)
            .catch((err: unknown) => onError(err instanceof Error ? err.message : "השמירה נכשלה"))
        }
      >
        שמירת השעות
      </Button>
    </section>
  );
}
