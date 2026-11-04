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

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "אירעה שגיאה"));
  }, [session]);

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
