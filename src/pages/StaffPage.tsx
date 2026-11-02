import { useEffect, useMemo, useState } from "react";
import { getApi } from "../api";
import type { ClassRoom, Profile, Role } from "../api/types";
import { ROLE_LABEL } from "../api/types";
import { useAuth } from "../auth";
import { EmptyState, PageHeader } from "../components/PageHeader";
import { Sheet } from "../components/Sheet";
import { Banner, Button, Field } from "../components/ui";

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
                      {profile.fullName || "—"}
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
      {requests.map((profile) => {
        const names = classes.filter((room) => profile.requestedClassIds.includes(room.id)).map((room) => room.name);
        return (
          <div key={profile.id} className="spread">
            <span>
              <b>{profile.fullName || profile.email}</b>
              <span className="muted">
                {" "}
                {profile.requestedRole ? ROLE_LABEL[profile.requestedRole] : ""}
                {names.length > 0 ? ` · ${names.join(", ")}` : ""}
              </span>
            </span>
            <span className="row">
              <Button
                onClick={() =>
                  void getApi()
                    .approveStaffRequest(profile.id, profile.requestedRole as Role, profile.requestedClassIds)
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
      })}
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
