const JERUSALEM = "Asia/Jerusalem";

export function jerusalemToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JERUSALEM,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: JERUSALEM,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function jerusalemClock(date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: JERUSALEM,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** 0 Sunday … 6 Saturday, in Asia/Jerusalem. */
export function jerusalemDow(now = new Date()): number {
  const label = new Intl.DateTimeFormat("en-US", { timeZone: JERUSALEM, weekday: "short" }).format(now);
  const index = WEEKDAYS.indexOf(label);
  return index < 0 ? 0 : index;
}

/**
 * Detention starts at the school day's end, unless it is marked after that time.
 * Returns null when that weekday has no school.
 */
export function defaultReleaseIso(durationMinutes: number, endTime: string | null, now = new Date()): string | null {
  if (!endTime) return null;
  const endMs = new Date(jerusalemDateTimeIso(endTime.slice(0, 5), now)).getTime();
  const start = now.getTime() > endMs ? now.getTime() : endMs;
  return new Date(start + durationMinutes * 60000).toISOString();
}

/** ISO timestamp for a clock time on today's Jerusalem date. */
export function jerusalemDateTimeIso(time: string, base = new Date()): string {
  const day = jerusalemToday(base);
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  let utc = Date.UTC(year, month - 1, date, hour, minute);
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: JERUSALEM,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 4; i += 1) {
    const parts = Object.fromEntries(fmt.formatToParts(new Date(utc)).map((part) => [part.type, part.value]));
    const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    const wanted = Date.UTC(year, month - 1, date, hour, minute);
    utc += wanted - shown;
  }
  return new Date(utc).toISOString();
}

export function countdownLabel(releaseAt: string, now = Date.now()): string | null {
  const left = new Date(releaseAt).getTime() - now;
  if (left <= 0) return null;
  const total = Math.ceil(left / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const clock = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${clock}` : clock;
}

export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: JERUSALEM,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1, 12)));
}

export function shiftDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1, 12));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
