import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getApi } from "../api";
import type { ClassRoom, Gender, Student, StudentContact } from "../api/types";
import { GENDER_LABEL } from "../api/types";
import { useAuth } from "../auth";
import { ImportWizard } from "../components/ImportWizard";
import { PageHeader } from "../components/PageHeader";
import { Banner, Button, Empty, Field, Ltr, studentName } from "../components/ui";
import { normalizeIlPhone } from "../lib/phone";

export function ClassPage() {
  const { classId } = useParams();
  const { session } = useAuth();
  const role = session?.profile.role;
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [contacts, setContacts] = useState<StudentContact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const managesAll = role === "admin" || role === "secretary";
  const mine = classes.filter((room) => managesAll || room.homeroomTeacherId === session?.userId);
  const selected = classId ? mine.find((room) => room.id === classId) : mine.length === 1 ? mine[0] : undefined;

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

  const roster = useMemo(
    () => students.filter((student) => student.classId === selected?.id),
    [students, selected?.id],
  );
  const contactMap = useMemo(() => new Map(contacts.map((contact) => [contact.studentId, contact])), [contacts]);

  if (!selected) {
    return (
      <div className="stack">
        <h1>כיתות</h1>
        {mine.length === 0 ? <Empty>עוד לא שויכה אליכם כיתה. בקשו ממנהל המערכת לשייך.</Empty> : null}
        <div className="list">
          {mine.map((room) => (
            <Link key={room.id} className="person" to={`/class/${room.id}`}>
              <b>{room.name}</b>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHeader title={`כיתה ${selected.name}`} lede="רשימת התלמידים של הכיתה. אפשר לייבא קובץ או לעדכן טלפון של הורה." />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {info ? <Banner>{info}</Banner> : null}
      <StudentForm
        classId={selected.id}
        onSaved={async () => {
          setEditing(null);
          await load();
        }}
      />
      <ImportWizard
        classes={mine}
        students={students.filter((student) => mine.some((room) => room.id === student.classId))}
        contacts={contacts}
        canCreateClasses={managesAll}
        onImported={async (message) => {
          setInfo(message);
          await load();
        }}
      />
      <div className="list">
        {roster.map((student) => {
          const contact = contactMap.get(student.id);
          return (
            <article key={student.id} className="card stack">
              <div className="spread">
                <div>
                  <strong>{studentName(student.firstName, student.lastName)}</strong>
                  <div className="muted">
                    {student.gender ? GENDER_LABEL[student.gender] : "ללא מגדר"}
                    {student.active ? "" : " · לא פעיל"}
                    {contact?.parentPhone ? (
                      <>
                        {" · "}
                        <Ltr>{contact.parentPhone}</Ltr>
                      </>
                    ) : (
                      " · אין טלפון"
                    )}
                  </div>
                </div>
                <Button variant="ghost" onClick={() => setEditing(editing === student.id ? null : student.id)}>
                  עריכה
                </Button>
              </div>
              {editing === student.id ? (
                <StudentForm
                  classId={selected.id}
                  student={student}
                  contact={contact}
                  onSaved={async () => {
                    setEditing(null);
                    await load();
                  }}
                />
              ) : null}
            </article>
          );
        })}
      </div>
      {roster.length === 0 ? <Empty>אין תלמידים בכיתה.</Empty> : null}
    </div>
  );
}

function StudentForm({
  classId,
  student,
  contact,
  onSaved,
}: {
  classId: string;
  student?: Student;
  contact?: StudentContact;
  onSaved: () => Promise<void>;
}) {
  const [firstName, setFirstName] = useState(student?.firstName ?? "");
  const [lastName, setLastName] = useState(student?.lastName ?? "");
  const [gender, setGender] = useState<Gender | "">(student?.gender ?? "");
  const [parentName, setParentName] = useState(contact?.parentName ?? "");
  const [parentPhone, setParentPhone] = useState(contact?.parentPhone ?? "");
  const [active, setActive] = useState(student?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await getApi().saveStudent({
        id: student?.id,
        firstName,
        lastName,
        gender: gender || null,
        classId,
        parentName,
        parentPhone,
        active,
      });
      if (!student) {
        setFirstName("");
        setLastName("");
        setGender("");
        setParentName("");
        setParentPhone("");
        setActive(true);
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "השמירה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <div className="row">
        <Field label="שם פרטי">
          <input value={firstName} onChange={(event) => setFirstName(event.target.value)} />
        </Field>
        <Field label="שם משפחה">
          <input value={lastName} onChange={(event) => setLastName(event.target.value)} />
        </Field>
      </div>
      <Field label="מגדר">
        <select value={gender} onChange={(event) => setGender(event.target.value as Gender | "")}>
          <option value="">לא צוין</option>
          <option value="male">זכר</option>
          <option value="female">נקבה</option>
        </select>
      </Field>
      <Field label="שם הורה">
        <input value={parentName} onChange={(event) => setParentName(event.target.value)} />
      </Field>
      <Field label="טלפון הורה">
        <input inputMode="tel" value={parentPhone} onChange={(event) => setParentPhone(event.target.value)} />
      </Field>
      {parentPhone && !normalizeIlPhone(parentPhone) ? <Banner tone="warn">המספר לא נראה ישראלי, וההודעה תדולג.</Banner> : null}
      <label className="row">
        <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
        פעיל
      </label>
      <Button disabled={busy || !firstName.trim() || !lastName.trim()} onClick={() => void save()}>
        {student ? "שמירת תלמיד" : "הוספת תלמיד"}
      </Button>
    </div>
  );
}
