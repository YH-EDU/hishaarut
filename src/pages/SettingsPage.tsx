import { useEffect, useState } from "react";
import { getApi } from "../api";
import type { Reason, SchoolSettings } from "../api/types";
import { EmptyState, PageHeader } from "../components/PageHeader";
import { Banner, Button, Field } from "../components/ui";

export function SettingsPage() {
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
      <PageHeader title="הגדרות" lede="שם בית הספר שמופיע להורים, והסיבות שהמורה רואה בזמן הסימון. רק מנהל משנה את המסך הזה." />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {info ? <Banner>{info}</Banner> : null}
      <section className="panel stack">
        <h2>סיבות השארות</h2>
        <p className="muted">אלה הכפתורים במסך הסימון. הסתרה משאירה את ההיסטוריה, אבל הסיבה לא תופיע לסימון חדש.</p>
        {reasons.length === 0 ? (
          <EmptyState title="אין סיבות" detail="הוסיפו לפחות סיבה אחת, למשל הפרעה בשיעור." />
        ) : (
          <div className="table-scroll">
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
      </section>
      {settings ? <SchoolForm settings={settings} onSaved={async () => { setInfo("ההגדרות נשמרו"); await load(); }} onError={setError} /> : null}
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
  const [emailsText, setEmailsText] = useState("");

  useEffect(() => {
    void getApi()
      .listAllowedEmails()
      .then((emails) => setEmailsText(emails.join("\n")))
      .catch((err: unknown) => onError(err instanceof Error ? err.message : "אירעה שגיאה"));
  }, [onError]);

  return (
    <section className="panel stack">
      <h2>בית הספר</h2>
      <p className="muted">השם נכנס להודעת הוואטסאפ. כל עוד הדומיין ורשימת המיילים ריקים, אין הגבלה. ברגע שממלאים אחד מהם, רק מי שתואם לדומיין או נמצא ברשימה רואה נתונים.</p>
      <Field label="שם בית הספר בהודעות">
        <input value={draft.schoolName} onChange={(event) => setDraft({ ...draft, schoolName: event.target.value })} />
      </Field>
      <Field label="דומיין מורשה">
        <input
          className="ltr"
          placeholder="school.education.gov.il"
          value={draft.allowedEmailDomain ?? ""}
          onChange={(event) => setDraft({ ...draft, allowedEmailDomain: event.target.value })}
        />
      </Field>
      <Field label="מיילים מורשים, אחד בכל שורה">
        <textarea
          className="ltr"
          rows={5}
          placeholder={"principal@gmail.com\nteacher@school.education.gov.il"}
          value={emailsText}
          onChange={(event) => setEmailsText(event.target.value)}
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
              allowedEmailDomain: draft.allowedEmailDomain?.trim() || null,
              whatsappPhoneNumberId: draft.whatsappPhoneNumberId?.trim() || null,
              whatsappDisplayNumber: draft.whatsappDisplayNumber?.trim() || null,
            })
            .then(() => getApi().setAllowedEmails(emailsText.split(/\n+/)))
            .then(onSaved)
            .catch((err: unknown) => onError(err instanceof Error ? err.message : "השמירה נכשלה"))
        }
      >
        שמירת הגדרות
      </Button>
    </section>
  );
}
