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
          !canEdit
            ? "רשימת הצוות של בית הספר. שינוי תפקיד נעשה במזכירות."
            : isAdmin
              ? "נותנים תפקיד לכל מי שנכנס עם גוגל, ומשייכים מחנך לכיתה."
              : "משייכים מורים, מחנכים ומזכירות. אי אפשר לשנות תפקיד של מנהל."
        }
      />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {info ? <Banner>{info}</Banner> : null}
      <div className="sticky-search">
        <input value={query} placeholder="חיפוש לפי שם או מייל" onChange={(event) => setQuery(event.target.value)} />
      </div>
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
                  <b>{profile.fullName || profile.email}</b>
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
                const locked = !canEdit || (!isAdmin && profile.role === "admin");
                const draft = draftFor(profile);
                const options = isAdmin ? ([...STAFF_ROLES, "admin"] as Array<Role | "">) : STAFF_ROLES;
                return (
                  <tr key={profile.id}>
                    <td>{profile.fullName || "—"}</td>
                    <td className="ltr">{profile.email}</td>
                    <td>
                      {locked ? (
                        ROLE_LABEL.admin
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
                        <span className="muted">רק מנהל</span>
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
              const locked = !canEdit || (!isAdmin && profile.role === "admin");
              const draft = draftFor(profile);
              const options = isAdmin ? ([...STAFF_ROLES, "admin"] as Array<Role | "">) : STAFF_ROLES;
              return (
                <Sheet key={profile.id} full title="איש צוות" onClose={() => setOpenId(null)}>
                  <div className="stack">
                    <p>
                      <strong>{profile.fullName || "—"}</strong>
                      <br />
                      <span className="ltr muted">{profile.email}</span>
                    </p>
                    {locked ? (
                      <p>{canEdit ? `תפקיד: ${ROLE_LABEL.admin}. רק מנהל יכול לשנות אותו.` : `תפקיד: ${profile.role ? ROLE_LABEL[profile.role] : "ממתין לאישור"}. שינוי תפקיד נעשה במזכירות.`}</p>
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
