import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getApi } from "../api";
import type { ClassRoom, Profile, Reason, Role, SchoolSettings } from "../api/types";
import { ROLE_LABEL } from "../api/types";
import { Banner, Button, Field } from "../components/ui";

type Tab = "users" | "reasons" | "classes" | "settings";

export function AdminPage() {
  const [tab, setTab] = useState<Tab>("users");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [settings, setSettings] = useState<SchoolSettings | null>(null);

  async function load() {
    const [nextProfiles, nextClasses, nextReasons, nextSettings] = await Promise.all([
      getApi().listProfiles(),
      getApi().listClasses(),
      getApi().listReasons(),
      getApi().getSettings(),
    ]);
    setProfiles(nextProfiles);
    setClasses(nextClasses);
    setReasons(nextReasons);
    setSettings(nextSettings);
  }

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "אירעה שגיאה"));
  }, []);

  return (
    <div className="stack">
      <h1>ניהול</h1>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {info ? <Banner>{info}</Banner> : null}
      <div className="tabs">
        {(
          [
            ["users", "משתמשים"],
            ["reasons", "סיבות"],
            ["classes", "כיתות"],
            ["settings", "הגדרות"],
          ] as Array<[Tab, string]>
        ).map(([id, label]) => (
          <button key={id} type="button" className="chip" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "users"
        ? profiles.map((profile) => (
            <UserRow
              key={profile.id}
              profile={profile}
              classes={classes}
              onSaved={async (message) => {
                setInfo(message);
                await load();
              }}
              onError={setError}
            />
          ))
        : null}

      {tab === "reasons" ? (
        <ReasonsEditor
          reasons={reasons}
          onSaved={async () => {
            setInfo("הסיבות נשמרו");
            await load();
          }}
          onError={setError}
        />
      ) : null}

      {tab === "classes" ? (
        <ClassesEditor
          classes={classes}
          profiles={profiles}
          onSaved={async () => {
            setInfo("הכיתות נשמרו");
            await load();
          }}
          onError={setError}
        />
      ) : null}

      {tab === "settings" && settings ? (
        <SettingsEditor
          settings={settings}
          onSaved={async () => {
            setInfo("ההגדרות נשמרו");
            await load();
          }}
          onError={setError}
        />
      ) : null}
    </div>
  );
}

function UserRow({
  profile,
  classes,
  onSaved,
  onError,
}: {
  profile: Profile;
  classes: ClassRoom[];
  onSaved: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [role, setRole] = useState<Role | "">(profile.role ?? "");
  const [classId, setClassId] = useState(classes.find((room) => room.homeroomTeacherId === profile.id)?.id ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    onError("");
    try {
      await getApi().setUserRole(profile.id, role || null);
      if (role === "homeroom" && classId) {
        for (const room of classes) {
          const shouldOwn = room.id === classId;
          const owns = room.homeroomTeacherId === profile.id;
          if (shouldOwn === owns) continue;
          await getApi().saveClass({
            id: room.id,
            name: room.name,
            grade: room.grade ?? "",
            homeroomTeacherId: shouldOwn ? profile.id : null,
            active: room.active,
          });
        }
      }
      await onSaved("התפקיד עודכן");
    } catch (err) {
      onError(err instanceof Error ? err.message : "השמירה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card stack">
      <strong>{profile.fullName || profile.email}</strong>
      <span className="muted">{profile.email}</span>
      <Field label="תפקיד">
        <select value={role} onChange={(event) => setRole(event.target.value as Role | "")}>
          <option value="">ממתין לאישור</option>
          {(Object.keys(ROLE_LABEL) as Role[]).map((item) => (
            <option key={item} value={item}>
              {ROLE_LABEL[item]}
            </option>
          ))}
        </select>
      </Field>
      {role === "homeroom" ? (
        <Field label="כיתת חינוך">
          <select value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="">בחרו כיתה</option>
            {classes.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Button disabled={busy} onClick={() => void save()}>
        שמירה
      </Button>
    </article>
  );
}

function ReasonsEditor({
  reasons,
  onSaved,
  onError,
}: {
  reasons: Reason[];
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [label, setLabel] = useState("");

  async function add() {
    try {
      await getApi().saveReason({ label, active: true, sortOrder: (reasons.at(-1)?.sortOrder ?? 0) + 10 });
      setLabel("");
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "השמירה נכשלה");
    }
  }

  return (
    <div className="stack">
      {reasons.map((reason) => (
        <article key={reason.id} className="card spread">
          <span>{reason.label}</span>
          <Button
            variant="ghost"
            onClick={() =>
              void getApi()
                .saveReason({ ...reason, active: !reason.active })
                .then(onSaved)
                .catch((err: unknown) => onError(err instanceof Error ? err.message : "השמירה נכשלה"))
            }
          >
            {reason.active ? "הסתרה" : "הפעלה"}
          </Button>
        </article>
      ))}
      <div className="row">
        <input value={label} placeholder="סיבה חדשה" onChange={(event) => setLabel(event.target.value)} />
        <Button disabled={!label.trim()} onClick={() => void add()}>
          הוספה
        </Button>
      </div>
    </div>
  );
}

function ClassesEditor({
  classes,
  profiles,
  onSaved,
  onError,
}: {
  classes: ClassRoom[];
  profiles: Profile[];
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const homeroom = profiles.filter((profile) => profile.role === "homeroom");

  async function add() {
    try {
      await getApi().saveClass({ name, grade, homeroomTeacherId: null, active: true });
      setName("");
      setGrade("");
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "השמירה נכשלה");
    }
  }

  return (
    <div className="stack">
      {classes.map((room) => (
        <article key={room.id} className="card stack">
          <div className="spread">
            <strong>{room.name}</strong>
            <Link to={`/class/${room.id}`}>רשימת תלמידים</Link>
          </div>
          <Field label="מחנך/ת">
            <select
              value={room.homeroomTeacherId ?? ""}
              onChange={(event) => {
                const homeroomTeacherId = event.target.value || null;
                void getApi()
                  .saveClass({
                    id: room.id,
                    name: room.name,
                    grade: room.grade ?? "",
                    homeroomTeacherId,
                    active: room.active,
                  })
                  .then(onSaved)
                  .catch((err: unknown) => onError(err instanceof Error ? err.message : "השמירה נכשלה"));
              }}
            >
              <option value="">ללא</option>
              {homeroom.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.fullName}
                </option>
              ))}
            </select>
          </Field>
        </article>
      ))}
      <div className="row">
        <input value={name} placeholder="שם כיתה, למשל ז׳3" onChange={(event) => setName(event.target.value)} />
        <input value={grade} placeholder="שכבה" onChange={(event) => setGrade(event.target.value)} />
        <Button disabled={!name.trim()} onClick={() => void add()}>
          הוספת כיתה
        </Button>
      </div>
    </div>
  );
}

function SettingsEditor({
  settings,
  onSaved,
  onError,
}: {
  settings: SchoolSettings;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState(settings);

  async function save() {
    try {
      await getApi().updateSettings({
        ...draft,
        allowedEmailDomain: draft.allowedEmailDomain?.trim() || null,
        whatsappPhoneNumberId: draft.whatsappPhoneNumberId?.trim() || null,
        whatsappDisplayNumber: draft.whatsappDisplayNumber?.trim() || null,
      });
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "השמירה נכשלה");
    }
  }

  return (
    <section className="card stack">
      <Field label="שם בית הספר בהודעות">
        <input value={draft.schoolName} onChange={(event) => setDraft({ ...draft, schoolName: event.target.value })} />
      </Field>
      <Field label="דומיין גוגל מורשה">
        <input
          placeholder="school.education.gov.il"
          value={draft.allowedEmailDomain ?? ""}
          onChange={(event) => setDraft({ ...draft, allowedEmailDomain: event.target.value })}
        />
      </Field>
      <Field label="מספר הוואטסאפ העסקי שמוצג לצוות">
        <input
          value={draft.whatsappDisplayNumber ?? ""}
          onChange={(event) => setDraft({ ...draft, whatsappDisplayNumber: event.target.value })}
        />
      </Field>
      <Field label="Phone number ID לשלב 2">
        <input
          value={draft.whatsappPhoneNumberId ?? ""}
          onChange={(event) => setDraft({ ...draft, whatsappPhoneNumberId: event.target.value })}
        />
      </Field>
      <Field label="אופן שליחה">
        <select
          value={draft.notificationMode}
          onChange={(event) =>
            setDraft({ ...draft, notificationMode: event.target.value as SchoolSettings["notificationMode"] })
          }
        >
          <option value="manual_link">שלב 1: קישור wa.me מהמזכירות</option>
          <option value="cloud_api">שלב 2: Cloud API (עדיין לא ממומש)</option>
        </select>
      </Field>
      <Banner tone="warn">
        אסימון הוואטסאפ לא נשמר כאן ולא בדפדפן. בשלב 2 הוא יישמר רק כסוד של פונקציית השרת send-whatsapp, שמחזירה כרגע 501.
      </Banner>
      <Button disabled={!draft.schoolName.trim()} onClick={() => void save()}>
        שמירת הגדרות
      </Button>
    </section>
  );
}
