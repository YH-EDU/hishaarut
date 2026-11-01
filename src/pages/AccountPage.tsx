import { useState } from "react";
import { getApi } from "../api";
import { ROLE_LABEL } from "../api/types";
import { useAuth } from "../auth";
import { Banner, Button, Field } from "../components/ui";
import { normalizeIlPhone } from "../lib/phone";

export function AccountPage() {
  const { session, refresh, signOut } = useAuth();
  const profile = session?.profile;
  const [fullName, setFullName] = useState(profile?.fullName ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await getApi().updateOwnProfile({ fullName, phone });
      await refresh();
      setInfo("הפרטים נשמרו");
    } catch (err) {
      setError(err instanceof Error ? err.message : "השמירה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  if (!profile) return null;

  return (
    <div className="stack">
      <h1>החשבון שלי</h1>
      <p className="muted">{profile.email}</p>
      <p>{profile.role ? ROLE_LABEL[profile.role] : "ממתין לאישור"}</p>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {info ? <Banner>{info}</Banner> : null}
      <Field label="שם מלא">
        <input value={fullName} onChange={(event) => setFullName(event.target.value)} />
      </Field>
      <Field label="טלפון נייד לקבלת הודעות">
        <input inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
      </Field>
      {phone && !normalizeIlPhone(phone) ? <Banner tone="warn">המספר לא נראה ישראלי.</Banner> : null}
      <p className="muted">המזכירות שולחת למחנך/ת הודעת וואטסאפ למספר הזה כשתלמיד מהכיתה נשאר.</p>
      <Button disabled={busy || !fullName.trim()} onClick={() => void save()}>
        שמירה
      </Button>
      <Button variant="ghost" onClick={() => void signOut()}>
        יציאה
      </Button>
    </div>
  );
}
