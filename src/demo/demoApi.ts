import { DAY_KEYS, DEFAULT_PARENT_TEMPLATE, DEFAULT_WEEK, hoursForDate } from "../api/types";
import { closedMarkingMessage, defaultReleaseIso, jerusalemClock, jerusalemDow, jerusalemToday, releaseClockAllowed, withinSchoolHours } from "../lib/dates";
import { applyParentTemplate, renderDetentionMessage } from "../lib/messages";
import { normalizeIlPhone, whatsappCandidates } from "../lib/phone";
import type {
  AppApi,
  ClassRoom,
  Detention,
  DetentionInput,
  DetentionQuery,
  NotificationRow,
  Profile,
  Reason,
  Role,
  SchoolSettings,
  SessionState,
  Student,
  StudentContact,
  StudentInput,
} from "../api/types";

interface DemoState {
  currentId: string | null;
  settings: SchoolSettings;
  allowedEmails: string[];
  profiles: Profile[];
  classes: ClassRoom[];
  students: Student[];
  contacts: Record<string, StudentContact>;
  reasons: Reason[];
  detentions: Detention[];
  notifications: NotificationRow[];
}

const STORAGE_KEY = "hishaarut-demo-v3";

function seed(): DemoState {
  const profiles: Profile[] = [
    { id: "demo-admin", email: "1003870383@school.test", fullName: "מנהלת בית הספר", phone: "050-7001001", role: "admin", requestedRole: null, requestedClassIds: [], isOwner: true },
    { id: "demo-teacher", email: "teacher@school.test", fullName: "רונית מורה", phone: null, role: "teacher", requestedRole: null, requestedClassIds: [], isOwner: false },
    { id: "demo-homeroom", email: "homeroom@school.test", fullName: "מיכל מחנכת", phone: "050-7111111", role: "homeroom", requestedRole: null, requestedClassIds: [], isOwner: false },
    { id: "demo-secretary", email: "secretary@school.test", fullName: "דנה מזכירה", phone: "050-7222222", role: "secretary", requestedRole: null, requestedClassIds: [], isOwner: false },
    { id: "demo-pending", email: "pending@school.test", fullName: "יונתן חדש", phone: null, role: null, requestedRole: "homeroom", requestedClassIds: ["c-z2"], isOwner: false },
    { id: "demo-new", email: "new@school.test", fullName: "אדם חדש", phone: null, role: null, requestedRole: null, requestedClassIds: [], isOwner: false },
  ];
  const classes: ClassRoom[] = [
    { id: "c-z1", name: "ז׳1", grade: "ז", homeroomTeacherId: "demo-homeroom", active: true },
    { id: "c-z2", name: "ז׳2", grade: "ז", homeroomTeacherId: null, active: true },
    { id: "c-h1", name: "ח׳1", grade: "ח", homeroomTeacherId: null, active: true },
    { id: "c-h2", name: "ח׳2", grade: "ח", homeroomTeacherId: null, active: true },
    { id: "c-t1", name: "ט׳1", grade: "ט", homeroomTeacherId: null, active: true },
  ];
  const rows: Array<[string, string, string, "male" | "female", string, string, string]> = [
    ["s1", "נתן", "ברק", "male", "c-z1", "מיכל ברק", "050-7000001"],
    ["s2", "איתי", "חדד", "male", "c-z1", "יואב חדד", "050-7000002"],
    ["s3", "מאיר", "אברהם", "male", "c-z1", "רחל אברהם", "050-7000003"],
    ["s4", "עומר", "פרץ", "male", "c-z1", "דוד פרץ", "050-7000004"],
    ["s5", "יובל", "מזרחי", "male", "c-z2", "אורלי מזרחי", "050-7000005"],
    ["s6", "תומר", "אוחיון", "male", "c-z2", "חיים אוחיון", "050-7000006"],
    ["s7", "אריאל", "ביטון", "male", "c-z2", "שרה ביטון", "050-7000007"],
    ["s8", "הלל", "דהן", "male", "c-h1", "משה דהן", "050-7000008"],
    ["s9", "דניאל", "קדוש", "male", "c-h1", "יעל קדוש", "050-7000009"],
    ["s10", "שחר", "לוי", "male", "c-h1", "אבי לוי", "050-7000010"],
    ["s11", "רועי", "אזולאי", "male", "c-h2", "ענת אזולאי", "050-7000011"],
    ["s12", "ליאור", "כהן", "male", "c-h2", "גיא כהן", "050-7000012"],
    ["s13", "אדם", "גבאי", "male", "c-t1", "דנה גבאי", "050-7000013"],
    ["s14", "יואב", "משה", "male", "c-t1", "יוסי משה", "050-7000014"],
    ["s15", "ים", "חדד", "male", "c-t1", "רינה חדד", "050-7000015"],
    ["s16", "יונתן", "לוי", "male", "c-z1", "שרה לוי", "050-7000016"],
    ["s17", "אליהו", "כהן", "male", "c-z2", "רחל כהן", "050-7000017"],
    ["s18", "מנחם", "פרידמן", "male", "c-z2", "לאה פרידמן", "050-7000018"],
    ["s19", "בנימין", "גולד", "male", "c-h1", "מרים גולד", "050-7000019"],
    ["s20", "שמעון", "ברק", "male", "c-h1", "דינה ברק", "050-7000020"],
    ["s21", "אהרן", "מזרחי", "male", "c-h2", "חנה מזרחי", "050-7000021"],
    ["s22", "משה", "אזולאי", "male", "c-h2", "רבקה אזולאי", "050-7000022"],
    ["s23", "יצחק", "חדד", "male", "c-t1", "אסתר חדד", "050-7000023"],
    ["s24", "יעקב", "דהן", "male", "c-t1", "מלכה דהן", "050-7000024"],
    ["s25", "דוד", "קדוש", "male", "c-z1", "ציפורה קדוש", "050-7000025"],
  ];
  const students: Student[] = rows.map(([id, firstName, lastName, gender, classId]) => ({
    id,
    firstName,
    lastName,
    gender,
    classId,
    active: true,
  }));
  const contacts: Record<string, StudentContact> = {};
  rows.forEach(([id, , , , , parentName, parentPhone]) => {
    contacts[id] = {
      studentId: id,
      parentName,
      parentPhone,
      parentPhone2: null,
      parentPhoneNoWhatsapp: false,
      parentPhone2NoWhatsapp: false,
      parent2Name: null,
      parent2Phone: null,
      parent2Phone2: null,
      parent2PhoneNoWhatsapp: false,
      parent2Phone2NoWhatsapp: false,
    };
  });
  return {
    currentId: null,
    settings: {
      schoolName: "בית הספר",
      allowedEmailDomain: null,
      autoApproveDomain: null,
      schedule: structuredClone(DEFAULT_WEEK),
      closures: [],
      specialDays: [],
      parentMessageTemplate: DEFAULT_PARENT_TEMPLATE,
      notificationMode: "manual_link",
      whatsappPhoneNumberId: null,
      whatsappDisplayNumber: null,
    },
    allowedEmails: [],
    profiles,
    classes,
    students,
    contacts,
    reasons: [
      { id: "r1", label: "חיסור בתפילה", active: true, sortOrder: 10 },
      { id: "r2", label: "הפרעה בשיעור", active: true, sortOrder: 20 },
      { id: "r3", label: "היעדרות משיעור", active: true, sortOrder: 30 },
      { id: "r4", label: "אי-הכנת שיעורי בית", active: true, sortOrder: 40 },
      { id: "r5", label: "איחור", active: true, sortOrder: 50 },
    ],
    ...todayBoard(students, classes, contacts),
  };
}

function todayBoard(
  students: Student[],
  classes: ClassRoom[],
  contacts: Record<string, StudentContact>,
): { detentions: Detention[]; notifications: NotificationRow[] } {
  const reasons = ["חיסור בתפילה", "הפרעה בשיעור", "היעדרות משיעור", "איחור", "אי-הכנת שיעורי בית"];
  const now = Date.now();
  const detentions: Detention[] = [];
  const notifications: NotificationRow[] = [];
  students.forEach((student, index) => {
    const room = classes.find((item) => item.id === student.classId);
    const ready = index < 8;
    const released = index >= 20;
    const minutes = ready ? -20 - index * 4 : released ? -40 : 12 + (index - 8) * 7;
    const marker =
      index === 2 || index === 14
        ? { id: "demo-teacher", name: "רונית מורה" }
        : index === 4 || index === 9
          ? { id: "demo-homeroom", name: "מיכל מחנכת" }
          : { id: "demo-other", name: ["יוסי מלמד", "אבי מלמד", "חיים מלמד", "דוד מלמד"][index % 4] };
    const detention: Detention = {
      id: `d-${student.id}`,
      studentId: student.id,
      reasonId: null,
      reasonText: reasons[index % reasons.length],
      durationMinutes: 30,
      status: released ? "completed" : "pending",
      detentionDate: jerusalemToday(),
      releaseAt: new Date(now + minutes * 60000).toISOString(),
      markedBy: marker.id,
      markedAt: new Date(now - 40 * 60000).toISOString(),
      signedBy: released ? "demo-secretary" : null,
      signedAt: released ? new Date(now - 5 * 60000).toISOString() : null,
      notes: index === 3 ? "התבקש לסיים דף עבודה" : null,
      studentFirstName: student.firstName,
      studentLastName: student.lastName,
      studentGender: student.gender,
      classId: student.classId,
      className: room?.name ?? "",
      markerName: marker.name,
      signerName: released ? "דנה מזכירה" : null,
      releaserName: released ? "דנה מזכירה" : null,
    };
    detentions.push(detention);
    const phone = contacts[student.id]?.parentPhone?.replace(/\D/g, "");
    notifications.push({
      id: `n-${student.id}`,
      detentionId: detention.id,
      event: "marked",
      recipientType: "parent",
      channel: "whatsapp_link",
      recipientLabel: contacts[student.id]?.parentName ?? "אב",
      recipientPhone: phone ? `972${phone.slice(1)}` : null,
      fallbackPhones: [],
      messageBody: applyParentTemplate(DEFAULT_PARENT_TEMPLATE, {
        parentName: contacts[student.id]?.parentName ?? null,
        studentName: `${student.firstName} ${student.lastName}`,
        className: room?.name ?? "",
        releaseTime: jerusalemClock(new Date(now + minutes * 60000)),
        reason: reasons[index % reasons.length],
      }),
      status: phone ? "pending" : "skipped",
      sentAt: null,
      errorText: phone ? null : "no_phone",
    });
  });
  return { detentions, notifications };
}

function load(): DemoState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    return { ...seed(), ...JSON.parse(raw) } as DemoState;
  } catch {
    return seed();
  }
}

const state = load();
const sessionListeners = new Set<(session: SessionState | null) => void>();
const changeListeners = new Set<() => void>();

function persist() {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function current(): Profile | null {
  return state.profiles.find((profile) => profile.id === state.currentId) ?? null;
}

function session(): SessionState | null {
  const profile = current();
  if (!profile) return null;
  return { userId: profile.id, email: profile.email, profile: { ...profile } };
}

function emitSession() {
  const value = session();
  sessionListeners.forEach((listener) => listener(value));
}

function emitChange() {
  persist();
  changeListeners.forEach((listener) => listener());
}

function requireManager(): Profile {
  const profile = requireUser();
  if (profile.role !== "admin" && profile.role !== "secretary") throw new Error("אין הרשאה לפעולה הזו");
  return profile;
}

function requireUser(): Profile {
  const profile = current();
  if (!profile) throw new Error("אין משתמש מחובר");
  return profile;
}

function isStaff(profile: Profile): boolean {
  return profile.role !== null;
}

function canSign(profile: Profile): boolean {
  return profile.role === "secretary" || profile.role === "admin";
}

function managesClass(profile: Profile, classId: string): boolean {
  if (profile.role === "admin" || profile.role === "secretary") return true;
  if (profile.role !== "homeroom") return false;
  return state.classes.some((room) => room.id === classId && room.homeroomTeacherId === profile.id);
}

function canViewContact(profile: Profile, classId: string): boolean {
  return profile.role === "admin" || profile.role === "secretary" || managesClass(profile, classId);
}

function enqueue(detention: Detention, event: NotificationRow["event"]) {
  const student = state.students.find((item) => item.id === detention.studentId);
  const room = state.classes.find((item) => item.id === student?.classId);
  const homeroom = state.profiles.find((item) => item.id === room?.homeroomTeacherId);
  const contact = student ? state.contacts[student.id] : undefined;
  const marker = state.profiles.find((item) => item.id === detention.markedBy);
  const channel = state.settings.notificationMode === "cloud_api" ? "whatsapp_cloud" : "whatsapp_link";
  const homeroomPhone = normalizeIlPhone(homeroom?.phone);
  const base = {
    event,
    channel,
    detentionId: detention.id,
  } as const;
  const homeroomMessage = renderDetentionMessage({
    event,
    audience: "homeroom",
    gender: student?.gender ?? null,
    studentName: `${detention.studentFirstName} ${detention.studentLastName}`,
    className: detention.className,
    reason: detention.reasonText,
    minutes: detention.durationMinutes,
    school: state.settings.schoolName,
    markerName: marker?.fullName ?? "",
  });
  const releaseLabel = jerusalemClock(new Date(detention.releaseAt));
  const parentNotes = (
    [
      ["father", contact?.parentName ?? null, contact?.parentPhone ?? null, contact?.parentPhone2 ?? null, contact?.parentPhoneNoWhatsapp, contact?.parentPhone2NoWhatsapp],
      ["mother", contact?.parent2Name ?? null, contact?.parent2Phone ?? null, contact?.parent2Phone2 ?? null, contact?.parent2PhoneNoWhatsapp, contact?.parent2Phone2NoWhatsapp],
    ] as const
  ).flatMap(([slot, name, phone, phone2, off, off2]) => {
    const hasRaw = Boolean(phone?.trim() || phone2?.trim() || name?.trim());
    if (!hasRaw) return [];
    const candidates = whatsappCandidates([
      { phone, noWhatsapp: off },
      { phone: phone2, noWhatsapp: off2 },
    ]);
    const anyValid = [phone, phone2].some((item) => normalizeIlPhone(item));
    const markedBody =
      event === "marked"
        ? applyParentTemplate(state.settings.parentMessageTemplate, {
            parentName: name,
            studentName: `${detention.studentFirstName} ${detention.studentLastName}`,
            className: detention.className,
            releaseTime: releaseLabel,
            reason: detention.reasonText,
          })
        : renderDetentionMessage({
            event,
            audience: "parent",
            gender: student?.gender ?? null,
            studentName: `${detention.studentFirstName} ${detention.studentLastName}`,
            className: detention.className,
            reason: detention.reasonText,
            minutes: detention.durationMinutes,
            school: state.settings.schoolName,
            markerName: marker?.fullName ?? "",
          });
    const note: NotificationRow = {
      ...base,
      id: crypto.randomUUID(),
      recipientType: "parent",
      recipientLabel: name?.trim() || (slot === "father" ? "אב" : "אם"),
      recipientPhone: candidates[0] ?? null,
      fallbackPhones: candidates.slice(1),
      messageBody: markedBody,
      status: candidates[0] ? "pending" : "skipped",
      sentAt: null,
      errorText: candidates[0] ? null : phone?.trim() || phone2?.trim() ? (anyValid ? "no_whatsapp" : "invalid_phone") : "no_phone",
    };
    return [note];
  });
  let homeroomError: string | null = null;
  let homeroomStatus: NotificationRow["status"] = "pending";
  let storedHomeroomPhone: string | null = homeroomPhone;
  if (!room?.homeroomTeacherId) {
    homeroomStatus = "skipped";
    homeroomError = "no_homeroom";
    storedHomeroomPhone = null;
  } else if (event === "marked" && room.homeroomTeacherId === detention.markedBy) {
    homeroomStatus = "skipped";
    homeroomError = "marked_by_homeroom";
    storedHomeroomPhone = null;
  } else if (!homeroomPhone) {
    homeroomStatus = "skipped";
    homeroomError = homeroom?.phone ? "invalid_phone" : "no_phone";
  }
  const homeroomNote: NotificationRow = {
    ...base,
    id: crypto.randomUUID(),
    recipientType: "homeroom",
    recipientLabel: homeroom?.fullName || "מחנך/ת",
    recipientPhone: storedHomeroomPhone,
    messageBody: homeroomMessage,
    status: homeroomStatus,
    sentAt: null,
    errorText: homeroomError,
  };
  state.notifications.push(...parentNotes, homeroomNote);
}

function visibleDetention(detention: Detention, profile: Profile): Detention | null {
  if (!isStaff(profile)) return null;
  return detention;
}

export const demoApi: AppApi = {
  isConfigured: true,
  isDemo: true,

  onSession(listener) {
    sessionListeners.add(listener);
    listener(session());
    return () => sessionListeners.delete(listener);
  },

  async refreshSession() {
    return session();
  },

  async signInWithGoogle() {
    throw new Error("במצב הדגמה נכנסים עם אחד התפקידים שעל המסך");
  },

  async signInAs(role: Role | "pending" | "new") {
    const match =
      role === "new"
        ? state.profiles.find((profile) => profile.id === "demo-new")
        : role === "pending"
          ? state.profiles.find((profile) => profile.id === "demo-pending")
          : state.profiles.find((profile) => profile.role === role);
    if (!match) throw new Error("משתמש הדגמה לא נמצא");
    state.currentId = match.id;
    persist();
    emitSession();
  },

  async signOut() {
    state.currentId = null;
    persist();
    emitSession();
  },

  async getAccessToken() {
    return state.currentId ? "demo-token" : null;
  },

  async updateOwnProfile(patch) {
    const profile = requireUser();
    profile.fullName = patch.fullName.trim();
    profile.phone = patch.phone.trim() || null;
    if (patch.title !== undefined) profile.title = patch.title?.trim() || null;
    emitSession();
    emitChange();
  },

  async getSettings() {
    requireUser();
    return { ...state.settings };
  },

  async updateSettings(patch) {
    const profile = requireUser();
    if (profile.role !== "admin") throw new Error("רק מנהל יכול לעדכן הגדרות");
    state.settings = {
      ...patch,
      schedule: state.settings.schedule,
      closures: state.settings.closures,
      specialDays: state.settings.specialDays,
      parentMessageTemplate: state.settings.parentMessageTemplate,
    };
    emitChange();
  },

  async updateSchedule(schedule) {
    const profile = requireUser();
    if (profile.role !== "admin" && profile.role !== "secretary") throw new Error("רק מנהל יכול לעדכן הגדרות");
    state.settings = { ...state.settings, schedule: structuredClone(schedule) };
    emitChange();
  },

  async updateParentTemplate(template) {
    const profile = requireUser();
    if (profile.role !== "admin" && profile.role !== "secretary") throw new Error("רק מנהל יכול לעדכן הגדרות");
    state.settings = { ...state.settings, parentMessageTemplate: template.trim() || DEFAULT_PARENT_TEMPLATE };
    emitChange();
  },

  async addClosure(date) {
    const profile = requireUser();
    if (profile.role !== "admin" && profile.role !== "secretary") throw new Error("רק מנהל יכול לעדכן הגדרות");
    if (!state.settings.closures.includes(date)) {
      state.settings = { ...state.settings, closures: [...state.settings.closures, date].sort() };
    }
    emitChange();
  },

  async setSpecialDay(date, start, end) {
    const profile = requireUser();
    if (profile.role !== "admin" && profile.role !== "secretary") throw new Error("רק מנהל יכול לעדכן הגדרות");
    if (start && end && start >= end) throw new Error("שעת ההתחלה חייבת להיות לפני שעת הסיום");
    const closures = state.settings.closures.filter((item) => item !== date);
    const specialDays = (state.settings.specialDays ?? []).filter((item) => item.date !== date);
    if (end) specialDays.push({ date, start, end });
    else closures.push(date);
    state.settings = { ...state.settings, closures: closures.sort(), specialDays: specialDays.sort((a, b) => a.date.localeCompare(b.date)) };
    emitChange();
  },

  async removeClosure(date) {
    const profile = requireUser();
    if (profile.role !== "admin" && profile.role !== "secretary") throw new Error("רק מנהל יכול לעדכן הגדרות");
    state.settings = {
      ...state.settings,
      closures: state.settings.closures.filter((item) => item !== date),
      specialDays: (state.settings.specialDays ?? []).filter((item) => item.date !== date),
    };
    emitChange();
  },

  async accessStatus() {
    const profile = requireUser();
    const domain = state.settings.autoApproveDomain?.trim().toLowerCase() ?? "";
    const emailDomain = profile.email.toLowerCase().split("@")[1] ?? "";
    if (!profile.role && domain && emailDomain === domain) {
      profile.role = "teacher";
      profile.requestedRole = null;
      profile.requestedClassIds = [];
      emitSession();
      emitChange();
    }
    if (!profile.email) return "denied";
    return profile.role ? "ok" : "pending";
  },

  async listAllowedEmails() {
    const profile = requireUser();
    if (profile.role !== "admin") throw new Error("רק מנהל יכול לעדכן הגדרות");
    return [...(state.allowedEmails ?? [])];
  },

  async setAllowedEmails(emails) {
    const profile = requireUser();
    if (profile.role !== "admin") throw new Error("רק מנהל יכול לעדכן הגדרות");
    const unique = new Set(
      emails.map((email) => email.trim().toLowerCase()).filter((email) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)),
    );
    state.allowedEmails = [...unique];
    emitChange();
  },

  async listClasses() {
    const profile = requireUser();
    if (!isStaff(profile)) return [];
    return state.classes.map((room) => ({ ...room }));
  },

  async saveClass(input) {
    const profile = requireUser();
    if (profile.role !== "admin" && profile.role !== "secretary") throw new Error("אין הרשאה לפעולה הזו");
    if (input.homeroomTeacherId) {
      const teacher = state.profiles.find((item) => item.id === input.homeroomTeacherId);
      if (teacher?.role !== "homeroom") throw new Error("מחנך הכיתה חייב להיות משתמש בתפקיד מחנך");
    }
    if (input.id) {
      const room = state.classes.find((item) => item.id === input.id);
      if (!room) throw new Error("הכיתה לא נמצאה");
      room.name = input.name.trim();
      room.grade = input.grade.trim() || null;
      room.homeroomTeacherId = input.homeroomTeacherId;
      room.active = input.active;
    } else {
      state.classes.push({
        id: crypto.randomUUID(),
        name: input.name.trim(),
        grade: input.grade.trim() || null,
        homeroomTeacherId: input.homeroomTeacherId,
        active: input.active,
      });
    }
    emitChange();
  },

  async setClassActive(id, active, includeStudents) {
    requireManager();
    const room = state.classes.find((item) => item.id === id);
    if (!room) throw new Error("הכיתה לא נמצאה");
    room.active = active;
    if (includeStudents) {
      state.students.forEach((student) => {
        if (student.classId === id) student.active = active;
      });
    }
    emitChange();
  },

  async deleteClass(id, confirmName) {
    requireManager();
    const room = state.classes.find((item) => item.id === id);
    if (!room) throw new Error("הכיתה לא נמצאה");
    const kids = state.students.filter((student) => student.classId === id);
    const history = kids.some((student) => state.detentions.some((detention) => detention.studentId === student.id));
    if (history && (confirmName ?? "").trim() !== room.name) {
      throw new Error("כדי למחוק כיתה עם היסטוריה יש להקליד את שם הכיתה");
    }
    const gone = new Set(kids.map((student) => student.id));
    state.detentions = state.detentions.filter((detention) => !gone.has(detention.studentId));
    state.notifications = state.notifications.filter((note) => state.detentions.some((detention) => detention.id === note.detentionId));
    state.students = state.students.filter((student) => !gone.has(student.id));
    gone.forEach((studentId) => delete state.contacts[studentId]);
    state.classes = state.classes.filter((item) => item.id !== id);
    emitChange();
  },

  async listStudents() {
    const profile = requireUser();
    if (!isStaff(profile)) return [];
    return state.students.map((student) => ({ ...student }));
  },

  async getDetentionParentPhones(detentionId: string) {
    const profile = requireUser();
    const detention = state.detentions.find((item) => item.id === detentionId);
    if (!detention || detention.status === "cancelled") return { motherPhone: null, fatherPhone: null };
    const student = state.students.find((item) => item.id === detention.studentId);
    const allowed = detention.markedBy === profile.id || (student ? canViewContact(profile, student.classId) : false);
    const c = state.contacts[detention.studentId];
    if (!allowed || !c) return { motherPhone: null, fatherPhone: null };
    const pick = (a: string | null, aOff: boolean, b: string | null, bOff: boolean) =>
      (a && !aOff ? a : null) ?? (b && !bOff ? b : null);
    return {
      motherPhone: pick(c.parent2Phone, c.parent2PhoneNoWhatsapp, c.parent2Phone2, c.parent2Phone2NoWhatsapp),
      fatherPhone: pick(c.parentPhone, c.parentPhoneNoWhatsapp, c.parentPhone2, c.parentPhone2NoWhatsapp),
    };
  },

  async listContacts() {
    const profile = requireUser();
    return state.students
      .filter((student) => canViewContact(profile, student.classId))
      .map((student) => ({ ...state.contacts[student.id] }));
  },

  async saveStudent(input: StudentInput) {
    const profile = requireUser();
    if (!managesClass(profile, input.classId)) throw new Error("אין הרשאה לפעולה הזו");
    const duplicate = state.students.find(
      (student) =>
        student.classId === input.classId &&
        student.firstName === input.firstName.trim() &&
        student.lastName === input.lastName.trim() &&
        student.id !== input.id,
    );
    if (duplicate) throw new Error("תלמיד עם אותו שם כבר קיים בכיתה");
    if (input.id) {
      const student = state.students.find((item) => item.id === input.id);
      if (!student || !managesClass(profile, student.classId)) throw new Error("אין הרשאה לפעולה הזו");
      student.firstName = input.firstName.trim();
      student.lastName = input.lastName.trim();
      student.gender = input.gender;
      student.classId = input.classId;
      student.active = input.active;
      state.contacts[student.id] = {
        ...state.contacts[student.id],
        studentId: student.id,
        parentName: input.parentName.trim() || null,
        parentPhone: input.parentPhone.trim() || null,
        parentPhone2: input.parentPhone2?.trim() || null,
        parentPhoneNoWhatsapp: state.contacts[student.id]?.parentPhoneNoWhatsapp ?? false,
        parentPhone2NoWhatsapp: state.contacts[student.id]?.parentPhone2NoWhatsapp ?? false,
        parent2Name: input.parent2Name?.trim() || null,
        parent2Phone: input.parent2Phone?.trim() || null,
        parent2Phone2: input.parent2Phone2?.trim() || null,
        parent2PhoneNoWhatsapp: state.contacts[student.id]?.parent2PhoneNoWhatsapp ?? false,
        parent2Phone2NoWhatsapp: state.contacts[student.id]?.parent2Phone2NoWhatsapp ?? false,
      };
    } else {
      const id = crypto.randomUUID();
      state.students.push({
        id,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        gender: input.gender,
        classId: input.classId,
        active: input.active,
      });
      state.contacts[id] = {
        studentId: id,
        parentName: input.parentName.trim() || null,
        parentPhone: input.parentPhone.trim() || null,
        parentPhone2: input.parentPhone2?.trim() || null,
        parentPhoneNoWhatsapp: false,
        parentPhone2NoWhatsapp: false,
        parent2Name: input.parent2Name?.trim() || null,
        parent2Phone: input.parent2Phone?.trim() || null,
        parent2Phone2: input.parent2Phone2?.trim() || null,
        parent2PhoneNoWhatsapp: false,
        parent2Phone2NoWhatsapp: false,
      };
    }
    emitChange();
  },

  async countDetentions(studentIds) {
    requireUser();
    const ids = new Set(studentIds);
    return state.detentions.filter((detention) => ids.has(detention.studentId)).length;
  },

  async setStudentsActive(ids, active) {
    requireManager();
    const wanted = new Set(ids);
    let found = 0;
    state.students.forEach((student) => {
      if (!wanted.has(student.id)) return;
      student.active = active;
      found += 1;
    });
    if (ids.length > 0 && found !== ids.length) throw new Error("התלמיד לא נמצא");
    emitChange();
  },

  async deleteStudent(id, confirmName) {
    const profile = requireUser();
    const student = state.students.find((item) => item.id === id);
    if (!student) throw new Error("התלמיד לא נמצא");
    if (!managesClass(profile, student.classId)) throw new Error("אין הרשאה למחוק את התלמיד");
    const history = state.detentions.some((detention) => detention.studentId === id);
    const expected = `${student.firstName} ${student.lastName}`;
    if (history && (confirmName ?? "").trim() !== expected) {
      throw new Error("כדי למחוק תלמיד עם היסטוריה יש להקליד את שמו המלא");
    }
    state.detentions = state.detentions.filter((detention) => detention.studentId !== id);
    state.notifications = state.notifications.filter((note) => state.detentions.some((detention) => detention.id === note.detentionId));
    state.students = state.students.filter((item) => item.id !== id);
    delete state.contacts[id];
    emitChange();
  },

  async setWhatsappOptOut(studentId, slot, noWhatsapp) {
    requireManager();
    const contact = state.contacts[studentId];
    if (!contact) throw new Error("התלמיד לא נמצא");
    if (slot === "parent1") contact.parentPhoneNoWhatsapp = noWhatsapp;
    else if (slot === "parent1b") contact.parentPhone2NoWhatsapp = noWhatsapp;
    else if (slot === "parent2") contact.parent2PhoneNoWhatsapp = noWhatsapp;
    else contact.parent2Phone2NoWhatsapp = noWhatsapp;
    emitChange();
  },

  async listReasons() {
    const profile = requireUser();
    if (!isStaff(profile)) return [];
    return state.reasons.map((reason) => ({ ...reason })).sort((a, b) => a.sortOrder - b.sortOrder);
  },

  async saveReason(input) {
    const profile = requireUser();
    if (profile.role !== "admin") throw new Error("אין הרשאה לפעולה הזו");
    if (input.id) {
      const reason = state.reasons.find((item) => item.id === input.id);
      if (!reason) throw new Error("הסיבה לא נמצאה");
      reason.label = input.label.trim();
      reason.active = input.active;
      reason.sortOrder = input.sortOrder;
    } else {
      state.reasons.push({
        id: crypto.randomUUID(),
        label: input.label.trim(),
        active: input.active,
        sortOrder: input.sortOrder,
      });
    }
    emitChange();
  },

  async listProfiles() {
    const profile = requireUser();
    if (!isStaff(profile)) return [profile];
    return state.profiles.map((item) => ({ ...item }));
  },

  async setUserRole(userId, role) {
    const profile = requireUser();
    const target = state.profiles.find((item) => item.id === userId);
    if (!target) throw new Error("המשתמש לא נמצא");
    if (target.isOwner && profile.id !== target.id) throw new Error("רק בעל המערכת יכול לשנות את הפרופיל שלו");
    if (target.isOwner && role !== "admin") throw new Error("בעל המערכת נשאר מנהל");
    if (profile.role === "secretary") {
      if (target.role === "admin" || role === "admin") throw new Error("מזכירות לא יכולה למנות או לשנות מנהל");
    } else if (profile.role !== "admin") {
      throw new Error("אין הרשאה לשנות תפקיד");
    }
    if (target.role === "admin" && role !== "admin") {
      const others = state.profiles.filter((item) => item.role === "admin" && item.id !== target.id);
      if (others.length === 0) throw new Error("אי אפשר להסיר את המנהל האחרון");
    }
    target.role = role;
    target.requestedRole = null;
    target.requestedClassIds = [];
    if (role !== "homeroom") {
      state.classes.forEach((room) => {
        if (room.homeroomTeacherId === target.id) room.homeroomTeacherId = null;
      });
    }
    if (target.id === profile.id) emitSession();
    emitChange();
  },

  async listOpenClasses() {
    requireUser();
    return state.classes
      .filter((room) => room.active)
      .map((room) => ({ id: room.id, name: room.name, hasHomeroom: Boolean(room.homeroomTeacherId) }));
  },

  async updateStaffProfile(userId, patch) {
    const profile = requireUser();
    if (profile.role !== "admin" && profile.role !== "secretary") throw new Error("אין הרשאה לפעולה הזו");
    const target = state.profiles.find((item) => item.id === userId);
    if (!target) throw new Error("המשתמש לא נמצא");
    if (target.role === "admin" && profile.role !== "admin") throw new Error("מזכירות לא יכולה לשנות מנהל");
    target.fullName = patch.fullName.trim();
    target.title = patch.title?.trim() || null;
    emitSession();
    emitChange();
  },

  async requestStaffRole(role, classIds) {
    const profile = requireUser();
    if (profile.role) throw new Error("כבר יש תפקיד לחשבון");
    if (!["teacher", "homeroom", "secretary", "admin"].includes(role)) throw new Error("תפקיד לא תקין");
    if (role === "homeroom" && classIds.length === 0) throw new Error("מחנך בוחר כיתה קיימת");
    profile.requestedRole = role;
    profile.requestedClassIds = role === "homeroom" ? classIds : [];
    emitSession();
    emitChange();
  },

  async approveStaffRequest(userId, role, classIds) {
    const profile = requireUser();
    if (profile.role !== "admin" && profile.role !== "secretary") throw new Error("רק מנהל או מזכירות יכולים לאשר תפקיד");
    if (role === "admin" && profile.role !== "admin") throw new Error("מזכירות לא יכולה למנות או לשנות מנהל");
    await this.setUserRole(userId, role);
    const target = state.profiles.find((item) => item.id === userId);
    if (!target) return;
    if (role === "homeroom") {
      state.classes.forEach((room) => {
        if (classIds.includes(room.id)) room.homeroomTeacherId = target.id;
        else if (room.homeroomTeacherId === target.id) room.homeroomTeacherId = null;
      });
    }
    emitChange();
  },

  async rejectStaffRequest(userId) {
    const profile = requireUser();
    if (profile.role !== "admin" && profile.role !== "secretary") throw new Error("רק מנהל או מזכירות יכולים לאשר תפקיד");
    const target = state.profiles.find((item) => item.id === userId);
    if (!target || target.isOwner) throw new Error("רק בעל המערכת יכול לשנות את הפרופיל שלו");
    target.requestedRole = null;
    target.requestedClassIds = [];
    emitChange();
  },

  async transferOwnership(userId) {
    const profile = requireUser();
    if (!profile.isOwner) throw new Error("רק בעל המערכת יכול להעביר בעלות");
    const next = state.profiles.find((item) => item.id === userId);
    if (!next || next.role !== "admin" || next.id === profile.id) throw new Error("אפשר להעביר בעלות רק למנהל");
    profile.isOwner = false;
    next.isOwner = true;
    emitSession();
    emitChange();
  },

  async listReport(from, to) {
    const profile = requireUser();
    if (!profile.role) throw new Error("אין הרשאה לדוח");
    const own = new Set(state.classes.filter((room) => room.homeroomTeacherId === profile.id).map((room) => room.id));
    return state.detentions
      .filter((detention) => detention.detentionDate >= from && detention.detentionDate <= to)
      .filter((detention) =>
        profile.role === "admin" || profile.role === "secretary" ? true : own.has(detention.classId) || detention.markedBy === profile.id,
      )
      .map((detention) => ({ ...detention }));
  },

  async listDetentions(query: DetentionQuery) {
    const profile = requireUser();
    return state.detentions
      .filter((detention) => visibleDetention(detention, profile))
      .filter((detention) => (query.date ? detention.detentionDate === query.date : true))
      .filter((detention) => (query.from ? detention.detentionDate >= query.from : true))
      .filter((detention) => (query.to ? detention.detentionDate <= query.to : true))
      .filter((detention) => (query.markedBy ? detention.markedBy === query.markedBy : true))
      .sort((a, b) => b.markedAt.localeCompare(a.markedAt))
      .map((detention) => ({ ...detention }));
  },

  async createDetention(input: DetentionInput) {
    const profile = requireUser();
    if (!profile.role) throw new Error("אין הרשאה לסמן השארות");
    const student = state.students.find((item) => item.id === input.studentId && item.active);
    if (!student) throw new Error("התלמיד אינו פעיל");
    if (input.durationMinutes < 1 || input.durationMinutes > 240) throw new Error("משך ההשארות אינו תקין");
    let reasonText = input.reasonText.trim();
    if (input.reasonId) {
      const reason = state.reasons.find((item) => item.id === input.reasonId && item.active);
      if (!reason) throw new Error("הסיבה אינה פעילה");
      reasonText = reason.label;
    }
    if (!reasonText) throw new Error("יש לבחור סיבה");
    const todayKey = DAY_KEYS[jerusalemDow()];
    const todayHours = hoursForDate({ ...state.settings, specialDays: state.settings.specialDays ?? [] }, jerusalemToday(), jerusalemDow()) ?? { start: null, end: null };
    void todayKey;
    const sample = DAY_KEYS.map((key) => state.settings.schedule[key]).find((day) => day.start && day.end) ?? { start: "07:00", end: "16:00" };
    const messageHours = todayHours.start && todayHours.end ? todayHours : sample;
    const open = withinSchoolHours(todayHours.start, todayHours.end);
    if (!open) {
      throw new Error(closedMarkingMessage(messageHours.start ?? "07:00", messageHours.end ?? "16:00"));
    }
    const room = state.classes.find((item) => item.id === student.classId);
    const computedRelease =
      defaultReleaseIso(input.durationMinutes, todayHours.end) ?? new Date(Date.now() + input.durationMinutes * 60000).toISOString();
    if (input.releaseAt && todayHours.end && !releaseClockAllowed(jerusalemClock(new Date(input.releaseAt)), todayHours.end)) {
      throw new Error("שעת היציאה יכולה להיות מסיום הלימודים ועד שלוש שעות אחריו, באותו היום");
    }
    const detention: Detention = {
      id: crypto.randomUUID(),
      studentId: student.id,
      reasonId: input.reasonId,
      reasonText,
      durationMinutes: input.durationMinutes,
      status: "pending",
      detentionDate: jerusalemToday(),
      releaseAt: input.releaseAt ?? computedRelease,
      markedBy: profile.id,
      markedAt: new Date().toISOString(),
      signedBy: null,
      signedAt: null,
      notes: input.notes?.trim() || null,
      studentFirstName: student.firstName,
      studentLastName: student.lastName,
      studentGender: student.gender,
      classId: student.classId,
      className: room?.name ?? "",
      markerName: profile.fullName,
      signerName: null,
      releaserName: null,
    };
    state.detentions.unshift(detention);
    enqueue(detention, "marked");
    emitChange();
    return detention.id;
  },

  async completeDetention(id, early = false) {
    const profile = requireUser();
    if (!isStaff(profile)) throw new Error("אין הרשאה לאשר סיום");
    const detention = state.detentions.find((item) => item.id === id);
    if (!detention || detention.status !== "pending") throw new Error("מעבר סטטוס אינו חוקי");
    if (new Date(detention.releaseAt).getTime() > Date.now() && !(early && profile.role === "admin")) {
      throw new Error("עדיין לא הגיעה שעת היציאה");
    }
    detention.status = "completed";
    detention.signedBy = profile.id;
    detention.signedAt = new Date().toISOString();
    detention.signerName = profile.fullName;
    detention.releaserName = profile.fullName;
    enqueue(detention, "completed");
    emitChange();
  },

  async cancelDetention(id) {
    const profile = requireUser();
    const detention = state.detentions.find((item) => item.id === id);
    if (!detention || detention.status !== "pending") throw new Error("מעבר סטטוס אינו חוקי");
    if (!canSign(profile) && detention.markedBy !== profile.id) throw new Error("אין הרשאה לבטל");
    detention.status = "cancelled";
    emitChange();
  },

  async editDetention(id, patch) {
    const profile = requireUser();
    const detention = state.detentions.find((item) => item.id === id);
    if (!detention) throw new Error("ההשארות לא נמצאה");
    if (!demoCanChange(profile, detention)) throw new Error("אין הרשאה לערוך את ההשארות");
    if (detention.status !== "pending") throw new Error("אפשר לערוך רק השארות שעוד לא הסתיימה");
    const minutes = Math.ceil((Date.parse(patch.releaseAt) - Date.parse(detention.markedAt)) / 60000);
    if (minutes < 1 || minutes > 240) throw new Error("שעת היציאה עד 4 שעות אחרי הסימון");
    const label = patch.reasonId ? state.reasons.find((reason) => reason.id === patch.reasonId)?.label : patch.reasonText.trim();
    if (!label) throw new Error("יש לבחור סיבה");
    detention.reasonId = patch.reasonId;
    detention.reasonText = label;
    detention.releaseAt = patch.releaseAt;
    detention.durationMinutes = minutes;
    emitChange();
  },

  async deleteDetention(id) {
    const profile = requireUser();
    const detention = state.detentions.find((item) => item.id === id);
    if (!detention) return;
    if (!demoCanChange(profile, detention)) throw new Error("אין הרשאה למחוק את ההשארות");
    state.detentions = state.detentions.filter((item) => item.id !== id);
    state.notifications = state.notifications.filter((note) => note.detentionId !== id);
    emitChange();
  },

  async setMyTeaching(role, classId) {
    const profile = requireUser();
    const staffAdmin = profile.role === "admin";
    if (profile.role !== "teacher" && profile.role !== "homeroom" && !staffAdmin) throw new Error("אין הרשאה לשנות תפקיד");
    const wantsClass = staffAdmin ? Boolean(classId) : role === "homeroom";
    if (wantsClass && !state.classes.some((room) => room.id === classId && room.active)) throw new Error("מחנך בוחר כיתה אחת קיימת");
    for (const room of state.classes) if (room.homeroomTeacherId === profile.id) room.homeroomTeacherId = null;
    if (!staffAdmin) profile.role = role;
    if (wantsClass) {
      const room = state.classes.find((item) => item.id === classId);
      if (room) room.homeroomTeacherId = profile.id;
    }
    emitSession();
    emitChange();
  },

  async listNotifications(detentionIds) {
    const profile = requireUser();
    if (!isStaff(profile)) return [];
    return state.notifications
      .filter((note) => detentionIds.includes(note.detentionId))
      .map((note) => ({ ...note, recipientPhone: undefined }));
  },

  async listDispatch(date) {
    const profile = requireUser();
    if (!canSign(profile)) throw new Error("אין הרשאה לצפות בפרטי קשר");
    const ids = new Set(
      state.detentions.filter((detention) => detention.detentionDate === date).map((detention) => detention.id),
    );
    return state.notifications.filter((note) => ids.has(note.detentionId)).map((note) => ({ ...note }));
  },

  async setNotificationSent(id, sent) {
    const profile = requireUser();
    if (!canSign(profile)) throw new Error("אין הרשאה לעדכן שליחה");
    const note = state.notifications.find((item) => item.id === id);
    if (!note) throw new Error("ההודעה לא נמצאה");
    if (note.status === "skipped") throw new Error("אין מספר לשליחה");
    note.status = sent ? "sent" : "pending";
    note.sentAt = sent ? new Date().toISOString() : null;
    emitChange();
  },

  subscribeDetentions(onChange, onStatus) {
    changeListeners.add(onChange);
    onStatus?.(true);
    return () => changeListeners.delete(onChange);
  },
};

function demoCanChange(profile: Profile, detention: Detention): boolean {
  if (profile.role === "admin" || profile.role === "secretary") return true;
  if (detention.markedBy === profile.id && profile.role) return true;
  return state.classes.some((room) => room.id === detention.classId && room.homeroomTeacherId === profile.id);
}
