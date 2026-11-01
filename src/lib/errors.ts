export function hebrewError(message: string): string {
  if (/foreign key|violates foreign key constraint|23503/i.test(message)) {
    return "אי אפשר למחוק כי יש השארות רשומות. אפשר להעביר לארכיון במקום.";
  }
  if (/row-level security|permission denied/i.test(message)) return "אין הרשאה לפעולה הזו";
  if (message.includes("students_unique_name")) return "תלמיד עם אותו שם כבר קיים בכיתה";
  if (message.includes("classes_name")) return "כיתה בשם הזה כבר קיימת";
  if (message.includes("detention_reasons_label")) return "הסיבה כבר קיימת";
  const hebrew = message.match(/[\u0590-\u05FF][^:\n]*/);
  if (hebrew) return hebrew[0].replace(/\s+$/g, "");
  return "אירעה שגיאה. נסו שוב.";
}

export function asError(error: unknown): Error {
  if (error instanceof Error) return new Error(hebrewError(error.message));
  if (error && typeof error === "object" && "message" in error) {
    return new Error(hebrewError(String((error as { message: unknown }).message)));
  }
  return new Error("אירעה שגיאה. נסו שוב.");
}
