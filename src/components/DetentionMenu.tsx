import { useEffect, useState } from "react";
import { getApi } from "../api";
import type { Detention, Reason } from "../api/types";
import { formatTime } from "../lib/dates";
import { Sheet } from "./Sheet";
import { Button, Field } from "./ui";

/** HH:MM (Jerusalem wall clock) on the detention's own date -> ISO. */
function releaseIsoFor(row: Detention, hhmm: string): string {
  const base = new Date(row.releaseAt);
  const current = formatTime(row.releaseAt);
  const [h1, m1] = current.split(":").map(Number);
  const [h2, m2] = hhmm.split(":").map(Number);
  return new Date(base.getTime() + ((h2 - h1) * 60 + (m2 - m1)) * 60000).toISOString();
}

/** Three-dot menu: עריכה / מחיקה. The server decides who may (marker, homeroom, admin, secretary). */
export function DetentionMenu({ row, onChanged, onError }: { row: Detention; onChanged: () => void | Promise<void>; onError: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [reasonId, setReasonId] = useState<string>(row.reasonId ?? "other");
  const [freeText, setFreeText] = useState(row.reasonId ? "" : row.reasonText);
  const [time, setTime] = useState(formatTime(row.releaseAt));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (editing && reasons.length === 0) void getApi().listReasons().then((list) => setReasons(list.filter((r) => r.active)));
  }, [editing, reasons.length]);

  const fail = (err: unknown, fallback: string) => onError(err instanceof Error ? err.message : fallback);

  async function remove() {
    setOpen(false);
    if (!window.confirm("למחוק את ההשארות? אי אפשר לבטל את המחיקה.")) return;
    try {
      await getApi().deleteDetention(row.id);
      await onChanged();
    } catch (err) {
      fail(err, "המחיקה נכשלה");
    }
  }

  async function save() {
    setBusy(true);
    try {
      const other = reasonId === "other";
      await getApi().editDetention(row.id, {
        reasonId: other ? null : reasonId,
        reasonText: other ? freeText.trim() : "",
        releaseAt: releaseIsoFor(row, time),
      });
      setEditing(false);
      await onChanged();
    } catch (err) {
      fail(err, "השמירה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="det-menu" onClick={(event) => event.stopPropagation()}>
      <button type="button" className="det-menu-btn" aria-label="פעולות" aria-expanded={open} onClick={() => setOpen(!open)}>
        ⋮
      </button>
      {open ? (
        <div className="det-menu-list" role="menu">
          {row.status === "pending" ? (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); setEditing(true); }}>
              עריכה
            </button>
          ) : null}
          <button type="button" role="menuitem" className="danger" onClick={() => void remove()}>
            מחיקה
          </button>
        </div>
      ) : null}
      {editing ? (
        <Sheet compact title="עריכת השארות" onClose={() => setEditing(false)}>
        <div className="det-edit stack">
          <Field label="סיבה">
            <select value={reasonId} onChange={(event) => setReasonId(event.target.value)}>
              {reasons.map((reason) => (
                <option key={reason.id} value={reason.id}>{reason.label}</option>
              ))}
              <option value="other">אחר</option>
            </select>
          </Field>
          {reasonId === "other" ? (
            <input value={freeText} maxLength={200} placeholder="סיבה" onChange={(event) => setFreeText(event.target.value)} />
          ) : null}
          <Field label="שעת יציאה">
            <input type="time" lang="en-GB" value={time} onChange={(event) => setTime(event.target.value)} />
          </Field>
          <span className="row">
            <Button disabled={busy || !time || (reasonId === "other" && !freeText.trim())} onClick={() => void save()}>שמירה</Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>ביטול</Button>
          </span>
        </div>
        </Sheet>
      ) : null}
    </div>
  );
}
