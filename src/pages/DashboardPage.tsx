import { useCallback, useEffect, useState } from "react";
import { getApi } from "../api";
import type { Detention, NotificationRow, SchoolSettings } from "../api/types";
import { GettingStarted } from "../components/GettingStarted";
import { PageHeader } from "../components/PageHeader";
import { Banner, Button, Empty, Ltr, StatusPill, studentName } from "../components/ui";
import { formatTime, jerusalemToday } from "../lib/dates";
import { dispatchNotification } from "../lib/notifications";
import { maskPhone } from "../lib/phone";

const SKIP_LABEL: Record<string, string> = {
  no_phone: "אין מספר טלפון",
  invalid_phone: "המספר לא תקין",
  no_homeroom: "לא שובץ מחנך/ת",
  marked_by_homeroom: "המחנך/ת סימנו בעצמם",
};

function recipientTitle(note: NotificationRow): string {
  return note.recipientType === "parent" ? "הורה" : "מחנך/ת";
}

export function DashboardPage() {
  const [rows, setRows] = useState<Detention[]>([]);
  const [notes, setNotes] = useState<NotificationRow[]>([]);
  const [settings, setSettings] = useState<SchoolSettings | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const today = jerusalemToday();
    const [detentions, dispatch, school] = await Promise.all([
      getApi().listDetentions({ date: today }),
      getApi().listDispatch(today),
      getApi().getSettings(),
    ]);
    setRows(detentions);
    setNotes(dispatch);
    setSettings(school);
  }, []);

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "אירעה שגיאה"));
    return getApi().subscribeDetentions(
      () => {
        void load().catch(() => setLive(false));
      },
      setLive,
    );
  }, [load]);

  async function complete(id: string) {
    setError(null);
    setBusyId(id);
    try {
      await getApi().completeDetention(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "האישור נכשל");
    } finally {
      setBusyId(null);
    }
  }

  async function send(note: NotificationRow) {
    if (!settings) return;
    setError(null);
    setInfo(null);
    setFallback(null);
    setBusyId(note.id);
    try {
      const result = await dispatchNotification({
        mode: settings.notificationMode,
        phone: note.recipientPhone ?? null,
        message: note.messageBody,
        notificationId: note.id,
        event: note.event,
        recipientType: note.recipientType,
        accessToken: await getApi().getAccessToken(),
      });
      if (result.kind === "manual" || result.kind === "sent") {
        if (result.kind === "manual") window.open(result.url, "_blank", "noopener,noreferrer");
        await getApi().setNotificationSent(note.id, true);
        setInfo(result.kind === "sent" ? "השליחה האוטומטית הצליחה" : "נפתח וואטסאפ וסומן כנשלח");
        setFallback(result.kind === "manual" ? result.url : null);
      } else {
        setError(result.message);
        setFallback(result.fallbackUrl);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "השליחה נכשלה");
    } finally {
      setBusyId(null);
    }
  }

  async function undo(id: string) {
    setError(null);
    try {
      await getApi().setNotificationSent(id, false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "העדכון נכשל");
    }
  }

  const pending = rows.filter((row) => row.status === "pending");
  const completed = rows.filter((row) => row.status === "completed");
  const cancelled = rows.filter((row) => row.status === "cancelled");

  function card(row: Detention) {
    const related = notes.filter((note) => note.detentionId === row.id);
    return (
      <article key={row.id} className="card stack">
        <div className="spread">
          <div>
            <strong>{studentName(row.studentFirstName, row.studentLastName)}</strong>
            <div className="muted">
              {row.className} · <Ltr>{formatTime(row.markedAt)}</Ltr> · {row.markerName}
            </div>
          </div>
          <StatusPill status={row.status} />
        </div>
        <div>
          {row.reasonText} · {row.durationMinutes} דקות
        </div>
        {row.notes ? <div className="muted">הערה פנימית: {row.notes}</div> : null}
        {row.status === "pending" ? (
          <Button block disabled={busyId === row.id} onClick={() => void complete(row.id)}>
            סיים, בדרכו הביתה
          </Button>
        ) : null}
        <div className="stack">
          {related.map((note) => (
            <div key={note.id} className="stack">
              <div className="spread">
                <span>
                  {note.event === "completed" ? "סיום" : "סימון"} · {recipientTitle(note)}
                  {note.recipientLabel ? ` · ${note.recipientLabel}` : ""} · <Ltr>{maskPhone(note.recipientPhone)}</Ltr>
                </span>
                <span className={note.status === "sent" ? "badge badge-done" : "badge"}>
                  {note.status === "sent" ? "נשלח" : note.status === "skipped" ? "לא נשלח" : "ממתין"}
                </span>
              </div>
              {note.status === "skipped" ? (
                <span className="muted">{SKIP_LABEL[note.errorText ?? ""] ?? "לא נשלח"}</span>
              ) : (
                <div className="row">
                  <Button variant={note.status === "sent" ? "ghost" : "primary"} disabled={busyId === note.id} onClick={() => void send(note)}>
                    {note.status === "sent" ? "פתיחה מחדש" : `וואטסאפ ל${recipientTitle(note)}`}
                  </Button>
                  {note.status === "sent" ? (
                    <Button variant="ghost" onClick={() => void undo(note.id)}>
                      בטל סימון
                    </Button>
                  ) : null}
                </div>
              )}
              <details className="preview">
                <summary>נוסח ההודעה</summary>
                <pre>{note.messageBody}</pre>
              </details>
            </div>
          ))}
        </div>
      </article>
    );
  }

  return (
    <div className="stack">
      <div className="spread">
        <PageHeader
          title="היום"
          lede="רשימת ההשארות של היום. מאשרים שהתלמיד סיים, ושולחים להורה ולמחנך מהמספר העסקי של בית הספר."
        />
        <span className="badge badge-live">
          <span className={live ? "live-dot" : "live-dot off"} /> {live ? "מתעדכן" : "רענון ידני"}
        </span>
      </div>
      <GettingStarted />
      <p className="muted">
        פותחים את הוואטסאפ מהמכשיר שמחובר למספר העסקי
        {settings?.whatsappDisplayNumber ? ` (${settings.whatsappDisplayNumber})` : ""}.
      </p>
      {settings?.notificationMode === "cloud_api" ? (
        <Banner tone="warn">שליחה אוטומטית עדיין לא פעילה. הקישור הידני נשאר זמין.</Banner>
      ) : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {info ? <Banner>{info}</Banner> : null}
      {fallback ? (
        <a className="btn btn-ghost" href={fallback} target="_blank" rel="noreferrer">
          אם החלון נחסם, פתחו את הקישור כאן
        </a>
      ) : null}
      <div className="summary">
        <div>
          <strong>{pending.length}</strong>
          ממתינים
        </div>
        <div>
          <strong>{rows.filter((row) => row.status === "completed").length}</strong>
          סיימו
        </div>
        <div>
          <strong>{rows.length}</strong>
          סה״כ
        </div>
      </div>
      {pending.map(card)}
      {completed.map(card)}
      {cancelled.length > 0 ? (
        <Button variant="ghost" onClick={() => setShowDone((value) => !value)}>
          {showDone ? "הסתרת ביטולים" : `הצגת ביטולים (${cancelled.length})`}
        </Button>
      ) : null}
      {showDone ? cancelled.map(card) : null}
      {rows.length === 0 ? <Empty>אין השארות להיום.</Empty> : null}
    </div>
  );
}
