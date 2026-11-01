import { useEffect, useMemo, useState } from "react";
import { getApi } from "../api";
import type { ClassRoom, Gender, Student, StudentContact } from "../api/types";
import { GENDER_LABEL } from "../api/types";
import { useAuth } from "../auth";
import { ImportWizard } from "../components/ImportWizard";
import { EmptyState, PageHeader } from "../components/PageHeader";
import { Sheet } from "../components/Sheet";
import { Banner, Button, Field } from "../components/ui";

type SortKey = "name" | "className" | "phone";

export function RosterPage() {
  const { session } = useAuth();
  const role = session?.profile.role;
  const managesAll = role === "admin" || role === "secretary";
  const canSeePhones = managesAll || role === "homeroom";
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [contacts, setContacts] = useState<StudentContact[]>([]);
  const [query, setQuery] = useState("");
  const [classId, setClassId] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [className, setClassName] = useState("");
  const [grade, setGrade] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { parentName: string; parentPhone: string; parent2Phone: string }>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);

  const visibleClasses = classes.filter(
    (room) => managesAll || role === "teacher" || room.homeroomTeacherId === session?.userId,
  );
  const classNames = useMemo(() => new Map(classes.map((room) => [room.id, room.name])), [classes]);
  const contactMap = useMemo(() => new Map(contacts.map((contact) => [contact.studentId, contact])), [contacts]);

  async function load() {
    const [nextClasses, nextStudents, nextContacts] = await Promise.all([
      getApi().listClasses(),
      getApi().listStudents(),
      getApi().listContacts(),
    ]);
    setClasses(nextClasses);
    setStudents(nextStudents);
    setContacts(nextContacts);
  }

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "אירעה שגיאה"));
  }, []);

  const rows = useMemo(() => {
    const q = query.trim();
    const list = students.filter((student) => {
      if (!visibleClasses.some((room) => room.id === student.classId)) return false;
      if (classId && student.classId !== classId) return false;
      if (!q) return true;
      const contact = contactMap.get(student.id);
      const blob = `${student.firstName} ${student.lastName} ${classNames.get(student.classId) ?? ""} ${contact?.parentPhone ?? ""} ${contact?.nationalId ?? ""}`;
      return blob.includes(q);
    });
    const value = (student: Student) => {
      if (sort.key === "className") return classNames.get(student.classId) ?? "";
      if (sort.key === "phone") return contactMap.get(student.id)?.parentPhone ?? "";
      return `${student.lastName} ${student.firstName}`;
    };
    return [...list].sort((a, b) => value(a).localeCompare(value(b), "he") * sort.dir);
  }, [students, visibleClasses, classId, query, sort, classNames, contactMap]);

  function toggleSort(key: SortKey) {
    setSort((current) => (current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

  function draftFor(student: Student) {
    return (
      drafts[student.id] ?? {
        parentName: contactMap.get(student.id)?.parentName ?? "",
        parentPhone: contactMap.get(student.id)?.parentPhone ?? "",
        parent2Phone: contactMap.get(student.id)?.parent2Phone ?? "",
      }
    );
  }

  async function saveRow(student: Student) {
    const draft = draftFor(student);
    setError(null);
    try {
      await getApi().saveStudent({
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        gender: student.gender,
        classId: student.classId,
        parentName: draft.parentName,
        parentPhone: draft.parentPhone,
        parent2Name: contactMap.get(student.id)?.parent2Name ?? "",
        parent2Phone: draft.parent2Phone,
        nationalId: contactMap.get(student.id)?.nationalId ?? "",
        active: student.active,
      });
      setInfo("השורה נשמרה");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "השמירה נכשלה");
    }
  }

  async function addClass() {
    try {
      await getApi().saveClass({ name: className, grade, homeroomTeacherId: null, active: true });
      setClassName("");
      setGrade("");
      setInfo("הכיתה נוספה");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "השמירה נכשלה");
    }
  }

  return (
    <div className="stack">
      <PageHeader
        title="תלמידים וכיתות"
        lede="קודם יוצרים כיתה, אחר כך מייבאים תלמידים. טלפון של הורה מתעדכן ישר בטבלה."
      />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {info ? <Banner>{info}</Banner> : null}

      <section className="panel stack desktop-only">
        <h2>כיתות</h2>
        {visibleClasses.length === 0 ? (
          <EmptyState title="אין עדיין כיתות" detail="הוסיפו את הכיתה הראשונה, למשל ז׳1. רק אחר כך אפשר לייבא תלמידים." />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>כיתה</th>
                  <th>שכבה</th>
                  <th>תלמידים</th>
                </tr>
              </thead>
              <tbody>
                {visibleClasses.map((room) => (
                  <tr key={room.id}>
                    <td>{room.name}</td>
                    <td>{room.grade || "—"}</td>
                    <td>{students.filter((student) => student.classId === room.id).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {managesAll ? (
          <div className="toolbar">
            <input value={className} placeholder="שם כיתה, למשל ז׳3" onChange={(event) => setClassName(event.target.value)} />
            <input value={grade} placeholder="שכבה" onChange={(event) => setGrade(event.target.value)} />
            <Button disabled={!className.trim()} onClick={() => void addClass()}>
              הוספת כיתה
            </Button>
          </div>
        ) : null}
      </section>

      <div className="desktop-only">
      <ImportWizard
        classes={visibleClasses}
        students={students.filter((student) => visibleClasses.some((room) => room.id === student.classId))}
        contacts={contacts}
        canCreateClasses={managesAll}
        onImported={async (message) => {
          setInfo(message);
          await load();
        }}
      />
      </div>

      <section className="stack">
        <h2 className="desktop-only">תלמידים</h2>
        <div className="toolbar sticky-search">
          <input value={query} placeholder="חיפוש לפי שם, כיתה או טלפון" onChange={(event) => setQuery(event.target.value)} />
          <select value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="">כל הכיתות</option>
            {visibleClasses.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </div>
        {students.length === 0 ? (
          <EmptyState title="אין עדיין תלמידים" detail="אחרי שיש כיתה, ייבאו קובץ או הוסיפו תלמיד מהטופס למטה." />
        ) : rows.length === 0 ? (
          <EmptyState title="אין תוצאות לחיפוש" detail="נסו שם אחר, או בחרו כל הכיתות." />
        ) : (
          <>
          <div className="phone-only list">
            {rows.map((student) => {
              const contact = contactMap.get(student.id);
              const hasPhone = Boolean(contact?.parentPhone || contact?.parent2Phone);
              return (
                <button key={student.id} type="button" className="person-card" onClick={() => setOpenId(student.id)}>
                  <span>
                    <b>
                      {student.firstName} {student.lastName}
                    </b>
                    <span className="muted">{classNames.get(student.classId)}</span>
                  </span>
                  <span className="badge">{canSeePhones ? (hasPhone ? "יש טלפון" : "אין טלפון") : "טלפון מוסתר"}</span>
                </button>
              );
            })}
          </div>
          <div className="table-scroll desktop-only">
            <table className="data-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" onClick={() => toggleSort("name")}>
                      שם
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => toggleSort("className")}>
                      כיתה
                    </button>
                  </th>
                  <th>מגדר</th>
                  <th>הורה</th>
                  <th>
                    <button type="button" onClick={() => toggleSort("phone")}>
                      טלפון
                    </button>
                  </th>
                  <th>טלפון 2</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((student) => {
                  const draft = draftFor(student);
                  return (
                    <tr key={student.id}>
                      <td>
                        {student.firstName} {student.lastName}
                      </td>
                      <td>{classNames.get(student.classId)}</td>
                      <td>{student.gender ? GENDER_LABEL[student.gender] : "—"}</td>
                      <td>
                        <input
                          value={draft.parentName}
                          aria-label={`שם הורה של ${student.firstName}`}
                          onChange={(event) =>
                            setDrafts((current) => ({ ...current, [student.id]: { ...draft, parentName: event.target.value } }))
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="ltr"
                          value={draft.parentPhone}
                          aria-label={`טלפון של ${student.firstName}`}
                          onChange={(event) =>
                            setDrafts((current) => ({ ...current, [student.id]: { ...draft, parentPhone: event.target.value } }))
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="ltr"
                          value={draft.parent2Phone}
                          aria-label={`טלפון שני של ${student.firstName}`}
                          onChange={(event) =>
                            setDrafts((current) => ({ ...current, [student.id]: { ...draft, parent2Phone: event.target.value } }))
                          }
                        />
                      </td>
                      <td>
                        <Button variant="ghost" onClick={() => void saveRow(student)}>
                          שמירה
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
      {openId ? (
        <Sheet full title="פרטי תלמיד" onClose={() => setOpenId(null)}>
          {rows.filter((student) => student.id === openId).map((student) => {
            const draft = draftFor(student);
            return (
              <div key={student.id} className="stack">
                <p>
                  <strong>
                    {student.firstName} {student.lastName}
                  </strong>
                  <br />
                  <span className="muted">{classNames.get(student.classId)}</span>
                </p>
                {managesAll || session?.profile.role === "homeroom" ? (
                  <>
                    <Field label="שם הורה">
                      <input
                        value={draft.parentName}
                        onChange={(event) =>
                          setDrafts((current) => ({ ...current, [student.id]: { ...draft, parentName: event.target.value } }))
                        }
                      />
                    </Field>
                    <Field label="טלפון הורה">
                      <input
                        className="ltr"
                        inputMode="tel"
                        value={draft.parentPhone}
                        onChange={(event) =>
                          setDrafts((current) => ({ ...current, [student.id]: { ...draft, parentPhone: event.target.value } }))
                        }
                      />
                    </Field>
                    <Field label="טלפון הורה 2">
                      <input
                        className="ltr"
                        inputMode="tel"
                        value={draft.parent2Phone}
                        onChange={(event) =>
                          setDrafts((current) => ({ ...current, [student.id]: { ...draft, parent2Phone: event.target.value } }))
                        }
                      />
                    </Field>
                    <Button
                      onClick={() =>
                        void saveRow(student).then(() => setOpenId(null))
                      }
                    >
                      שמירה
                    </Button>
                  </>
                ) : (
                  <p className="muted">אפשר לסמן את התלמיד להשארות ממסך הסימון.</p>
                )}
              </div>
            );
          })}
        </Sheet>
      ) : null}
      {managesAll ? (
        <div className="phone-only">
          <Button variant="ghost" block onClick={() => setToolsOpen(true)}>
            כיתות וייבוא
          </Button>
        </div>
      ) : null}
      {toolsOpen ? (
        <Sheet title="כיתות וייבוא" onClose={() => setToolsOpen(false)}>
          <div className="stack">
            <div className="toolbar">
              <input value={className} placeholder="שם כיתה, למשל ז׳3" onChange={(event) => setClassName(event.target.value)} />
              <Button disabled={!className.trim()} onClick={() => void addClass()}>
                הוספת כיתה
              </Button>
            </div>
            <ImportWizard
              classes={visibleClasses}
              students={students}
              contacts={contacts}
              canCreateClasses={managesAll}
              onImported={async (message) => {
                setInfo(message);
                setToolsOpen(false);
                await load();
              }}
            />
          </div>
        </Sheet>
      ) : null}
      <div className="desktop-only">
      {visibleClasses[0] ? (
        <AddStudent
          classes={visibleClasses}
          onSaved={async () => {
            setInfo("התלמיד נוסף");
            await load();
          }}
        />
      ) : null}
    </div>
    </div>
  );
}

function AddStudent({ classes, onSaved }: { classes: ClassRoom[]; onSaved: () => Promise<void> }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [gender, setGender] = useState<Gender | "">("");
  const [parentPhone, setParentPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="panel stack">
      <h2>תלמיד בודד</h2>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <div className="toolbar">
        <Field label="שם פרטי">
          <input value={firstName} onChange={(event) => setFirstName(event.target.value)} />
        </Field>
        <Field label="שם משפחה">
          <input value={lastName} onChange={(event) => setLastName(event.target.value)} />
        </Field>
        <Field label="כיתה">
          <select value={classId} onChange={(event) => setClassId(event.target.value)}>
            {classes.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="מגדר">
          <select value={gender} onChange={(event) => setGender(event.target.value as Gender | "")}>
            <option value="">לא צוין</option>
            <option value="male">זכר</option>
            <option value="female">נקבה</option>
          </select>
        </Field>
        <Field label="טלפון הורה">
          <input className="ltr" value={parentPhone} onChange={(event) => setParentPhone(event.target.value)} />
        </Field>
      </div>
      <Button
        disabled={!firstName.trim() || !lastName.trim() || !classId}
        onClick={() => {
          void getApi()
            .saveStudent({
              firstName,
              lastName,
              gender: gender || null,
              classId,
              parentName: "",
              parentPhone,
              active: true,
            })
            .then(async () => {
              setFirstName("");
              setLastName("");
              setParentPhone("");
              await onSaved();
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : "השמירה נכשלה"));
        }}
      >
        הוספת תלמיד
      </Button>
      </section>
  );
}
