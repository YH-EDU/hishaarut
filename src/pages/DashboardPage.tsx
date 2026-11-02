import { useCallback, useEffect, useMemo, useState } from "react";
import { getApi } from "../api";
import type { Detention, NotificationRow, SchoolSettings } from "../api/types";
import { useAuth } from "../auth";
import { GettingStarted } from "../components/GettingStarted";
import { Sheet } from "../components/Sheet";
import { Banner, Button, Empty, Ltr } from "../components/ui";
import { classRank } from "../lib/csv";
import { formatTime, jerusalemToday } from "../lib/dates";
import { dispatchNotification } from "../lib/notifications";
import { maskPhone, whatsappUrl } from "../lib/phone";

const SKIP_LABEL: Record<string, string> = {
  no_phone: "אין מספר טלפון",
  invalid_phone: "המספר לא תקין",
  no_whatsapp: "סומן שאין וואטסאפ",
  no_homeroom: "לא שובץ מחנך/ת",
  marked_by_homeroom: "המחנך/ת סימנו בעצמם",
};

function studentLabel(row: Detention) {
  return `${row.studentFirstName} ${row.studentLastName}`;
}

function waitLabel(releaseAt: string, now: number): string | null {
  const left = new Date(releaseAt).getTime() - now;
  if (left <= 0) return null;
  const minutes = Math.max(1, Math.ceil(left / 60000));
  return `עוד ${minutes} דק׳`;
}

export function DashboardPage() {
  const [rows, setRows] = useState<Detention[]>([]);
  const [notes, setNotes] = useState<NotificationRow[]>([]);
  const [settings, setSettings] = useState<SchoolSettings | null>(null);
  const [query, setQuery] = useState("");
  const [className, setClassName] = useState("");
  const [releasedOpen, setReleasedOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const role = useAuth().session?.profile.role;
  const isAdmin = role === "admin";
  const canMessage = role === "secretary" || role === "admin";

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    const today = jerusalemToday();
    const detentions = await getApi().listDetentions({ date: today });
    const [dispatch, school] = canMessage
      ? await Promise.all([getApi().listDispatch(today), getApi().getSettings()])
      : [[], null];
    setRows(detentions);
    setNotes(dispatch);
    setSettings(school);
  }, [canMessage]);

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "אירעה שגיאה"));
    return getApi().subscribeDetentions(
      () => {
        void load().catch(() => setLive(false));
      },
      setLive,
    );
  }, [load]);

  async function complete(id: string, early = false) {
    setError(null);
    setBusyId(id);
    try {
      await getApi().completeDetention(id, early);
      await load();
      if (openId === id) setOpenId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "האישור נכשל");
    } finally {
      setBusyId(null);
    }
  }

  async function send(note: NotificationRow, phone = note.recipientPhone ?? null) {
    if (!settings) return;
    setError(null);
    setInfo(null);
    setFallback(null);
    setBusyId(note.id);
    try {
      const result = await dispatchNotification({
        mode: settings.notificationMode,
        phone,
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

  const classes = useMemo(
    () => [...new Set(rows.map((row) => row.className))].sort((a, b) => classRank(a).localeCompare(classRank(b), "he")),
    [rows],
  );
  const visible = useMemo(() => {
    const q = query.trim();
    return rows.filter((row) => {
      if (className && row.className !== className) return false;
      if (!q) return true;
      return `${row.studentFirstName} ${row.studentLastName} ${row.className} ${row.reasonText}`.includes(q);
    });
  }, [rows, query, className]);

  const ready = visible
    .filter((row) => row.status === "pending" && !waitLabel(row.releaseAt, now))
    .sort((a, b) => a.releaseAt.localeCompare(b.releaseAt));
  const upcoming = visible
    .filter((row) => row.status === "pending" && waitLabel(row.releaseAt, now))
    .sort((a, b) => a.releaseAt.localeCompare(b.releaseAt));
  const released = visible
    .filter((row) => row.status === "completed")
    .sort((a, b) => b.releaseAt.localeCompare(a.releaseAt));
  const filtered = Boolean(query.trim() || className);

  async function releaseReady() {
    const ids = ready.map((row) => row.id);
    setConfirmAll(false);
    setError(null);
    setInfo(null);
    setBusyId("all");
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await getApi().completeDetention(id);
      } catch (err) {
        failed.push(err instanceof Error ? err.message : "האישור נכשל");
      }
    }
    try {
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "אירעה שגיאה");
    }
    setBusyId(null);
    if (failed.length > 0) setError(failed[0]);
    else setInfo(`שוחררו ${ids.length} תלמידים`);
  }

  function parentNote(row: Detention) {
    return notes.find((note) => note.detentionId === row.id && note.recipientType === "parent" && note.event === "marked");
  }

  function whatsappLink(row: Detention) {
    if (!canMessage) return null;
    const note = parentNote(row);
    const phone = note?.recipientPhone;
    if (!phone || !note) return null;
    return whatsappUrl(phone, note.messageBody);
  }

  const open = rows.find((row) => row.id === openId) ?? null;
  const openNotes = open ? notes.filter((note) => note.detentionId === open.id) : [];

  return (
    <div className="stack release-screen">
      <header className="release-head">
        <div>
          <h1>שחרורים</h1>
          <p className="release-counts">
            <span>
              <b>{ready.length}</b> מוכנים
            </span>
            <span>
              <b>{upcoming.length}</b> בהמתנה
            </span>
            <span>
              <b>{released.length}</b> שוחררו
            </span>
            {live ? <span>מתעדכן</span> : null}
          </p>
        </div>
        {ready.length > 0 ? (
          <Button disabled={busyId === "all"} onClick={() => setConfirmAll(true)}>
            {busyId === "all" ? "משחררים…" : `שחרור כל המוכנים (${ready.length})`}
          </Button>
        ) : null}
      </header>
      {rows.length === 0 ? <GettingStarted /> : null}
      <div className="toolbar sticky-search release-tools">
        <input value={query} placeholder="חיפוש לפי שם" aria-label="חיפוש תלמיד" onChange={(event) => setQuery(event.target.value)} />
        <div className="class-filters" role="group" aria-label="סינון כיתה">
          <button type="button" aria-pressed={className === ""} onClick={() => setClassName("")}>
            כל הכיתות
          </button>
          {classes.map((name) => (
            <button key={name} type="button" aria-pressed={className === name} onClick={() => setClassName(name)}>
              {name}
            </button>
          ))}
        </div>
      </div>
      {filtered ? (
        <p className="muted tight">
          מציג {visible.length} מתוך {rows.length}
        </p>
      ) : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {info ? <Banner>{info}</Banner> : null}
      {fallback ? (
        <a className="btn btn-ghost" href={fallback} target="_blank" rel="noreferrer">
          אם החלון נחסם, פתחו את הקישור כאן
        </a>
      ) : null}
      {settings?.notificationMode === "cloud_api" ? <Banner tone="warn">שליחה אוטומטית עדיין לא פעילה.</Banner> : null}

      <div className="desktop-only">
        <table className={canMessage ? "release-table" : "release-table no-wa"}>
          <thead>
            <tr>
              <th>תלמיד</th>
              <th>כיתה</th>
              <th>יציאה</th>
              <th>סיבה</th>
              <th aria-label="וואטסאפ" />
              <th aria-label="שחרור" />
            </tr>
          </thead>
          <tbody>
            <SectionRow title="מוכנים לשחרור" count={ready.length} tone="ready" />
            {ready.length === 0 ? (
              <tr>
                <td className="muted" colSpan={6}>
                  אף אחד לא ממתין לשחרור עכשיו.
                </td>
              </tr>
            ) : (
              ready.map((row) => (
                <ReleaseTableRow
                  key={row.id}
                  row={row}
                  now={now}
                  link={whatsappLink(row)}
                  busy={busyId === row.id || busyId === "all"}
                  onOpen={() => setOpenId(row.id)}
                  onRelease={() => void complete(row.id)}
                />
              ))
            )}
            <SectionRow title="עוד לא הגיע הזמן" count={upcoming.length} />
            {upcoming.map((row) => (
              <ReleaseTableRow
                key={row.id}
                row={row}
                now={now}
                link={whatsappLink(row)}
                busy={busyId === row.id || busyId === "all"}
                onOpen={() => setOpenId(row.id)}
                onRelease={() => void complete(row.id)}
              />
            ))}
            <tr className="section">
              <td colSpan={6}>
                <button type="button" className="section-toggle" onClick={() => setReleasedOpen((value) => !value)}>
                  שוחררו · {released.length}
                  <span aria-hidden="true">{releasedOpen ? "▴" : "▾"}</span>
                </button>
              </td>
            </tr>
            {releasedOpen
              ? released.map((row) => (
                  <ReleaseTableRow
                    key={row.id}
                    row={row}
                    now={now}
                    link={whatsappLink(row)}
                    busy={false}
                    onOpen={() => setOpenId(row.id)}
                    onRelease={() => void complete(row.id)}
                  />
                ))
              : null}
          </tbody>
        </table>
      </div>

      <div className="phone-only release-phone">
        <section>
          <h2 className="section-label ready">מוכנים לשחרור · {ready.length}</h2>
          <div className="release-list">{ready.map((row) => phoneRow(row))}</div>
          {ready.length === 0 ? <p className="muted tight">אף אחד לא ממתין לשחרור עכשיו.</p> : null}
        </section>
        <section>
          <h2 className="section-label">עוד לא הגיע הזמן · {upcoming.length}</h2>
          {upcoming.length > 0 ? <div className="release-list">{upcoming.map((row) => phoneRow(row))}</div> : null}
        </section>
        <section>
          <button type="button" className="section-toggle" onClick={() => setReleasedOpen((value) => !value)}>
            שוחררו · {released.length}
            <span aria-hidden="true">{releasedOpen ? "▴" : "▾"}</span>
          </button>
          {releasedOpen ? <div className="release-list">{released.map((row) => phoneRow(row))}</div> : null}
        </section>
      </div>

      {rows.length === 0 ? <Empty>אין השארות להיום.</Empty> : null}

      {confirmAll ? (
        <Sheet confirm title="שחרור כל המוכנים" onClose={() => setConfirmAll(false)}>
          <div className="stack">
            <p>
              לשחרר {ready.length} תלמידים ששעת היציאה שלהם כבר עברה
              {className ? ` מכיתה ${className}` : ""}
              {query.trim() ? " לפי החיפוש" : ""}?
            </p>
            <Button disabled={busyId === "all"} onClick={() => void releaseReady()}>
              שחרור
            </Button>
            <Button variant="ghost" onClick={() => setConfirmAll(false)}>
              ביטול
            </Button>
          </div>
        </Sheet>
      ) : null}

      {open ? (
        <Sheet compact title={studentLabel(open)} onClose={() => setOpenId(null)}>
          <div className="stack">
            <p className="muted">
              {open.className} · {open.reasonText} · {open.durationMinutes} דק׳ · יציאה <Ltr>{formatTime(open.releaseAt)}</Ltr>
            </p>
            {open.notes ? <p>{open.notes}</p> : null}
            <p className="muted">סימן {open.markerName}</p>
            {open.status === "completed" ? <ReleasedBy row={open} /> : null}
            {canMessage
              ? openNotes.map((note) => (
              <div key={note.id} className="stack">
                <span>
                  {note.recipientType === "parent" ? "הורה" : "מחנך/ת"}
                  {note.recipientLabel ? ` · ${note.recipientLabel}` : ""}
                  {note.status === "skipped" ? ` · ${SKIP_LABEL[note.errorText ?? ""] ?? "לא נשלח"}` : ""}
                </span>
                {[note.recipientPhone, ...(note.fallbackPhones ?? [])]
                  .filter((phone): phone is string => Boolean(phone))
                  .map((phone) => (
                    <Button key={phone} variant="ghost" onClick={() => void send(note, phone)}>
                      וואטסאפ <Ltr>{maskPhone(phone)}</Ltr>
                    </Button>
                  ))}
              </div>
            ))
              : null}
            {open.status === "pending" && !waitLabel(open.releaseAt, now) ? (
              <Button disabled={busyId === open.id} onClick={() => void complete(open.id)}>
                שחרור
              </Button>
            ) : null}
            {open.status === "pending" && isAdmin && waitLabel(open.releaseAt, now) ? (
              <Button variant="warn" onClick={() => void complete(open.id, true)}>
                שחרור מוקדם, נרשם על שמי
              </Button>
            ) : null}
          </div>
        </Sheet>
      ) : null}
    </div>
  );

  function phoneRow(row: Detention) {
    const waiting = waitLabel(row.releaseAt, now);
    const link = whatsappLink(row);
    return (
      <div
        key={row.id}
        className={`release-row${canMessage ? "" : " no-wa"}${row.status === "completed" ? " is-done" : ""}`}
        onClick={() => setOpenId(row.id)}
      >
        <span className="who">
          <b>{studentLabel(row)}</b>
          <span className="klass">{row.className}</span>
        </span>
        <TimeChip waiting={waiting} releaseAt={row.releaseAt} />
        {row.status === "completed" ? (
          <ReleasedBy row={row} />
        ) : (
          <>
            {canMessage ? link ? <WaLink href={link} /> : <span className="wa-gap" /> : null}
            <ReleaseControl row={row} waiting={waiting} busy={busyId === row.id || busyId === "all"} onRelease={() => void complete(row.id)} />
          </>
        )}
      </div>
    );
  }
}

function SectionRow({ title, count, tone }: { title: string; count: number; tone?: "ready" }) {
  return (
    <tr className={tone === "ready" ? "section ready" : "section"}>
      <td colSpan={6}>
        {title} · {count}
      </td>
    </tr>
  );
}

function ReleaseTableRow({
  row,
  now,
  link,
  busy,
  onOpen,
  onRelease,
}: {
  row: Detention;
  now: number;
  link: string | null;
  busy: boolean;
  onOpen: () => void;
  onRelease: () => void;
}) {
  const waiting = waitLabel(row.releaseAt, now);
  const ready = row.status === "pending" && !waiting;
  return (
    <tr className={ready ? "is-ready" : undefined} onClick={onOpen}>
      <td className="name">{studentLabel(row)}</td>
      <td className="klass">{row.className}</td>
      <td>
        <TimeChip waiting={waiting} releaseAt={row.releaseAt} />
      </td>
      <td className="reason" title={row.reasonText}>
        {row.reasonText}
      </td>
      <td>{link ? <WaLink href={link} /> : null}</td>
      <td>
        <ReleaseControl row={row} waiting={waiting} busy={busy} onRelease={onRelease} />
      </td>
    </tr>
  );
}

function TimeChip({ waiting, releaseAt }: { waiting: string | null; releaseAt: string }) {
  return <span className={waiting ? "time-chip" : "time-chip ready"}>{waiting ?? <Ltr>{formatTime(releaseAt)}</Ltr>}</span>;
}

function WaLink({ href }: { href: string }) {
  return (
    <a className="wa-mini" href={href} target="_blank" rel="noreferrer" aria-label="וואטסאפ" onClick={(event) => event.stopPropagation()}>
      <WaGlyph />
    </a>
  );
}

function ReleasedBy({ row }: { row: Detention }) {
  const name = row.releaserName || row.signerName;
  if (row.status !== "completed" || !name || !row.signedAt) return <span className="released-label">שוחרר</span>;
  return (
    <span className="released-by">
      שוחרר על ידי {name} בשעה <Ltr>{formatTime(row.signedAt)}</Ltr>
    </span>
  );
}

function ReleaseControl({
  row,
  waiting,
  busy,
  onRelease,
}: {
  row: Detention;
  waiting: string | null;
  busy: boolean;
  onRelease: () => void;
}) {
  if (row.status !== "pending") return <ReleasedBy row={row} />;
  return (
    <button
      type="button"
      className="rel-btn"
      disabled={Boolean(waiting) || busy}
      onClick={(event) => {
        event.stopPropagation();
        onRelease();
      }}
    >
      שחרור
    </button>
  );
}

function WaGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12.04 2C6.58 2 2.15 6.4 2.15 11.83c0 1.74.46 3.44 1.34 4.94L2 22l5.39-1.41a10 10 0 0 0 4.65 1.18h.01c5.46 0 9.89-4.4 9.89-9.83C21.94 6.4 17.5 2 12.04 2zm5.76 13.85c-.24.68-1.4 1.25-1.93 1.33-.49.07-1.1.1-1.78-.11-.41-.13-.94-.3-1.62-.59-2.85-1.23-4.7-4.1-4.84-4.29-.14-.19-1.15-1.53-1.15-2.92s.73-2.07 1-2.35c.24-.28.64-.41.85-.41.21 0 .42 0 .6.01.19.01.45-.07.7.54.26.61.88 2.1.96 2.25.08.16.13.34.03.54-.1.2-.16.33-.31.51-.16.18-.33.4-.47.54-.16.16-.32.33-.14.64.19.31.83 1.37 1.78 2.22 1.23 1.09 2.26 1.43 2.58 1.59.32.16.5.13.69-.08.19-.21.8-.93 1.01-1.25.21-.32.43-.26.72-.16.29.1 1.84.87 2.16 1.03.32.16.53.24.61.37.08.13.08.76-.16 1.44z"
      />
    </svg>
  );
}
