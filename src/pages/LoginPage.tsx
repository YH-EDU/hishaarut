import { useEffect, useState } from "react";
import { getApi } from "../api";
import type { Role } from "../api/types";
import { ROLE_LABEL } from "../api/types";
import { Banner, Button } from "../components/ui";

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
      <img className="app-icon" src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width={72} height={72} />
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
  const [choice, setChoice] = useState<"teacher" | "homeroom">("teacher");
  const [classIds, setClassIds] = useState<string[]>([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [requested, setRequested] = useState<"teacher" | "homeroom" | null>(null);
  const [requestedNames, setRequestedNames] = useState<string[]>([]);

  useEffect(() => {
    void Promise.all([getApi().listOpenClasses(), getApi().listProfiles()])
      .then(([rooms, profiles]) => {
        setClasses(rooms);
        const mine = profiles[0];
        if (mine?.requestedRole === "teacher" || mine?.requestedRole === "homeroom") {
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
          הבקשה נשלחה: {requested === "homeroom" ? "מחנך" : "מורה מקצועי"}
          {requestedNames.length > 0 ? ` · ${requestedNames.join(", ")}` : ""}. מנהל או מזכירות צריכים לאשר לפני שיש גישה.
        </p>
      ) : (
        <div className="stack">
          <p>החשבון עדיין בלי תפקיד. בחרו מה אתם עושים בבית הספר. זו בקשה בלבד, עד לאישור.</p>
          <div className="row">
            <Button variant={choice === "teacher" ? "primary" : "ghost"} onClick={() => setChoice("teacher")}>
              מורה מקצועי
            </Button>
            <Button variant={choice === "homeroom" ? "primary" : "ghost"} onClick={() => setChoice("homeroom")}>
              מחנך
            </Button>
          </div>
          {choice === "homeroom" ? (
            <div className="stack">
              {classes.map((room) => (
                <label key={room.id} className="check-row">
                  <input
                    type="checkbox"
                    checked={classIds.includes(room.id)}
                    onChange={() =>
                      setClassIds((current) => (current.includes(room.id) ? current.filter((id) => id !== room.id) : [...current, room.id]))
                    }
                  />
                  {room.name}
                </label>
              ))}
            </div>
          ) : null}
          <Button disabled={busy || (choice === "homeroom" && classIds.length === 0)} onClick={() => void submit()}>
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
