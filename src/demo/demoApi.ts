import { jerusalemToday } from "../lib/dates";
import { renderDetentionMessage } from "../lib/messages";
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

const STORAGE_KEY = "hishaarut-demo-v1";

function seed(): DemoState {
  const profiles: Profile[] = [
    { id: "demo-admin", email: "admin@school.test", fullName: "מנהלת בית הספר", phone: "050-7001001", role: "admin" },
    { id: "demo-teacher", email: "teacher@school.test", fullName: "רונית מורה", phone: null, role: "teacher" },
    { id: "demo-homeroom", email: "homeroom@school.test", fullName: "מיכל מחנכת", phone: "050-7111111", role: "homeroom" },
    { id: "demo-secretary", email: "secretary@school.test", fullName: "דנה מזכירה", phone: "050-7222222", role: "secretary" },
    { id: "demo-pending", email: "pending@school.test", fullName: "משתמש ממתין", phone: null, role: null },
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
    detentions: [],
    notifications: [],
  };
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
  const candidates = whatsappCandidates([
    { phone: contact?.parentPhone, noWhatsapp: contact?.parentPhoneNoWhatsapp },
    { phone: contact?.parentPhone2, noWhatsapp: contact?.parentPhone2NoWhatsapp },
    { phone: contact?.parent2Phone, noWhatsapp: contact?.parent2PhoneNoWhatsapp },
    { phone: contact?.parent2Phone2, noWhatsapp: contact?.parent2Phone2NoWhatsapp },
  ]);
  const parentPhone = candidates[0] ?? null;
  const fallbackPhones = candidates.slice(1);
  const rawPhones = [contact?.parentPhone, contact?.parentPhone2, contact?.parent2Phone, contact?.parent2Phone2];
  const anyRaw = rawPhones.some((phone) => phone?.trim());
  const anyValid = rawPhones.some((phone) => normalizeIlPhone(phone));
  const homeroomPhone = normalizeIlPhone(homeroom?.phone);
  const base = {
    event,
    channel,
    detentionId: detention.id,
  } as const;
  const messageFor = (audience: NotificationRow["recipientType"]) =>
    renderDetentionMessage({
      event,
      audience,
      gender: student?.gender ?? null,
      studentName: `${detention.studentFirstName} ${detention.studentLastName}`,
      className: detention.className,
      reason: detention.reasonText,
      minutes: detention.durationMinutes,
      school: state.settings.schoolName,
      markerName: marker?.fullName ?? "",
    });

  const parent: NotificationRow = {
    ...base,
    id: crypto.randomUUID(),
    recipientType: "parent",
    recipientLabel: contact?.parentName || "הורה",
    recipientPhone: parentPhone,
    fallbackPhones,
    messageBody: messageFor("parent"),
    status: parentPhone ? "pending" : "skipped",
    sentAt: null,
    errorText: parentPhone ? null : !anyRaw ? "no_phone" : anyValid ? "no_whatsapp" : "invalid_phone",
  };
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
    messageBody: messageFor("homeroom"),
    status: homeroomStatus,
    sentAt: null,
    errorText: homeroomError,
  };
  state.notifications.push(parent, homeroomNote);
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

  async signInAs(role: Role | "pending") {
    const match = state.profiles.find((profile) => (role === "pending" ? profile.role === null : profile.role === role));
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
    state.settings = { ...patch };
    emitChange();
  },

  async accessStatus() {
    const profile = requireUser();
    const domain = state.settings.allowedEmailDomain?.trim().toLowerCase() ?? "";
    const listed = (state.allowedEmails ?? []).map((email) => email.toLowerCase());
    const restricted = domain.length > 0 || listed.length > 0;
    if (restricted) {
      const email = profile.email.toLowerCase();
      const domainOk = domain.length > 0 && email.endsWith(`@${domain}`);
      if (!domainOk && !listed.includes(email)) return "denied";
    }
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
    if (profile.role === "secretary") {
      if (target.role === "admin" || role === "admin") {
        throw new Error("מזכירות לא יכולה למנות או לשנות מנהל");
      }
    } else if (profile.role !== "admin") {
      throw new Error("רק מנהל יכול לשנות תפקיד");
    }
    if (profile.role === "admin" && target.role === "admin" && role !== "admin") {
      const others = state.profiles.filter((item) => item.role === "admin" && item.id !== target.id);
      if (others.length === 0) throw new Error("אי אפשר להסיר את המנהל האחרון");
    }
    target.role = role;
    if (role !== "homeroom") {
      state.classes.forEach((room) => {
        if (room.homeroomTeacherId === target.id) room.homeroomTeacherId = null;
      });
    }
    if (target.id === profile.id) emitSession();
    emitChange();
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
    const room = state.classes.find((item) => item.id === student.classId);
    const detention: Detention = {
      id: crypto.randomUUID(),
      studentId: student.id,
      reasonId: input.reasonId,
      reasonText,
      durationMinutes: input.durationMinutes,
      status: "pending",
      detentionDate: jerusalemToday(),
      releaseAt: input.releaseAt ?? new Date(Date.now() + input.durationMinutes * 60000).toISOString(),
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
    };
    state.detentions.unshift(detention);
    enqueue(detention, "marked");
    emitChange();
    return detention.id;
  },

  async completeDetention(id, early = false) {
    const profile = requireUser();
    if (!canSign(profile)) throw new Error("אין הרשאה לאשר סיום");
    const detention = state.detentions.find((item) => item.id === id);
    if (!detention || detention.status !== "pending") throw new Error("מעבר סטטוס אינו חוקי");
    if (new Date(detention.releaseAt).getTime() > Date.now() && !(early && profile.role === "admin")) {
      throw new Error("עדיין לא הגיעה שעת היציאה");
    }
    detention.status = "completed";
    detention.signedBy = profile.id;
    detention.signedAt = new Date().toISOString();
    detention.signerName = profile.fullName;
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
