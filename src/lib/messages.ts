import type { Gender, NotificationEvent, RecipientType } from "../api/types";

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
