import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { getApi } from "../api";
import type { Detention } from "../api/types";
import { useAuth } from "../auth";
import { PageHeader } from "../components/PageHeader";
import { signatureName } from "../lib/staffName";
import { ParentWhatsApp } from "../components/ParentWhatsApp";
import { DetentionMenu } from "../components/DetentionMenu";
import { Banner, Button, Empty, Ltr, StatusPill, studentName } from "../components/ui";
import { formatTime, jerusalemToday } from "../lib/dates";

export function MyMarksPage() {
  const flash = (useLocation().state as { flash?: string } | null)?.flash ?? null;
  return (
    <div className="stack">
      <PageHeader title="היום" lede="ההשארות שסימנתם היום. מכאן שולחים עדכון להורים בוואטסאפ, עורכים או מוחקים." />
      {flash ? <Banner>{flash}</Banner> : null}
      <TodayMarks />
      <HomeroomMarks />
    </div>
  );
}

/** Today's detentions marked by me, with WhatsApp, cancel and the ⋮ edit/delete menu. */
export function TodayMarks({ heading }: { heading?: string }) {
  const { session } = useAuth();
  const [rows, setRows] = useState<Detention[]>([]);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    if (!session) return;
    const data = await getApi().listDetentions({ date: jerusalemToday(), markedBy: session.userId });
    setRows(data);
  }

  const [day, setDay] = useState(() => jerusalemToday());
  useEffect(() => {
    const timer = window.setInterval(() => setDay(jerusalemToday()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "אירעה שגיאה"));
  }, [session, day]);

  async function cancel(id: string) {
    setError(null);
    try {
      await getApi().cancelDetention(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "הביטול נכשל");
    }
  }

  return (
    <section className="stack">
      {heading ? <h2>{heading}</h2> : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {rows.length === 0 ? <Empty>עוד לא סימנתם השארות היום.</Empty> : null}
      {rows.map((row) => (
        <article key={row.id} className="card stack">
          <div className="spread">
            <strong>{studentName(row.studentFirstName, row.studentLastName)}</strong>
            <span className="row">
              <StatusPill status={row.status} />
              <DetentionMenu row={row} onChanged={load} onError={setError} />
            </span>
          </div>
          <div className="release-card">
            <span>שעת יציאה</span>
            <strong>
              <Ltr>{formatTime(row.releaseAt)}</Ltr>
            </strong>
          </div>
          <span>
            {row.className} · {row.reasonText} · {row.durationMinutes} דק׳
          </span>
          {row.status === "pending" ? (
            <ParentWhatsApp
              detentionId={row.id}
              studentName={studentName(row.studentFirstName, row.studentLastName)}
              className={row.className}
              releaseTime={formatTime(row.releaseAt)}
              reason={row.reasonText}
              teacherName={signatureName(session?.profile) || row.markerName}
            />
          ) : null}
          {row.status === "pending" ? (
            <Button variant="danger" onClick={() => void cancel(row.id)}>
              ביטול הסימון
            </Button>
          ) : null}
        </article>
      ))}
    </section>
  );
}

/** Homeroom teacher: today's detentions of my class's students that someone else marked. */
export function HomeroomMarks() {
  const { session } = useAuth();
  const [rows, setRows] = useState<Detention[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState(() => jerusalemToday());

  useEffect(() => {
    const timer = window.setInterval(() => setDay(jerusalemToday()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!session?.profile.role) return;
    let live = true;
    async function load() {
      const classes = await getApi().listClasses();
      const mine = new Set(classes.filter((room) => room.homeroomTeacherId === session!.userId).map((room) => room.id));
      if (mine.size === 0) {
        if (live) setRows(null);
        return;
      }
      const today = await getApi().listDetentions({ date: jerusalemToday() });
      if (live) {
        setRows(today.filter((row) => mine.has(row.classId) && row.markedBy !== session!.userId && row.status !== "cancelled"));
      }
    }
    void load().catch((err: unknown) => live && setError(err instanceof Error ? err.message : "אירעה שגיאה"));
    const stop = getApi().subscribeDetentions(() => void load().catch(() => undefined));
    return () => {
      live = false;
      stop();
    };
  }, [session, day]);

  if (rows === null) return null;
  return (
    <section className="stack">
      <h2>תלמידי הכיתה שלי שסומנו היום</h2>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {rows.length === 0 ? <Empty>אף תלמיד מהכיתה שלך לא סומן היום.</Empty> : null}
      {rows.map((row) => (
        <article key={row.id} className="card stack">
          <div className="spread">
            <strong>{studentName(row.studentFirstName, row.studentLastName)}</strong>
            <span className="row">
              <StatusPill status={row.status} />
            </span>
          </div>
          <div className="release-card">
            <span>שעת יציאה</span>
            <strong>
              <Ltr>{formatTime(row.releaseAt)}</Ltr>
            </strong>
          </div>
          <span>
            {row.className} · {row.reasonText} · {row.durationMinutes} דק׳ · סימן/ה {row.markerName}
          </span>
          {row.status === "pending" ? (
            <ParentWhatsApp
              detentionId={row.id}
              studentName={studentName(row.studentFirstName, row.studentLastName)}
              className={row.className}
              releaseTime={formatTime(row.releaseAt)}
              reason={row.reasonText}
              teacherName={signatureName(session?.profile)}
            />
          ) : null}
        </article>
      ))}
    </section>
  );
}
