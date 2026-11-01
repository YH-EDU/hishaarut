import { useEffect, useState } from "react";
import { getApi } from "../api";
import type { Detention } from "../api/types";
import { useAuth } from "../auth";
import { Banner, Button, Empty, Ltr, StatusPill, studentName } from "../components/ui";
import { formatTime, jerusalemToday } from "../lib/dates";

export function MyMarksPage() {
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
    <div className="stack">
      <h1>הסימונים שלי היום</h1>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {rows.length === 0 ? <Empty>עוד לא סימנתם השארות היום.</Empty> : null}
      {rows.map((row) => (
        <article key={row.id} className="card stack">
          <div className="spread">
            <strong>{studentName(row.studentFirstName, row.studentLastName)}</strong>
            <StatusPill status={row.status} />
          </div>
          <span>
            {row.className} · {row.reasonText} · {row.durationMinutes} דק׳ · <Ltr>{formatTime(row.markedAt)}</Ltr>
          </span>
          {row.status === "pending" ? (
            <Button variant="danger" onClick={() => void cancel(row.id)}>
              ביטול הסימון
            </Button>
          ) : null}
        </article>
      ))}
    </div>
  );
}
