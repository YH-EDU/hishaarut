import { useEffect, useState } from "react";
import type { ClassRoom, Role } from "../api/types";
import { getApi } from "../api";
import { roleLabel } from "../api/types";
import { useAuth } from "../auth";
import { Banner, Button, Field } from "../components/ui";
import { normalizeIlPhone } from "../lib/phone";
import { TitlePicker } from "../components/TitlePicker";
import { isFullName } from "../lib/staffName";

export function AccountPage() {
  const { session, refresh, signOut } = useAuth();
  const profile = session?.profile;
  const [fullName, setFullName] = useState(profile?.fullName ?? "");
  const [title, setTitle] = useState(profile?.title ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await getApi().updateOwnProfile({ fullName: fullName.trim(), phone, title: title.trim() || null });
      await refresh();
      setInfo("הפרטים נשמרו");
    } catch (err) {
      setError(err instanceof Error ? err.message : "השמירה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  if (!profile) return null;

  const phoneBad = Boolean(phone) && !normalizeIlPhone(phone);

  return (
    <div className="stack account-page">
      <header className="page-head">
        <h1>החשבון שלי</h1>
        <p className="muted">
          <bdi className="ltr">{profile.email}</bdi> · {roleLabel(profile)}
        </p>
      </header>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {info ? <Banner>{info}</Banner> : null}
      <section className="panel stack" aria-labelledby="acc-details">
        <h2 id="acc-details">פרטים אישיים</h2>
        <Field label="שם פרטי ומשפחה">
          <input autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} />
        </Field>
        <Field label="תואר (מופיע רק בחתימה בהודעות להורים)">
          <TitlePicker value={title} onChange={setTitle} />
        </Field>
        <Field label="טלפון נייד">
          <input
            className="ltr"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            aria-invalid={phoneBad || undefined}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </Field>
        {phoneBad ? <Banner tone="warn">המספר לא נראה ישראלי.</Banner> : null}
        <p className="muted">למספר הזה נשלחת הודעת וואטסאפ כשתלמיד מהכיתה שלך נשאר.</p>
        <Button disabled={busy || !isFullName(fullName)} onClick={() => void save()}>
          שמירת הפרטים
        </Button>
      </section>
      {profile.role === "teacher" || profile.role === "homeroom" || profile.role === "admin" ? (
        <MyTeaching userId={profile.id} role={profile.role} onSaved={refresh} />
      ) : null}
      <Button variant="ghost" onClick={() => void signOut()}>
        יציאה מהחשבון
      </Button>
    </div>
  );
}

/** Teacher <-> homeroom switch (with one class). Admin/owner keep their role and may only set their own class. */
function MyTeaching({ userId, role, onSaved }: { userId: string; role: Role; onSaved: () => Promise<void> | void }) {
  const isAdmin = role === "admin";
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [choice, setChoice] = useState<"teacher" | "homeroom">(role === "teacher" ? "teacher" : "homeroom");
  const [classId, setClassId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);

  useEffect(() => {
    void getApi()
      .listClasses()
      .then((rooms) => {
        setClasses(rooms.filter((room) => room.active));
        setClassId(rooms.find((room) => room.homeroomTeacherId === userId)?.id ?? "");
      })
      .catch(() => setClasses([]));
  }, [userId]);

  const mine = classes.find((room) => room.homeroomTeacherId === userId)?.id ?? "";
  const room = classes.find((item) => item.id === classId);
  const taken = room?.homeroomTeacherId && room.homeroomTeacherId !== userId;
  const needsClass = !isAdmin && choice === "homeroom";
  const changed = isAdmin ? classId !== mine : choice !== role || (choice === "homeroom" && classId !== mine);

  async function save() {
    if (taken && !window.confirm(`לכיתה ${room?.name} כבר רשום מחנך. להחליף אותו?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await getApi().setMyTeaching(isAdmin ? "homeroom" : choice, isAdmin || choice === "homeroom" ? classId || null : null);
      await onSaved();
      setMessage({ tone: "ok", text: "עודכן" });
    } catch (err) {
      setMessage({ tone: "danger", text: err instanceof Error ? err.message : "השמירה נכשלה" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel stack">
      <h2>{isAdmin ? "כיתת החינוך שלי" : "התפקיד שלי"}</h2>
      <p className="muted">{isAdmin ? "מנהל יכול להיות גם מחנך של כיתה אחת." : "מחנך בוחר כיתה אחת. השינוי נכנס לתוקף מיד."}</p>
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      {!isAdmin ? (
        <div className="row" role="group" aria-label="תפקיד">
          <Button aria-pressed={choice === "teacher"} variant={choice === "teacher" ? "primary" : "ghost"} onClick={() => setChoice("teacher")}>מורה מקצועי</Button>
          <Button aria-pressed={choice === "homeroom"} variant={choice === "homeroom" ? "primary" : "ghost"} onClick={() => setChoice("homeroom")}>מחנך</Button>
        </div>
      ) : null}
      {isAdmin || choice === "homeroom" ? (
        <Field label="כיתה">
          <select value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="">{isAdmin ? "בלי כיתה" : "בחרו כיתה"}</option>
            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.homeroomTeacherId && item.homeroomTeacherId !== userId ? " (יש מחנך)" : ""}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {taken ? <Banner tone="warn">לכיתה {room?.name} כבר רשום מחנך. שמירה תחליף אותו.</Banner> : null}
      <Button disabled={busy || !changed || (needsClass && !classId)} onClick={() => void save()}>
        עדכון התפקיד
      </Button>
    </section>
  );
}
