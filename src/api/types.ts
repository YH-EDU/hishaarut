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
  phone: string | null;
  role: Role | null;
}

export interface SessionState {
  userId: string;
  email: string;
  profile: Profile;
}

export interface SchoolSettings {
  schoolName: string;
  allowedEmailDomain: string | null;
  notificationMode: NotificationMode;
  whatsappPhoneNumberId: string | null;
  whatsappDisplayNumber: string | null;
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
  signInAs?(role: Role | "pending"): Promise<void>;
  signOut(): Promise<void>;
  getAccessToken(): Promise<string | null>;
  updateOwnProfile(patch: { fullName: string; phone: string }): Promise<void>;
  getSettings(): Promise<SchoolSettings>;
  updateSettings(patch: SchoolSettings): Promise<void>;
  accessStatus(): Promise<AccessStatus>;
  listAllowedEmails(): Promise<string[]>;
  setAllowedEmails(emails: string[]): Promise<void>;
  listClasses(): Promise<ClassRoom[]>;
  saveClass(input: ClassInput): Promise<void>;
  setClassActive(id: string, active: boolean, includeStudents: boolean): Promise<void>;
  deleteClass(id: string, confirmName?: string): Promise<void>;
  listStudents(): Promise<Student[]>;
  listContacts(): Promise<StudentContact[]>;
  saveStudent(input: StudentInput): Promise<void>;
  setWhatsappOptOut(studentId: string, slot: WhatsappSlot, noWhatsapp: boolean): Promise<void>;
  countDetentions(studentIds: string[]): Promise<number>;
  setStudentsActive(ids: string[], active: boolean): Promise<void>;
  deleteStudent(id: string, confirmName?: string): Promise<void>;
  listReasons(): Promise<Reason[]>;
  saveReason(input: ReasonInput): Promise<void>;
  listProfiles(): Promise<Profile[]>;
  setUserRole(userId: string, role: Role | null): Promise<void>;
  listDetentions(query: DetentionQuery): Promise<Detention[]>;
  createDetention(input: DetentionInput): Promise<string>;
  completeDetention(id: string, early?: boolean): Promise<void>;
  cancelDetention(id: string): Promise<void>;
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
