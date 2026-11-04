import { DEFAULT_PARENT_TEMPLATE, type Gender, type NotificationEvent, type RecipientType } from "../api/types";

export interface ParentTemplateValues {
  parentName: string | null;
  studentName: string;
  className: string;
  releaseTime: string;
  reason: string;
  teacherName?: string | null;
}

/** Preset reasons (nouns in the list) turned into a past-tense verb about the student. */
const REASON_PHRASES: Record<string, string> = {
  "חיסור בתפילה": "חיסר בתפילה",
  "חיסור מתפילה": "חיסר בתפילה",
  "הפרעה בשיעור": "הפריע בשיעור",
  "היעדרות משיעור": "נעדר משיעור",
  "היעדרות מהשיעור": "נעדר מהשיעור",
  "חיסור משיעור": "נעדר משיעור",
  "איחור": "איחר",
  "איחור לשיעור": "איחר לשיעור",
  "אי-הכנת שיעורי בית": "לא הכין שיעורי בית",
  "אי הכנת שיעורי בית": "לא הכין שיעורי בית",
  "אי הגשת עבודה": "לא הגיש עבודה",
  "אי-הגשת עבודה": "לא הגיש עבודה",
};

/** "{student} נעדר משיעור, ולכן יישאר היום בסוף היום" or a "בשל {reason}" fallback for free text. */
export function reasonClause(studentName: string, reason: string | null | undefined): string {
  const text = (reason ?? "").trim().replace(/[.\s]+$/, "");
  const phrase = REASON_PHRASES[text];
  if (phrase) return `${studentName} ${phrase}, ולכן יישאר היום בסוף היום`;
  if (text) return `${studentName} יישאר היום בסוף היום בשל ${text}`;
  return `${studentName} יישאר היום בסוף היום`;
}

/** Fills the parent WhatsApp template. A missing name becomes the greeting שלום, without doubling it. */
export function applyParentTemplate(template: string | null | undefined, values: ParentTemplateValues): string {
  const source = template?.trim() ? template : DEFAULT_PARENT_TEMPLATE;
  const name = values.parentName?.trim() ?? "";
  let body = source;
  if (!name) {
    body = body.replaceAll("שלום {parent_name}", "שלום");
    body = body.replaceAll("{parent_name}", "שלום");
  } else {
    body = body.replaceAll("{parent_name}", name);
  }
  const teacher = values.teacherName?.trim() ?? "";
  return body
    .replaceAll("{reason_clause}", reasonClause(values.studentName, values.reason))
    .replaceAll("{teacher_sign}", teacher ? `, ${teacher}` : ".")
    .replaceAll("{student_name}", values.studentName)
    .replaceAll("{class}", values.className)
    .replaceAll("{release_time}", values.releaseTime)
    .replaceAll("{reason}", values.reason);
}

/**
 * Hebrew WhatsApp copy. The database function render_detention_message is the
 * source of truth for real sends; this mirror is for demo mode and tests.
 */
export function renderDetentionMessage(input: {
  event: NotificationEvent;
  audience: RecipientType;
  gender: Gender | null;
  studentName: string;
  className: string;
  reason: string;
  minutes: number;
  school: string;
  markerName: string;
}): string {
  const stayWord = input.gender === "female" ? "נשארה" : input.gender === "male" ? "נשאר" : "נשאר/ה";
  const finishWord =
    input.gender === "female"
      ? "סיימה את ההשארות והיא בדרכה הביתה"
      : input.gender === "male"
        ? "סיים את ההשארות והוא בדרכו הביתה"
        : "סיים/ה את ההשארות ובדרך הביתה";
  const who =
    input.audience === "homeroom" && input.className
      ? `${input.studentName} מכיתה ${input.className}`
      : input.studentName;

  if (input.event === "marked") {
    const base = `שלום, הודעה מ${input.school}:\n${who} ${stayWord} היום אחרי שעות הלימודים.\nסיבה: ${input.reason}\nמשך: ${input.minutes} דקות.`;
    if (input.audience === "homeroom" && input.markerName) {
      return `${base}\nסומן על ידי: ${input.markerName}.`;
    }
    return base;
  }
  return `שלום, הודעה מ${input.school}:\n${who} ${finishWord}.`;
}
