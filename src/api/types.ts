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

export interface StudentContact {
  studentId: string;
  parentName: string | null;
  parentPhone: string | null;
  parent2Name: string | null;
  parent2Phone: string | null;
  nationalId: string | null;
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
}

export interface DetentionInput {
  studentId: string;
  reasonId: string | null;
  reasonText: string;
  durationMinutes: number;
  notes: string | null;
}

export interface StudentInput {
  id?: string;
  firstName: string;
  lastName: string;
  gender: Gender | null;
  classId: string;
  parentName: string;
  parentPhone: string;
  parent2Name?: string;
  parent2Phone?: string;
  nationalId?: string;
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
  listClasses(): Promise<ClassRoom[]>;
  saveClass(input: ClassInput): Promise<void>;
  listStudents(): Promise<Student[]>;
  listContacts(): Promise<StudentContact[]>;
  saveStudent(input: StudentInput): Promise<void>;
  listReasons(): Promise<Reason[]>;
  saveReason(input: ReasonInput): Promise<void>;
  listProfiles(): Promise<Profile[]>;
  setUserRole(userId: string, role: Role | null): Promise<void>;
  listDetentions(query: DetentionQuery): Promise<Detention[]>;
  createDetention(input: DetentionInput): Promise<string>;
  completeDetention(id: string): Promise<void>;
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
