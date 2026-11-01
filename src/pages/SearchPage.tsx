import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getApi } from "../api";
import type { ClassRoom, Student } from "../api/types";
import { PageHeader } from "../components/PageHeader";
import { Banner, Empty, studentName } from "../components/ui";
import { classKey } from "../lib/csv";

const RECENT_KEY = "hishaarut-recent";

function readRecent(): string[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(RECENT_KEY) ?? "[]") as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function rememberStudent(id: string) {
  const next = [id, ...readRecent().filter((item) => item !== id)].slice(0, 6);
  sessionStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export function SearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [query, setQuery] = useState("");
  const [classId, setClassId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const state = location.state as { flash?: string } | null;
    if (state?.flash) {
      setFlash(state.flash);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    void Promise.all([getApi().listStudents(), getApi().listClasses()])
      .then(([nextStudents, nextClasses]) => {
        setStudents(nextStudents.filter((student) => student.active));
        setClasses(nextClasses.filter((room) => room.active));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "אירעה שגיאה"));
  }, []);

  const className = useMemo(() => new Map(classes.map((room) => [room.id, room.name])), [classes]);
  const results = useMemo(() => {
    const q = query.trim();
    const recent = new Set(readRecent());
    return students
      .filter((student) => {
        if (classId && student.classId !== classId) return false;
        if (!q) return classId ? true : recent.has(student.id);
        const blob = classKey(`${student.firstName} ${student.lastName} ${className.get(student.classId) ?? ""}`);
        return blob.includes(classKey(q));
      })
      .slice(0, 40);
  }, [students, query, classId, className]);

  return (
    <div className="stack">
      <PageHeader title="סימון תלמיד" lede="מחפשים לפי שם או כיתה, בוחרים סיבה ומשך, ולוחצים סמן להשארות." />
      {flash ? <Banner>{flash}</Banner> : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <div className="sticky-search">
        <input
          type="search"
          autoFocus
          placeholder="שם תלמיד או כיתה"
          value={query}
          aria-label="חיפוש תלמיד"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="chips">
        <button type="button" className="chip" aria-pressed={classId === ""} onClick={() => setClassId("")}>
          כל הכיתות
        </button>
        {classes.map((room) => (
          <button
            key={room.id}
            type="button"
            className="chip"
            aria-pressed={classId === room.id}
            onClick={() => setClassId(room.id)}
          >
            {room.name}
          </button>
        ))}
      </div>
      {!query && !classId ? <p className="muted">הקלידו שם, או בחרו כיתה. אחרי סימון, התלמידים האחרונים יופיעו כאן.</p> : null}
      {results.length === 0 && (query || classId) ? <Empty>לא נמצאו תלמידים.</Empty> : null}
      <div className="list">
        {results.map((student) => (
          <Link key={student.id} className="person" to={`/students/${student.id}`}>
            <b>{studentName(student.firstName, student.lastName)}</b>
            <span className="badge">{className.get(student.classId)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
