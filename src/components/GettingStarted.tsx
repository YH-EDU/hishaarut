import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getApi } from "../api";
import { useAuth } from "../auth";

const DISMISS_KEY = "hishaarut-start-dismissed";

export function GettingStarted() {
  const { session } = useAuth();
  const role = session?.profile.role;
  const [steps, setSteps] = useState<Array<{ title: string; detail: string; to: string; done: boolean }>>([]);
  const [hidden, setHidden] = useState(() => localStorage.getItem(DISMISS_KEY) === "1");

  useEffect(() => {
    if (role !== "secretary" && role !== "admin") return;
    void Promise.all([getApi().listClasses(), getApi().listStudents(), getApi().listProfiles()]).then(
      ([classes, students, profiles]) => {
        const staffAssigned = profiles.some(
          (profile) => profile.id !== session?.userId && (profile.role === "teacher" || profile.role === "homeroom" || profile.role === "secretary"),
        );
        setSteps([
          {
            title: "הוסיפו כיתות",
            detail: "למשל ז׳1 ואז ז׳2. בלי כיתה אי אפשר לשייך תלמיד.",
            to: "/roster",
            done: classes.some((room) => room.active),
          },
          {
            title: "ייבאו תלמידים",
            detail: "קובץ מאקסל, משוב או CSV. אחר כך בדקו טלפונים בטבלה.",
            to: "/roster",
            done: students.some((student) => student.active),
          },
          {
            title: "שייכו תפקידים לצוות",
            detail: "מורה, מחנך או מזכירות, ומחנך לכיתה שלו.",
            to: "/staff",
            done: staffAssigned,
          },
        ]);
      },
    );
  }, [role, session?.userId]);

  if (hidden || (role !== "secretary" && role !== "admin") || steps.length === 0 || steps.every((step) => step.done)) {
    return null;
  }

  return (
    <section className="checklist">
      <div className="spread">
        <h2>איך מתחילים</h2>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, "1");
            setHidden(true);
          }}
        >
          הסתרה
        </button>
      </div>
      <ol>
        {steps.map((step, index) => (
          <li key={step.title} className={step.done ? "done" : undefined}>
            <span>{index + 1}</span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.detail}</p>
              {step.done ? <em>בוצע</em> : <Link to={step.to}>מעבר לשלב</Link>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
