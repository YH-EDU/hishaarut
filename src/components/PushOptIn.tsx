import { useEffect, useState } from "react";
import { disablePush, enablePush, pushState, type PushState } from "../lib/push";
import { Banner, Button } from "./ui";

/** החשבון שלי: turn phone notifications on/off for this device. */
export function PushOptIn() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void pushState().then(setState).catch(() => setState("unsupported"));
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "הפעולה נכשלה");
    } finally {
      setState(await pushState().catch(() => "unsupported" as const));
      setBusy(false);
    }
  }

  if (!state) return null;
  return (
    <section className="panel stack" aria-labelledby="acc-push">
      <h2 id="acc-push">התראות לטלפון</h2>
      <p className="muted">מחנכים מקבלים התראה כשתלמיד מהכיתה שלהם מסומן, משתחרר או לא מגיע להשארות.</p>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {state === "ios-needs-install" ? (
        <Banner tone="warn">
          באייפון: פתחו את האתר בספארי, לחצו על כפתור השיתוף ואז "הוסף למסך הבית". פתחו את האפליקציה מהמסך הבית וחזרו לכאן. (נדרש iOS 16.4 ומעלה)
        </Banner>
      ) : null}
      {state === "unsupported" ? <Banner tone="warn">הדפדפן הזה לא תומך בהתראות. נסו בכרום או מהאפליקציה שהותקנה במסך הבית.</Banner> : null}
      {state === "denied" ? <Banner tone="warn">ההתראות חסומות בדפדפן. אפשרו התראות לאתר בהגדרות הדפדפן ונסו שוב.</Banner> : null}
      {state === "off" ? (
        <Button disabled={busy} onClick={() => void run(enablePush)}>
          {busy ? "מפעילים…" : "הפעל התראות לטלפון"}
        </Button>
      ) : null}
      {state === "on" ? (
        <>
          <p>ההתראות פעילות במכשיר הזה.</p>
          <Button variant="ghost" disabled={busy} onClick={() => void run(disablePush)}>
            כיבוי התראות במכשיר הזה
          </Button>
        </>
      ) : null}
    </section>
  );
}
