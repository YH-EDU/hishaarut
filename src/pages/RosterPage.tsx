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

type Pending =
  | { kind: "students-active"; ids: string[]; active: boolean; title: string; body: string }
  | { kind: "class-active"; ids: string[]; name: string; active: boolean; studentCount: number }
  | { kind: "delete-student"; id: string; name: string }
  | { kind: "delete-class"; id: string; name: string; studentCount: number }
  | { kind: "blocked-student"; id: string; name: string }
  | { kind: "blocked-class"; id: string; name: string };

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
  const [openClassId, setOpenClassId] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [pickedStudents, setPickedStudents] = useState<string[]>([]);
  const [pickedClasses, setPickedClasses] = useState<string[]>([]);
  const [includeStudents, setIncludeStudents] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);

  const visibleClasses = classes.filter(
    (room) => managesAll || role === "teacher" || room.homeroomTeacherId === session?.userId,
  );
  const shownClasses = visibleClasses.filter((room) => showArchived || room.active);
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
      if (!showArchived && !student.active) return false;
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
  }, [students, visibleClasses, showArchived, classId, query, sort, classNames, contactMap]);

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

  function studentTitle(student: Student) {
    return `${student.firstName} ${student.lastName}`;
  }

  function askStudentActive(list: Student[], active: boolean) {
    if (list.length === 0) return;
    const title = list.length === 1 ? studentTitle(list[0]) : `${list.length} תלמידים`;
    setPending({
      kind: "students-active",
      ids: list.map((student) => student.id),
      active,
      title: active ? `שחזור ${title}` : `ארכיון ${title}`,
      body: active
        ? "התלמידים יחזרו לחיפוש ולסימון."
        : "התלמידים יוסתרו מחיפוש ומסימון. ההיסטוריה נשארת בדוחות.",
    });
  }

  function askClassActive(room: ClassRoom, active: boolean) {
    const studentCount = students.filter((student) => student.classId === room.id).length;
    setIncludeStudents(studentCount > 0);
    setPending({ kind: "class-active", ids: [room.id], name: room.name, active, studentCount });
  }

  async function askDeleteStudent(student: Student) {
    setError(null);
    try {
      const count = await getApi().countDetentions([student.id]);
      const name = studentTitle(student);
      setPending(count > 0 ? { kind: "blocked-student", id: student.id, name } : { kind: "delete-student", id: student.id, name });
    } catch (err) {
      setError(err instanceof Error ? err.message : "אירעה שגיאה");
    }
  }

  async function askDeleteClass(room: ClassRoom) {
    setError(null);
    const ids = students.filter((student) => student.classId === room.id).map((student) => student.id);
    try {
      const count = await getApi().countDetentions(ids);
      setPending(
        count > 0
          ? { kind: "blocked-class", id: room.id, name: room.name }
          : { kind: "delete-class", id: room.id, name: room.name, studentCount: ids.length },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "אירעה שגיאה");
    }
  }

  async function applyPending() {
    if (!pending || pending.kind === "blocked-student" || pending.kind === "blocked-class") return;
    setBusy(true);
    setError(null);
    try {
      if (pending.kind === "students-active") {
        await getApi().setStudentsActive(pending.ids, pending.active);
        setPickedStudents([]);
        setInfo(pending.active ? "התלמידים שוחזרו" : "התלמידים הועברו לארכיון");
      } else if (pending.kind === "class-active") {
        for (const id of pending.ids) {
          await getApi().setClassActive(id, pending.active, includeStudents && pending.studentCount > 0);
        }
        setPickedClasses((current) => current.filter((id) => !pending.ids.includes(id)));
        setInfo(pending.active ? "הכיתה שוחזרה" : "הכיתה הועברה לארכיון");
      } else if (pending.kind === "delete-student") {
        await getApi().deleteStudent(pending.id);
        setOpenId(null);
        setPickedStudents((current) => current.filter((id) => id !== pending.id));
        setInfo(`${pending.name} נמחק`);
      } else {
        await getApi().deleteClass(pending.id);
        setOpenClassId(null);
        setPickedClasses((current) => current.filter((id) => id !== pending.id));
        setInfo(`כיתה ${pending.name} נמחקה`);
      }
      setPending(null);
      await load();
    } catch (err) {
      setPending(null);
      setError(err instanceof Error ? err.message : "הפעולה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  function togglePicked(list: string[], id: string, setList: (ids: string[]) => void) {
    setList(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  }

  return (
    <div className="stack">
      <PageHeader
        title="תלמידים וכיתות"
        lede="אפשר לעדכן טלפון, להעביר כיתה או תלמיד לארכיון, ולמחוק רק כשאין השארות."
      />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {info ? <Banner>{info}</Banner> : null}

      <section className="panel stack desktop-only">
        <h2>כיתות</h2>
        {visibleClasses.length === 0 ? (
          <EmptyState title="אין עדיין כיתות" detail="הוסיפו את הכיתה הראשונה, למשל ז׳1. רק אחר כך אפשר לייבא תלמידים." />
        ) : shownClasses.length === 0 ? (
          <EmptyState title="כל הכיתות בארכיון" detail="סמנו הצגת ארכיון כדי לראות אותן ולשחזר." />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {managesAll ? (
                    <th>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          aria-label="בחירת כל הכיתות"
                          checked={shownClasses.every((room) => pickedClasses.includes(room.id))}
                          onChange={() =>
                            setPickedClasses(
                              shownClasses.every((room) => pickedClasses.includes(room.id)) ? [] : shownClasses.map((room) => room.id),
                            )
                          }
                        />
                      </label>
                    </th>
                  ) : null}
                  {managesAll ? <th></th> : null}
                  <th>כיתה</th>
                  <th>שכבה</th>
                  <th>תלמידים</th>
                  <th>מצב</th>
                </tr>
              </thead>
              <tbody>
                {shownClasses.map((room) => (
                  <tr key={room.id}>
                    {managesAll ? (
                      <td>
                        <label className="check-row">
                          <input
                            type="checkbox"
                            aria-label={`בחירת כיתה ${room.name}`}
                            checked={pickedClasses.includes(room.id)}
                            onChange={() => togglePicked(pickedClasses, room.id, setPickedClasses)}
                          />
                        </label>
                      </td>
                    ) : null}
                    {managesAll ? (
                      <td>
                        <div className="row">
                          <Button variant="ghost" onClick={() => askClassActive(room, !room.active)}>
                            {room.active ? "ארכיון" : "שחזור"}
                          </Button>
                          <Button variant="danger" onClick={() => void askDeleteClass(room)}>
                            מחיקה
                          </Button>
                        </div>
                      </td>
                    ) : null}
                    <td>{room.name}</td>
                    <td>{room.grade || "—"}</td>
                    <td>{students.filter((student) => student.classId === room.id && student.active).length}</td>
                    <td>{room.active ? "פעילה" : "בארכיון"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {managesAll && pickedClasses.length > 0 ? (
          <div className="row">
            <Button
              onClick={() => {
                const rooms = shownClasses.filter((room) => pickedClasses.includes(room.id));
                if (rooms.length === 1) askClassActive(rooms[0], false);
                else {
                  setIncludeStudents(true);
                  setPending({
                    kind: "class-active",
                    ids: rooms.map((room) => room.id),
                    name: `${rooms.length} כיתות`,
                    active: false,
                    studentCount: students.filter((student) => rooms.some((room) => room.id === student.classId)).length,
                  });
                }
              }}
            >
              ארכיון כיתות נבחרות ({pickedClasses.length})
            </Button>
          </div>
        ) : null}
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
            {shownClasses.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
          <label className="check-row">
            <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
            הצגת ארכיון
          </label>
        </div>
        {managesAll && pickedStudents.length > 0 ? (
          <div className="row desktop-only">
            <Button onClick={() => askStudentActive(rows.filter((student) => pickedStudents.includes(student.id)), false)}>
              ארכיון תלמידים נבחרים ({pickedStudents.length})
            </Button>
            <Button variant="ghost" onClick={() => askStudentActive(rows.filter((student) => pickedStudents.includes(student.id)), true)}>
              שחזור נבחרים
            </Button>
          </div>
        ) : null}
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
                  <span className="badge">{student.active ? (canSeePhones ? (hasPhone ? "יש טלפון" : "אין טלפון") : "טלפון מוסתר") : "בארכיון"}</span>
                </button>
              );
            })}
          </div>
          <div className="table-scroll desktop-only">
            <table className="data-table">
              <thead>
                <tr>
                  {managesAll ? (
                    <th>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          aria-label="בחירת כל התלמידים"
                          checked={rows.length > 0 && rows.every((student) => pickedStudents.includes(student.id))}
                          onChange={() =>
                            setPickedStudents(
                              rows.every((student) => pickedStudents.includes(student.id)) ? [] : rows.map((student) => student.id),
                            )
                          }
                        />
                      </label>
                    </th>
                  ) : null}
                  {managesAll ? <th></th> : null}
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
                  <th>מצב</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((student) => {
                  const draft = draftFor(student);
                  return (
                    <tr key={student.id}>
                      {managesAll ? (
                        <td>
                          <label className="check-row">
                            <input
                              type="checkbox"
                              aria-label={`בחירת ${studentTitle(student)}`}
                              checked={pickedStudents.includes(student.id)}
                              onChange={() => togglePicked(pickedStudents, student.id, setPickedStudents)}
                            />
                          </label>
                        </td>
                      ) : null}
                      {managesAll ? (
                        <td>
                          <div className="row">
                            <Button variant="ghost" onClick={() => askStudentActive([student], !student.active)}>
                              {student.active ? "ארכיון" : "שחזור"}
                            </Button>
                            <Button variant="danger" onClick={() => void askDeleteStudent(student)}>
                              מחיקה
                            </Button>
                          </div>
                        </td>
                      ) : null}
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
                      <td>{student.active ? "פעיל" : "בארכיון"}</td>
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
          {students.filter((student) => student.id === openId).map((student) => {
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
                  <p className="muted">
                    {student.active ? "אפשר לסמן את התלמיד להשארות ממסך הסימון." : "התלמיד בארכיון."}
                  </p>
                )}
                {managesAll ? (
                  <div className="row">
                    <Button variant="ghost" onClick={() => askStudentActive([student], !student.active)}>
                      {student.active ? "העברה לארכיון" : "שחזור"}
                    </Button>
                    <Button variant="danger" onClick={() => void askDeleteStudent(student)}>
                      מחיקה לצמיתות
                    </Button>
                  </div>
                ) : null}
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
            <div className="list">
              {shownClasses.map((room) => (
                <button key={room.id} type="button" className="person-card" onClick={() => setOpenClassId(room.id)}>
                  <span>
                    <b>{room.name}</b>
                    <span className="muted">
                      {room.active
                        ? `${students.filter((student) => student.classId === room.id && student.active).length} תלמידים`
                        : "בארכיון"}
                    </span>
                  </span>
                  <span className="badge">{room.active ? "פעילה" : "בארכיון"}</span>
                </button>
              ))}
            </div>
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
      {openClassId ? (
        <Sheet full title="כיתה" onClose={() => setOpenClassId(null)}>
          {visibleClasses
            .filter((room) => room.id === openClassId)
            .map((room) => (
              <div key={room.id} className="stack">
                <p>
                  <strong>{room.name}</strong>
                  <br />
                  <span className="muted">
                    {room.active ? "פעילה" : "בארכיון"} · {students.filter((student) => student.classId === room.id).length} תלמידים
                  </span>
                </p>
                <Button onClick={() => askClassActive(room, !room.active)}>
                  {room.active ? "העברה לארכיון" : "שחזור"}
                </Button>
                <Button variant="danger" onClick={() => void askDeleteClass(room)}>
                  מחיקה לצמיתות
                </Button>
              </div>
            ))}
        </Sheet>
      ) : null}
      {pending ? (
        <Sheet confirm title={confirmTitle(pending)} onClose={() => setPending(null)}>
          <div className="stack">
            <p>{confirmBody(pending)}</p>
            {pending.kind === "class-active" && pending.studentCount > 0 ? (
              <label className="check-row">
                <input type="checkbox" checked={includeStudents} onChange={(event) => setIncludeStudents(event.target.checked)} />
                {pending.active ? "לשחזר גם את התלמידים" : "להעביר לארכיון גם את התלמידים"}
              </label>
            ) : null}
            {pending.kind === "blocked-student" ? (
              <Button
                onClick={() => {
                  const student = students.find((item) => item.id === pending.id);
                  if (student) askStudentActive([student], false);
                }}
              >
                העברה לארכיון
              </Button>
            ) : null}
            {pending.kind === "blocked-class" ? (
              <Button
                onClick={() => {
                  const room = classes.find((item) => item.id === pending.id);
                  if (room) askClassActive(room, false);
                }}
              >
                העברה לארכיון
              </Button>
            ) : null}
            {pending.kind === "students-active" || pending.kind === "class-active" ? (
              <Button disabled={busy} onClick={() => void applyPending()}>
                {pending.active ? "שחזור" : "העברה לארכיון"}
              </Button>
            ) : null}
            {pending.kind === "delete-student" || pending.kind === "delete-class" ? (
              <Button variant="danger" disabled={busy} onClick={() => void applyPending()}>
                מחיקה לצמיתות
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setPending(null)}>
              ביטול
            </Button>
          </div>
        </Sheet>
      ) : null}
      <div className="desktop-only">
      {visibleClasses.some((room) => room.active) ? (
        <AddStudent
          classes={visibleClasses.filter((room) => room.active)}
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

function confirmTitle(pending: Pending): string {
  if (pending.kind === "students-active") return pending.title;
  if (pending.kind === "class-active") {
    const label = pending.name.includes("כיתות") ? pending.name : `כיתה ${pending.name}`;
    return pending.active ? `שחזור ${label}` : `ארכיון ${label}`;
  }
  if (pending.kind === "delete-student") return `מחיקת ${pending.name}`;
  if (pending.kind === "delete-class") return `מחיקת כיתה ${pending.name}`;
  if (pending.kind === "blocked-class") return `אי אפשר למחוק את כיתה ${pending.name}`;
  return `אי אפשר למחוק את ${pending.name}`;
}

function confirmBody(pending: Pending): string {
  if (pending.kind === "students-active") return pending.body;
  if (pending.kind === "class-active") {
    return pending.active
      ? "הכיתה תחזור לרשימות ולסימון."
      : "הכיתה תוסתר מרשימות ומסימון. ההיסטוריה נשארת בדוחות.";
  }
  if (pending.kind === "delete-student") return "אין השארות רשומות. המחיקה לא ניתנת לביטול.";
  if (pending.kind === "delete-class") {
    return pending.studentCount > 0
      ? `אין השארות. יימחקו גם ${pending.studentCount} תלמידים בלי היסטוריה. המחיקה לא ניתנת לביטול.`
      : "אין תלמידים ואין השארות. המחיקה לא ניתנת לביטול.";
  }
  return "יש השארות רשומות, לכן המחיקה חסומה. אפשר להעביר לארכיון, וההיסטוריה תישאר בדוחות.";
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
