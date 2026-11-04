import { useEffect, useState } from "react";
import { getApi } from "../api";
import type { Role } from "../api/types";
import { ROLE_LABEL } from "../api/types";
import { useAuth } from "../auth";
import { TitlePicker } from "../components/TitlePicker";
import { Banner, Button, Field } from "../components/ui";
import { isFullName } from "../lib/staffName";

const DEMO_ROLES: Array<Role | "pending" | "new"> = ["teacher", "homeroom", "secretary", "admin", "new", "pending"];

export function LoginPage() {
  const api = getApi();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function google() {
    setBusy(true);
    setError(null);
    try {
      await api.signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "הכניסה נכשלה");
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <img className="app-icon" src={`${import.meta.env.BASE_URL}icons/v3/icon-192.png`} alt="" width={72} height={72} />
      <h1>נשארים</h1>
      <p className="muted">סימון מהיר של תלמידים שנשארים אחרי שעות הלימודים, ומעקב של המזכירות עד היציאה הביתה.</p>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {api.isDemo ? (
        <div className="stack">
          <Banner>מצב הדגמה מקומי, בלי גוגל ובלי שרת.</Banner>
          {DEMO_ROLES.map((role) => (
            <Button
              key={role}
              variant={role === "pending" ? "ghost" : "primary"}
              block
              onClick={() => void api.signInAs?.(role)}
            >
              {role === "new" ? "כניסה כמשתמש חדש" : role === "pending" ? "כניסה כבקשה ממתינה" : `כניסה כ${ROLE_LABEL[role]}`}
            </Button>
          ))}
        </div>
      ) : (
        <Button block disabled={busy} onClick={() => void google()}>
          {busy ? "עוברים לגוגל…" : "כניסה עם חשבון גוגל"}
        </Button>
      )}
    </div>
  );
}

export function DeniedPage() {
  const [busy, setBusy] = useState(false);
  return (
    <div className="login">
      <h1>אין גישה</h1>
      <p>החשבון הזה לא נמצא בדומיין של בית הספר ולא ברשימת המיילים המורשים. אין גישה לנתוני התלמידים.</p>
      <Button
        variant="ghost"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void getApi().signOut();
        }}
      >
        יציאה
      </Button>
    </div>
  );
}

export function PendingPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Role>("teacher");
  const { session } = useAuth();
  const [classIds, setClassIds] = useState<string[]>([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string; hasHomeroom?: boolean }>>([]);
  const [fullName, setFullName] = useState(session?.profile.fullName ?? "");
  const [title, setTitle] = useState(session?.profile.title ?? "");
  const [requested, setRequested] = useState<Role | null>(null);
  const [requestedNames, setRequestedNames] = useState<string[]>([]);

  useEffect(() => {
    void Promise.all([getApi().listOpenClasses(), getApi().listProfiles()])
      .then(([rooms, profiles]) => {
        setClasses(rooms);
        const mine = profiles[0];
        if (mine?.requestedRole) {
          setRequested(mine.requestedRole);
          setRequestedNames(rooms.filter((room) => mine.requestedClassIds.includes(room.id)).map((room) => room.name));
        }
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "אירעה שגיאה"));
  }, []);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await getApi().updateOwnProfile({ fullName: fullName.trim(), phone: session?.profile.phone ?? "", title: title.trim() });
      await getApi().requestStaffRole(choice, choice === "homeroom" ? classIds : []);
      setRequested(choice);
      setRequestedNames(classes.filter((room) => classIds.includes(room.id)).map((room) => room.name));
    } catch (err) {
      setError(err instanceof Error ? err.message : "הבקשה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <h1>{requested ? "ממתינים לאישור" : "בחירת תפקיד"}</h1>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {requested ? (
        <p>
          הבקשה נשלחה: {ROLE_LABEL[requested]}
          {requestedNames.length > 0 ? ` · ${requestedNames.join(", ")}` : ""}. מנהל או מזכירות צריכים לאשר לפני שיש גישה.
        </p>
      ) : (
        <div className="stack">
          <p>החשבון עדיין בלי תפקיד. מלאו את הפרטים ובחרו מה אתם עושים בבית הספר. זו בקשה בלבד, עד לאישור.</p>
          <Field label="שם פרטי ומשפחה">
            <input value={fullName} maxLength={120} onChange={(event) => setFullName(event.target.value)} placeholder="למשל: יוסף כהן" />
          </Field>
          {fullName.trim() && !isFullName(fullName) ? <p className="muted">צריך שם פרטי ושם משפחה.</p> : null}
          <Field label="איך לפנות אליכם (מופיע בחתימה להורים)">
            <TitlePicker value={title} onChange={setTitle} />
          </Field>
          <div className="row">
            {(["teacher", "homeroom", "admin", "secretary"] as Role[]).map((role) => (
              <Button key={role} variant={choice === role ? "primary" : "ghost"} onClick={() => setChoice(role)}>
                {role === "homeroom" ? "מחנך" : role === "admin" ? "מנהל" : ROLE_LABEL[role]}
              </Button>
            ))}
          </div>
          {choice === "homeroom" ? (
            <div className="stack">
              <p className="muted">בחרו את הכיתה שאתם מחנכים.</p>
              {classes.length === 0 ? <Banner tone="warn">עדיין אין כיתות במערכת. בקשו מהמזכירות להוסיף את הכיתה.</Banner> : null}
              {classes.map((room) => (
                <label key={room.id} className="check-row">
                  <input type="radio" name="homeroom-class" checked={classIds[0] === room.id} onChange={() => setClassIds([room.id])} />
                  {room.name}
                  {room.hasHomeroom ? <span className="muted"> · כבר רשום לה מחנך</span> : null}
                </label>
              ))}
              {classes.find((room) => room.id === classIds[0])?.hasHomeroom ? (
                <Banner tone="warn">לכיתה הזו כבר רשום מחנך. אם זו הכיתה שלכם, המזכירות תבדוק ותאשר.</Banner>
              ) : null}
            </div>
          ) : null}
          <Button
            disabled={busy || !isFullName(fullName) || !title.trim() || (choice === "homeroom" && classIds.length === 0)}
            onClick={() => void submit()}>
            שליחת בקשה
          </Button>
        </div>
      )}
      <Button
        variant="ghost"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void getApi().signOut();
        }}
      >
        יציאה
      </Button>
    </div>
  );
}

export function SetupMissingPage() {
  return (
    <div className="login">
      <h1>נשארים</h1>
      <Banner tone="warn">חסרים פרטי החיבור ל-Supabase. מלאו את הקובץ .env לפי .env.example, ואז הריצו מחדש.</Banner>
      <p>ההסבר המלא נמצא בקובץ SETUP.md: יצירת הפרויקט, התחברות גוגל, והפיכת המשתמש הראשון למנהל.</p>
    </div>
  );
}

export function Forbidden() {
  return <Banner tone="warn">אין לחשבון הזה הרשאה למסך הזה.</Banner>;
}
