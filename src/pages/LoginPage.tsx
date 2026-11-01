import { useState } from "react";
import { getApi } from "../api";
import type { Role } from "../api/types";
import { ROLE_LABEL } from "../api/types";
import { Banner, Button } from "../components/ui";

const DEMO_ROLES: Array<Role | "pending"> = ["teacher", "homeroom", "secretary", "admin", "pending"];

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
      <div className="mark" aria-hidden>
        ש
      </div>
      <h1>השארות</h1>
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
              {role === "pending" ? "כניסה כמשתמש שממתין לאישור" : `כניסה כ${ROLE_LABEL[role]}`}
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

export function PendingPage() {
  const [busy, setBusy] = useState(false);
  return (
    <div className="login">
      <h1>ממתינים לאישור</h1>
      <p>החשבון נכנס, אבל עדיין אין לו תפקיד. מנהל המערכת צריך לשייך אתכם כמורה, מחנך, מזכירות או מנהל.</p>
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
      <h1>השארות</h1>
      <Banner tone="warn">חסרים פרטי החיבור ל-Supabase. מלאו את הקובץ .env לפי .env.example, ואז הריצו מחדש.</Banner>
      <p>ההסבר המלא נמצא בקובץ SETUP.md: יצירת הפרויקט, התחברות גוגל, והפיכת המשתמש הראשון למנהל.</p>
    </div>
  );
}

export function Forbidden() {
  return <Banner tone="warn">אין לחשבון הזה הרשאה למסך הזה.</Banner>;
}
