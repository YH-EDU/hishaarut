import { useEffect, useMemo, useState } from "react";
import { getApi } from "../api";
import type { ClassRoom, Profile, Role } from "../api/types";
import { ROLE_LABEL } from "../api/types";
import { useAuth } from "../auth";
import { EmptyState, PageHeader } from "../components/PageHeader";
import { Sheet } from "../components/Sheet";
import { Banner, Button, Field } from "../components/ui";
import { TitlePicker } from "../components/TitlePicker";
import { isFullName, titledName } from "../lib/staffName";

const STAFF_ROLES: Array<Role | ""> = ["", "teacher", "homeroom", "secretary"];

export function StaffPage() {
  const { session } = useAuth();
  const isAdmin = session?.profile.role === "admin";
  const isOwner = session?.profile.isOwner === true;
  const canEdit = isAdmin || session?.profile.role === "secretary";
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [query, setQuery] = useState("");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { role: Role | ""; classId: string }>>({});

  async function load() {
    const [nextProfiles, nextClasses] = await Promise.all([getApi().listProfiles(), getApi().listClasses()]);
    setProfiles(nextProfiles);
    setClasses(nextClasses);
  }

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "אירעה שגיאה"));
  }, []);

  const rows = useMemo(() => {
    const q = query.trim();
    return [...profiles]
      .filter((profile) => !q || `${profile.fullName} ${profile.email}`.includes(q))
      .sort((a, b) => (a.fullName || a.email).localeCompare(b.fullName || b.email, "he") * sortDir);
  }, [profiles, query, sortDir]);

  function draftFor(profile: Profile) {
    return (
      drafts[profile.id] ?? {
        role: profile.role ?? "",
        classId: classes.find((room) => room.homeroomTeacherId === profile.id)?.id ?? "",
      }
    );
  }

  async function save(profile: Profile) {
    const draft = draftFor(profile);
    setError(null);
    try {
      const target = classes.find((room) => room.id === draft.classId);
      if (
        draft.role === "homeroom" &&
        target?.homeroomTeacherId &&
        target.homeroomTeacherId !== profile.id &&
        !window.confirm(`לכיתה ${target.name} כבר רשום מחנך. להחליף אותו?`)
      ) {
        return;
      }
      await getApi().setUserRole(profile.id, draft.role || null);
      if (draft.role === "homeroom") {
        for (const room of classes) {
          const shouldOwn = room.id === draft.classId;
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
      setInfo("התפקיד נשמר");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "השמירה נכשלה");
    }
  }

  return (
    <div className="stack">
      <PageHeader
        title="צוות"
        lede={
          canEdit
            ? "מאשרים בקשות של מורים ומחנכים, ומשייכים גם מזכירות. רק מנהל יכול למנות מנהל, ורק הבעלים יכול להעביר בעלות."
            : "רשימת הצוות. אישור תפקידים נעשה אצל המנהל או המזכירות."
        }
      />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {info ? <Banner>{info}</Banner> : null}
      <div className="sticky-search">
        <input value={query} placeholder="חיפוש לפי שם או מייל" onChange={(event) => setQuery(event.target.value)} />
      </div>
      {canEdit ? <ApprovalList profiles={profiles} classes={classes} onChanged={load} onError={setError} onInfo={setInfo} /> : null}
      {isOwner ? (
        <OwnerTransfer
          admins={profiles.filter((profile) => profile.role === "admin" && !profile.isOwner)}
          onChanged={load}
          onError={setError}
          onInfo={setInfo}
        />
      ) : null}
      {profiles.length <= 1 ? (
        <EmptyState title="עדיין רק אתם ברשימה" detail="ברגע שמורה נכנס עם חשבון גוגל, הוא מופיע כאן ומחכים שתתנו לו תפקיד." />
      ) : (
        <>
        <div className="phone-only list">
          {rows.map((profile) => {
            const room = classes.find((item) => item.homeroomTeacherId === profile.id);
            return (
              <button key={profile.id} type="button" className="person-card" onClick={() => setOpenId(profile.id)}>
                <span>
                  <b>
                    {profile.fullName || profile.email}
                    {profile.isOwner ? <span className="owner-badge">בעלים</span> : null}
                  </b>
                  <span className="muted">
                    {profile.role ? ROLE_LABEL[profile.role] : "ממתין לאישור"}
                    {room ? ` · ${room.name}` : ""}
                  </span>
                </span>
                <span className="badge">{profile.phone ? "יש טלפון" : "אין טלפון"}</span>
              </button>
            );
          })}
        </div>
        <div className="table-scroll desktop-only">
          <table className="data-table">
            <thead>
              <tr>
                <th>
                  <button type="button" onClick={() => setSortDir((dir) => (dir === 1 ? -1 : 1))}>
                    שם
                  </button>
                </th>
                <th>מייל</th>
                <th>תפקיד</th>
                <th>כיתת חינוך</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((profile) => {
                const locked = !canEdit || profile.isOwner || (profile.role === "admin" && !isAdmin);
                const draft = draftFor(profile);
                const options = isAdmin ? ([...STAFF_ROLES, "admin"] as Array<Role | "">) : STAFF_ROLES;
                return (
                  <tr key={profile.id}>
                    <td>
                      {profile.fullName ? titledName(profile) : "—"}
                      {profile.isOwner ? <span className="owner-badge">בעלים</span> : null}
                    </td>
                    <td className="ltr">{profile.email}</td>
                    <td>
                      {locked ? (
                        profile.role ? ROLE_LABEL[profile.role] : "ממתין לאישור"
                      ) : (
                        <select
                          value={draft.role}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [profile.id]: { ...draft, role: event.target.value as Role | "" },
                            }))
                          }
                        >
                          <option value="">ממתין לאישור</option>
                          {options.filter(Boolean).map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABEL[role as Role]}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      {draft.role === "homeroom" && !locked ? (
                        <select
                          value={draft.classId}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [profile.id]: { ...draft, classId: event.target.value },
                            }))
                          }
                        >
                          <option value="">בחרו כיתה</option>
                          {classes.map((room) => (
                            <option key={room.id} value={room.id}>
                              {room.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {locked ? (
                        <span className="muted">{profile.isOwner ? "בעלים" : "רק מנהל"}</span>
                      ) : (
                        <Button variant="ghost" onClick={() => void save(profile)}>
                          שמירה
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
      {openId
        ? rows
            .filter((profile) => profile.id === openId)
            .map((profile) => {
              const locked = !canEdit || profile.isOwner || (profile.role === "admin" && !isAdmin);
              const draft = draftFor(profile);
              const options = isAdmin ? ([...STAFF_ROLES, "admin"] as Array<Role | "">) : STAFF_ROLES;
              return (
                <Sheet key={profile.id} full title="איש צוות" onClose={() => setOpenId(null)}>
                  <div className="stack">
                    <p>
                      <strong>
                        {profile.fullName || "—"}
                        {profile.isOwner ? <span className="owner-badge">בעלים</span> : null}
                      </strong>
                      <br />
                      <span className="ltr muted">{profile.email}</span>
                    </p>
                    {locked ? (
                      <p>
                        {profile.isOwner
                          ? "בעל המערכת. אי אפשר לשנות את התפקיד, ורק הבעלים יכול להעביר את הבעלות."
                          : canEdit
                            ? `תפקיד: ${ROLE_LABEL.admin}. רק מנהל יכול לשנות אותו.`
                            : `תפקיד: ${profile.role ? ROLE_LABEL[profile.role] : "ממתין לאישור"}.`}
                      </p>
                    ) : (
                      <>
                        <NameEditor profile={profile} onSaved={load} onError={setError} onInfo={setInfo} />
                        <Field label="תפקיד">
                          <select
                            value={draft.role}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [profile.id]: { ...draft, role: event.target.value as Role | "" },
                              }))
                            }
                          >
                            <option value="">ממתין לאישור</option>
                            {options.filter(Boolean).map((item) => (
                              <option key={item} value={item}>
                                {ROLE_LABEL[item as Role]}
                              </option>
                            ))}
                          </select>
                        </Field>
                        {draft.role === "homeroom" ? (
                          <Field label="כיתת חינוך">
                            <select
                              value={draft.classId}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [profile.id]: { ...draft, classId: event.target.value },
                                }))
                              }
                            >
                              <option value="">בחרו כיתה</option>
                              {classes.map((room) => (
                                <option key={room.id} value={room.id}>
                                  {room.name}
                                </option>
                              ))}
                            </select>
                          </Field>
                        ) : null}
                        <Button
                          onClick={() =>
                            void save(profile).then(() => setOpenId(null))
                          }
                        >
                          שמירה
                        </Button>
                      </>
                    )}
                  </div>
                </Sheet>
              );
            })
        : null}
    </div>
  );
}

function ApprovalList({
  profiles,
  classes,
  onChanged,
  onError,
  onInfo,
}: {
  profiles: Profile[];
  classes: ClassRoom[];
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
  onInfo: (message: string | null) => void;
}) {
  const requests = profiles.filter((profile) => !profile.role && profile.requestedRole);
  if (requests.length === 0) return null;
  return (
    <section className="panel stack">
      <h2>בקשות לאישור · {requests.length}</h2>
      {requests.map((profile) => (
        <ApprovalRow key={profile.id} profile={profile} classes={classes} onChanged={onChanged} onError={onError} onInfo={onInfo} />
      ))}
    </section>
  );
}

function OwnerTransfer({
  admins,
  onChanged,
  onError,
  onInfo,
}: {
  admins: Profile[];
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
  onInfo: (message: string | null) => void;
}) {
  const [target, setTarget] = useState("");
  return (
    <section className="panel stack">
      <h2>העברת בעלות</h2>
      <p className="muted">רק בעל המערכת יכול להעביר את הבעלות, ורק למנהל שכבר קיים.</p>
      <div className="row">
        <select value={target} aria-label="מנהל חדש" onChange={(event) => setTarget(event.target.value)}>
          <option value="">בחרו מנהל</option>
          {admins.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.fullName || profile.email}
            </option>
          ))}
        </select>
        <Button
          variant="warn"
          disabled={!target}
          onClick={() =>
            void getApi()
              .transferOwnership(target)
              .then(async () => {
                onInfo("הבעלות הועברה");
                await onChanged();
              })
              .catch((err: unknown) => onError(err instanceof Error ? err.message : "ההעברה נכשלה"))
          }
        >
          העברת בעלות
        </Button>
      </div>
    </section>
  );
}

function ApprovalRow({
  profile,
  classes,
  onChanged,
  onError,
  onInfo,
}: {
  profile: Profile;
  classes: ClassRoom[];
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
  onInfo: (message: string | null) => void;
}) {
  const homeroom = profile.requestedRole === "homeroom";
  const [classId, setClassId] = useState(profile.requestedClassIds[0] ?? "");
  const room = classes.find((item) => item.id === classId);
  const claimed = classes.filter((item) => profile.requestedClassIds.includes(item.id)).map((item) => item.name);
  const taken = room && room.homeroomTeacherId && room.homeroomTeacherId !== profile.id;
  const missingName = !isFullName(profile.fullName);
  return (
    <div className="stack approval-row">
      <div>
        <b>{titledName(profile)}</b> <span className="ltr muted">{profile.email}</span>
        <br />
        <span>
          מבקש: {profile.requestedRole ? ROLE_LABEL[profile.requestedRole] : ""}
          {homeroom ? <> · כיתה שנבחרה: <b>{claimed.join(", ") || "לא נבחרה"}</b></> : null}
        </span>
      </div>
      {missingName || !profile.title ? (
        <Banner tone="warn">חסר {missingName ? "שם פרטי ומשפחה" : "תואר"}. אפשר להשלים בכרטיס איש הצוות אחרי האישור.</Banner>
      ) : null}
      {homeroom ? (
        <Field label="כיתת חינוך לאישור">
          <select value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="">בחרו כיתה</option>
            {classes.filter((item) => item.active).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.homeroomTeacherId && item.homeroomTeacherId !== profile.id ? " (יש מחנך)" : ""}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {taken ? <Banner tone="warn">לכיתה {room?.name} כבר רשום מחנך. אישור יחליף אותו במחנך החדש.</Banner> : null}
      <span className="row">
        <Button
          disabled={homeroom && !classId}
          onClick={() =>
            void getApi()
              .approveStaffRequest(profile.id, profile.requestedRole as Role, homeroom ? [classId] : [])
              .then(async () => {
                onInfo("הבקשה אושרה");
                await onChanged();
              })
              .catch((err: unknown) => onError(err instanceof Error ? err.message : "האישור נכשל"))
          }
        >
          אישור
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            void getApi()
              .rejectStaffRequest(profile.id)
              .then(async () => {
                onInfo("הבקשה נדחתה");
                await onChanged();
              })
              .catch((err: unknown) => onError(err instanceof Error ? err.message : "הדחייה נכשלה"))
          }
        >
          דחייה
        </Button>
      </span>
    </div>
  );
}

function NameEditor({
  profile,
  onSaved,
  onError,
  onInfo,
}: {
  profile: Profile;
  onSaved: () => Promise<void>;
  onError: (message: string | null) => void;
  onInfo: (message: string | null) => void;
}) {
  const [fullName, setFullName] = useState(profile.fullName);
  const [title, setTitle] = useState(profile.title ?? "");
  const dirty = fullName.trim() !== profile.fullName.trim() || title.trim() !== (profile.title ?? "").trim();
  return (
    <div className="stack">
      <Field label="תואר">
        <TitlePicker value={title} onChange={setTitle} />
      </Field>
      <Field label="שם פרטי ומשפחה">
        <input value={fullName} maxLength={120} onChange={(event) => setFullName(event.target.value)} />
      </Field>
      {dirty ? (
        <Button
          variant="ghost"
          disabled={!isFullName(fullName) || !title.trim()}
          onClick={() =>
            void getApi()
              .updateStaffProfile(profile.id, { fullName: fullName.trim(), title: title.trim() })
              .then(async () => {
                onInfo("הפרטים נשמרו");
                await onSaved();
              })
              .catch((err: unknown) => onError(err instanceof Error ? err.message : "השמירה נכשלה"))
          }
        >
          שמירת שם ותואר
        </Button>
      ) : null}
    </div>
  );
}
