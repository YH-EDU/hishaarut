export type Role = "teacher" | "homeroom" | "secretary" | "admin";
export type DetentionStatus = "pending" | "completed" | "cancelled";
export type Gender = "male" | "female";
export type NotificationMode = "manual_link" | "cloud_api";
export type NotificationEvent = "marked" | "completed";
export type RecipientType = "parent" | "homeroom";
export type NotificationStatus = "pending" | "sent" | "failed" | "skipped";

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  /** הרב / המורה / free text. Null for users who signed up before titles existed. */
  title?: string | null;
  phone: string | null;
  role: Role | null;
  requestedRole: Role | null;
  requestedClassIds: string[];
  isOwner: boolean;
}

export interface SessionState {
  userId: string;
  email: string;
  profile: Profile;
}

export interface DayHours {
  start: string | null;
  end: string | null;
}

export interface WeekSchedule {
  sun: DayHours;
  mon: DayHours;
  tue: DayHours;
  wed: DayHours;
  thu: DayHours;
  fri: DayHours;
  sat: DayHours;
}

export interface SpecialDay {
  date: string;
  start: string | null;
  end: string;
}

/** Hours that apply on a date: special day > closure > weekly. null = no school. */
export function hoursForDate(
  settings: Pick<SchoolSettings, "schedule" | "closures" | "specialDays">,
  date: string,
  dow: number,
): DayHours | null {
  const special = settings.specialDays.find((day) => day.date === date);
  const weekly = settings.schedule[DAY_KEYS[dow]];
  if (special) return { start: special.start ?? weekly.start ?? "07:00", end: special.end };
  if (settings.closures.includes(date)) return null;
  return weekly.start && weekly.end ? weekly : null;
}

export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export const DEFAULT_WEEK: WeekSchedule = {
  sun: { start: "07:00", end: "16:00" },
  mon: { start: "07:00", end: "16:00" },
  tue: { start: "07:00", end: "14:00" },
  wed: { start: "07:00", end: "16:00" },
  thu: { start: "07:00", end: "16:00" },
  fri: { start: "07:00", end: "12:00" },
  sat: { start: null, end: null },
};

export const DEFAULT_PARENT_TEMPLATE = `שלום,
הריני לעדכן ש{reason_clause} עד השעה {release_time}.
תודה{teacher_sign}`;

export interface SchoolSettings {
  schoolName: string;
  allowedEmailDomain: string | null;
  autoApproveDomain: string | null;
  notificationMode: NotificationMode;
  whatsappPhoneNumberId: string | null;
  whatsappDisplayNumber: string | null;
  schedule: WeekSchedule;
  /** Dates with no school at all. */
  closures: string[];
  /** One-off dates with their own hours (replace the weekly hours). */
  specialDays: SpecialDay[];
  parentMessageTemplate: string;
}

export type AccessStatus = "ok" | "pending" | "denied";

export interface ClassRoom {
  id: string;
  name: string;
  grade: string | null;
  homeroomTeacherId: string | null;
  active: boolean;
}

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  gender: Gender | null;
  classId: string;
  active: boolean;
}

export type WhatsappSlot = "parent1" | "parent1b" | "parent2" | "parent2b";

export interface StudentContact {
  studentId: string;
  parentName: string | null;
  parentPhone: string | null;
  parentPhone2: string | null;
  parentPhoneNoWhatsapp: boolean;
  parentPhone2NoWhatsapp: boolean;
  parent2Name: string | null;
  parent2Phone: string | null;
  parent2Phone2: string | null;
  parent2PhoneNoWhatsapp: boolean;
  parent2Phone2NoWhatsapp: boolean;
}

export interface Reason {
  id: string;
  label: string;
  active: boolean;
  sortOrder: number;
}

export interface Detention {
  id: string;
  studentId: string;
  reasonId: string | null;
  reasonText: string;
  durationMinutes: number;
  status: DetentionStatus;
  detentionDate: string;
  releaseAt: string;
  markedBy: string;
  markedAt: string;
  signedBy: string | null;
  signedAt: string | null;
  notes: string | null;
  studentFirstName: string;
  studentLastName: string;
  studentGender: Gender | null;
  classId: string;
  className: string;
  markerName: string;
  signerName: string | null;
  releaserName: string | null;
}

export interface NotificationRow {
  id: string;
  detentionId: string;
  event: NotificationEvent;
  recipientType: RecipientType;
  channel: "whatsapp_link" | "whatsapp_cloud";
  recipientLabel: string | null;
  messageBody: string;
  status: NotificationStatus;
  sentAt: string | null;
  errorText: string | null;
  recipientPhone?: string | null;
  fallbackPhones?: string[];
}

export interface DetentionInput {
  studentId: string;
  reasonId: string | null;
  reasonText: string;
  durationMinutes: number;
  notes: string | null;
  releaseAt?: string | null;
}

export interface StudentInput {
  id?: string;
  firstName: string;
  lastName: string;
  gender: Gender | null;
  classId: string;
  parentName: string;
  parentPhone: string;
  parentPhone2?: string;
  parent2Name?: string;
  parent2Phone?: string;
  parent2Phone2?: string;
  active: boolean;
}

export interface ClassInput {
  id?: string;
  name: string;
  grade: string;
  homeroomTeacherId: string | null;
  active: boolean;
}

export interface ReasonInput {
  id?: string;
  label: string;
  active: boolean;
  sortOrder: number;
}

export interface DetentionQuery {
  date?: string;
  from?: string;
  to?: string;
  markedBy?: string;
}

export interface AppApi {
  isConfigured: boolean;
  isDemo: boolean;
  onSession(listener: (session: SessionState | null) => void): () => void;
  refreshSession(): Promise<SessionState | null>;
  signInWithGoogle(): Promise<void>;
  signInAs?(role: Role | "pending" | "new"): Promise<void>;
  signOut(): Promise<void>;
  getAccessToken(): Promise<string | null>;
  updateOwnProfile(patch: { fullName: string; phone: string; title?: string | null }): Promise<void>;
  updateStaffProfile(userId: string, patch: { fullName: string; title: string | null }): Promise<void>;
  getSettings(): Promise<SchoolSettings>;
  updateSettings(patch: SchoolSettings): Promise<void>;
  updateSchedule(schedule: WeekSchedule): Promise<void>;
  updateParentTemplate(template: string): Promise<void>;
  addClosure(date: string): Promise<void>;
  removeClosure(date: string): Promise<void>;
  /** One-off hours for a date. end null = no school that day. */
  setSpecialDay(date: string, start: string | null, end: string | null): Promise<void>;
  accessStatus(): Promise<AccessStatus>;
  listAllowedEmails(): Promise<string[]>;
  setAllowedEmails(emails: string[]): Promise<void>;
  listClasses(): Promise<ClassRoom[]>;
  saveClass(input: ClassInput): Promise<void>;
  setClassActive(id: string, active: boolean, includeStudents: boolean): Promise<void>;
  deleteClass(id: string, confirmName?: string): Promise<void>;
  listStudents(): Promise<Student[]>;
  listContacts(): Promise<StudentContact[]>;
  getDetentionParentPhones(detentionId: string): Promise<{ motherPhone: string | null; fatherPhone: string | null }>;
  saveStudent(input: StudentInput): Promise<void>;
  setWhatsappOptOut(studentId: string, slot: WhatsappSlot, noWhatsapp: boolean): Promise<void>;
  countDetentions(studentIds: string[]): Promise<number>;
  setStudentsActive(ids: string[], active: boolean): Promise<void>;
  deleteStudent(id: string, confirmName?: string): Promise<void>;
  listReasons(): Promise<Reason[]>;
  saveReason(input: ReasonInput): Promise<void>;
  listProfiles(): Promise<Profile[]>;
  setUserRole(userId: string, role: Role | null): Promise<void>;
  listOpenClasses(): Promise<Array<{ id: string; name: string; hasHomeroom?: boolean }>>;
  requestStaffRole(role: Role, classIds: string[]): Promise<void>;
  approveStaffRequest(userId: string, role: Role, classIds: string[]): Promise<void>;
  rejectStaffRequest(userId: string): Promise<void>;
  transferOwnership(userId: string): Promise<void>;
  listReport(from: string, to: string): Promise<Detention[]>;
  listDetentions(query: DetentionQuery): Promise<Detention[]>;
  createDetention(input: DetentionInput): Promise<string>;
  completeDetention(id: string, early?: boolean): Promise<void>;
  cancelDetention(id: string): Promise<void>;
  /** Marker, homeroom of the student's class, admin/secretary. Pending only. */
  editDetention(id: string, patch: { reasonId: string | null; reasonText: string; releaseAt: string }): Promise<void>;
  deleteDetention(id: string): Promise<void>;
  /** Self-service: teacher <-> homeroom (with one class). Admin/owner may only set own class. */
  setMyTeaching(role: "teacher" | "homeroom", classId: string | null): Promise<void>;
  listNotifications(detentionIds: string[]): Promise<NotificationRow[]>;
  listDispatch(date: string): Promise<NotificationRow[]>;
  setNotificationSent(id: string, sent: boolean): Promise<void>;
  subscribeDetentions(onChange: () => void, onStatus?: (live: boolean) => void): () => void;
}

export const ROLE_LABEL: Record<Role, string> = {
  teacher: "מורה מקצועי",
  homeroom: "מחנך/ת",
  secretary: "מזכירות",
  admin: "מנהל/ת",
};

export const STATUS_LABEL: Record<DetentionStatus, string> = {
  pending: "ממתין",
  completed: "סיים, בדרכו הביתה",
  cancelled: "בוטל",
};

export const GENDER_LABEL: Record<Gender, string> = {
  male: "זכר",
  female: "נקבה",
};

/** Role shown in the UI. The system owner reads as "בעלים", never just "מנהל". */
export function roleLabel(profile: Pick<Profile, "role" | "isOwner"> | null | undefined): string {
  if (!profile?.role) return "ממתין לאישור";
  return profile.isOwner ? "בעלים" : ROLE_LABEL[profile.role];
}
