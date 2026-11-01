import { asError } from "../lib/errors";
import { pagesRedirectUrl } from "../lib/supabaseKey";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import type {
  AppApi,
  ClassInput,
  ClassRoom,
  Detention,
  DetentionInput,
  DetentionQuery,
  Gender,
  NotificationRow,
  Profile,
  Reason,
  ReasonInput,
  Role,
  SchoolSettings,
  SessionState,
  Student,
  StudentInput,
} from "./types";

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: Role | null;
}

interface SettingsRow {
  school_name: string;
  allowed_email_domain: string | null;
  notification_mode: SchoolSettings["notificationMode"];
  whatsapp_phone_number_id: string | null;
  whatsapp_display_number: string | null;
}

interface ClassRow {
  id: string;
  name: string;
  grade: string | null;
  homeroom_teacher_id: string | null;
  active: boolean;
}

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  gender: Gender | null;
  class_id: string;
  active: boolean;
}

interface ReasonRow {
  id: string;
  label: string;
  active: boolean;
  sort_order: number;
}

interface DetentionRow {
  id: string;
  student_id: string;
  reason_id: string | null;
  reason_text: string;
  duration_minutes: number;
  status: Detention["status"];
  detention_date: string;
  marked_by: string;
  marked_at: string;
  signed_by: string | null;
  signed_at: string | null;
  notes: string | null;
  student:
    | {
        first_name: string;
        last_name: string;
        gender: Gender | null;
        class_id: string;
        class: { name: string } | { name: string }[] | null;
      }
    | Array<{
        first_name: string;
        last_name: string;
        gender: Gender | null;
        class_id: string;
        class: { name: string } | { name: string }[] | null;
      }>
    | null;
  marker: { full_name: string } | { full_name: string }[] | null;
  signer: { full_name: string } | { full_name: string }[] | null;
}

interface NotificationDbRow {
  id: string;
  detention_id: string;
  event: NotificationRow["event"];
  recipient_type: NotificationRow["recipientType"];
  channel: NotificationRow["channel"];
  recipient_label: string | null;
  message_body: string;
  status: NotificationRow["status"];
  sent_at: string | null;
  error_text: string | null;
  recipient_phone?: string | null;
}

const DETENTION_SELECT = `
  id, student_id, reason_id, reason_text, duration_minutes, status, detention_date,
  marked_by, marked_at, signed_by, signed_at, notes,
  student:students!detentions_student_id_fkey (
    first_name, last_name, gender, class_id,
    class:classes!students_class_id_fkey ( name )
  ),
  marker:profiles!detentions_marked_by_fkey ( full_name ),
  signer:profiles!detentions_signed_by_fkey ( full_name )
`;

function client() {
  if (!supabase) throw new Error("חסרים פרטי החיבור ל-Supabase");
  return supabase;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    role: row.role,
  };
}

function mapSettings(row: SettingsRow): SchoolSettings {
  return {
    schoolName: row.school_name,
    allowedEmailDomain: row.allowed_email_domain,
    notificationMode: row.notification_mode,
    whatsappPhoneNumberId: row.whatsapp_phone_number_id,
    whatsappDisplayNumber: row.whatsapp_display_number,
  };
}

function mapClass(row: ClassRow): ClassRoom {
  return {
    id: row.id,
    name: row.name,
    grade: row.grade,
    homeroomTeacherId: row.homeroom_teacher_id,
    active: row.active,
  };
}

function mapStudent(row: StudentRow): Student {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    gender: row.gender,
    classId: row.class_id,
    active: row.active,
  };
}

function mapReason(row: ReasonRow): Reason {
  return { id: row.id, label: row.label, active: row.active, sortOrder: row.sort_order };
}

function mapDetention(row: DetentionRow): Detention {
  const student = one(row.student);
  const classRoom = one(student?.class ?? null);
  const marker = one(row.marker);
  const signer = one(row.signer);
  return {
    id: row.id,
    studentId: row.student_id,
    reasonId: row.reason_id,
    reasonText: row.reason_text,
    durationMinutes: row.duration_minutes,
    status: row.status,
    detentionDate: row.detention_date,
    markedBy: row.marked_by,
    markedAt: row.marked_at,
    signedBy: row.signed_by,
    signedAt: row.signed_at,
    notes: row.notes,
    studentFirstName: student?.first_name ?? "",
    studentLastName: student?.last_name ?? "",
    studentGender: student?.gender ?? null,
    classId: student?.class_id ?? "",
    className: classRoom?.name ?? "",
    markerName: marker?.full_name ?? "",
    signerName: signer?.full_name ?? null,
  };
}

function mapNotification(row: NotificationDbRow, includePhone: boolean): NotificationRow {
  return {
    id: row.id,
    detentionId: row.detention_id,
    event: row.event,
    recipientType: row.recipient_type,
    channel: row.channel,
    recipientLabel: row.recipient_label,
    messageBody: row.message_body,
    status: row.status,
    sentAt: row.sent_at,
    errorText: row.error_text,
    recipientPhone: includePhone ? (row.recipient_phone ?? null) : undefined,
  };
}

async function loadProfile(userId: string, email: string): Promise<Profile> {
  const db = client();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await db
      .from("profiles")
      .select("id, email, full_name, phone, role")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw asError(error);
    if (data) return mapProfile(data as ProfileRow);
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  return { id: userId, email, fullName: "", phone: null, role: null };
}

async function sessionFromUser(user: { id: string; email?: string | null }): Promise<SessionState> {
  const email = user.email ?? "";
  return { userId: user.id, email, profile: await loadProfile(user.id, email) };
}

function requireRows<T extends { id: string }>(data: T[] | null, error: { message: string } | null): T[] {
  if (error) throw asError(error);
  if (!data || data.length === 0) throw new Error("אין הרשאה לפעולה הזו");
  return data;
}

export const supabaseApi: AppApi = {
  isConfigured: isSupabaseConfigured,
  isDemo: false,

  onSession(listener) {
    const db = supabase;
    if (!db) {
      listener(null);
      return () => {};
    }
    let active = true;
    const { data } = db.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => {
        if (!active) return;
        if (!session?.user) {
          listener(null);
          return;
        }
        void sessionFromUser(session.user)
          .then((state) => {
            if (active) listener(state);
          })
          .catch(() => {
            if (active) listener(null);
          });
      }, 0);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  },

  async refreshSession() {
    const { data, error } = await client().auth.getSession();
    if (error) throw asError(error);
    if (!data.session?.user) return null;
    return sessionFromUser(data.session.user);
  },

  async signInWithGoogle() {
    const redirectTo = pagesRedirectUrl(window.location.origin, import.meta.env.BASE_URL);
    const hd = import.meta.env.VITE_GOOGLE_HD?.trim();
    const { error } = await client().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          prompt: "select_account",
          ...(hd ? { hd } : {}),
        },
      },
    });
    if (error) throw asError(error);
  },

  async signOut() {
    const { error } = await client().auth.signOut();
    if (error) throw asError(error);
  },

  async getAccessToken() {
    const { data } = await client().auth.getSession();
    return data.session?.access_token ?? null;
  },

  async updateOwnProfile(patch) {
    const { data: userData, error: userError } = await client().auth.getUser();
    if (userError) throw asError(userError);
    const userId = userData.user?.id;
    if (!userId) throw new Error("אין משתמש מחובר");
    const { data, error } = await client()
      .from("profiles")
      .update({ full_name: patch.fullName, phone: patch.phone })
      .eq("id", userId)
      .select("id");
    requireRows(data as { id: string }[] | null, error);
  },

  async getSettings() {
    const { data, error } = await client()
      .from("school_settings")
      .select(
        "school_name, allowed_email_domain, notification_mode, whatsapp_phone_number_id, whatsapp_display_number",
      )
      .eq("id", 1)
      .single();
    if (error) throw asError(error);
    return mapSettings(data as SettingsRow);
  },

  async updateSettings(patch) {
    const { data, error } = await client()
      .from("school_settings")
      .update({
        school_name: patch.schoolName,
        allowed_email_domain: patch.allowedEmailDomain,
        notification_mode: patch.notificationMode,
        whatsapp_phone_number_id: patch.whatsappPhoneNumberId,
        whatsapp_display_number: patch.whatsappDisplayNumber,
      })
      .eq("id", 1)
      .select("id");
    requireRows(data as { id: string }[] | null, error);
  },

  async listClasses() {
    const { data, error } = await client()
      .from("classes")
      .select("id, name, grade, homeroom_teacher_id, active")
      .order("name");
    if (error) throw asError(error);
    return ((data ?? []) as ClassRow[]).map(mapClass);
  },

  async saveClass(input: ClassInput) {
    const payload = {
      name: input.name,
      grade: input.grade || null,
      homeroom_teacher_id: input.homeroomTeacherId,
      active: input.active,
    };
    if (input.id) {
      const { data, error } = await client().from("classes").update(payload).eq("id", input.id).select("id");
      requireRows(data as { id: string }[] | null, error);
      return;
    }
    const { error } = await client().from("classes").insert(payload);
    if (error) throw asError(error);
  },

  async listStudents() {
    const { data, error } = await client()
      .from("students")
      .select("id, first_name, last_name, gender, class_id, active")
      .order("last_name");
    if (error) throw asError(error);
    return ((data ?? []) as StudentRow[]).map(mapStudent);
  },

  async listContacts() {
    const { data, error } = await client().rpc("list_student_contacts");
    if (error) throw asError(error);
    return (
      (data ?? []) as {
        student_id: string;
        parent_name: string | null;
        parent_phone: string | null;
        parent2_name?: string | null;
        parent2_phone?: string | null;
        national_id?: string | null;
      }[]
    ).map((row) => ({
      studentId: row.student_id,
      parentName: row.parent_name,
      parentPhone: row.parent_phone,
      parent2Name: row.parent2_name ?? null,
      parent2Phone: row.parent2_phone ?? null,
      nationalId: row.national_id ?? null,
    }));
  },

  async saveStudent(input: StudentInput) {
    const payload = {
      first_name: input.firstName,
      last_name: input.lastName,
      gender: input.gender,
      class_id: input.classId,
      parent_name: input.parentName || null,
      parent_phone: input.parentPhone || null,
      parent2_name: input.parent2Name || null,
      parent2_phone: input.parent2Phone || null,
      national_id: input.nationalId || null,
      active: input.active,
    };
    if (input.id) {
      const { data, error } = await client().from("students").update(payload).eq("id", input.id).select("id");
      requireRows(data as { id: string }[] | null, error);
      return;
    }
    const { error } = await client().from("students").insert(payload);
    if (error) throw asError(error);
  },

  async listReasons() {
    const { data, error } = await client()
      .from("detention_reasons")
      .select("id, label, active, sort_order")
      .order("sort_order");
    if (error) throw asError(error);
    return ((data ?? []) as ReasonRow[]).map(mapReason);
  },

  async saveReason(input: ReasonInput) {
    const payload = { label: input.label, active: input.active, sort_order: input.sortOrder };
    if (input.id) {
      const { data, error } = await client()
        .from("detention_reasons")
        .update(payload)
        .eq("id", input.id)
        .select("id");
      requireRows(data as { id: string }[] | null, error);
      return;
    }
    const { error } = await client().from("detention_reasons").insert(payload);
    if (error) throw asError(error);
  },

  async listProfiles() {
    const { data, error } = await client()
      .from("profiles")
      .select("id, email, full_name, phone, role")
      .order("full_name");
    if (error) throw asError(error);
    return ((data ?? []) as ProfileRow[]).map(mapProfile);
  },

  async setUserRole(userId, role) {
    const { data, error } = await client().from("profiles").update({ role }).eq("id", userId).select("id");
    requireRows(data as { id: string }[] | null, error);
  },

  async listDetentions(query: DetentionQuery) {
    let request = client().from("detentions").select(DETENTION_SELECT);
    if (query.date) request = request.eq("detention_date", query.date);
    if (query.from) request = request.gte("detention_date", query.from);
    if (query.to) request = request.lte("detention_date", query.to);
    if (query.markedBy) request = request.eq("marked_by", query.markedBy);
    const { data, error } = await request.order("marked_at", { ascending: false }).limit(5000);
    if (error) throw asError(error);
    return ((data ?? []) as DetentionRow[]).map(mapDetention);
  },

  async createDetention(input: DetentionInput) {
    const { data, error } = await client()
      .from("detentions")
      .insert({
        student_id: input.studentId,
        reason_id: input.reasonId,
        reason_text: input.reasonText,
        duration_minutes: input.durationMinutes,
        notes: input.notes,
      })
      .select("id")
      .single();
    if (error) throw asError(error);
    return (data as { id: string }).id;
  },

  async completeDetention(id) {
    const { data, error } = await client().from("detentions").update({ status: "completed" }).eq("id", id).select("id");
    requireRows(data as { id: string }[] | null, error);
  },

  async cancelDetention(id) {
    const { data, error } = await client().from("detentions").update({ status: "cancelled" }).eq("id", id).select("id");
    requireRows(data as { id: string }[] | null, error);
  },

  async listNotifications(detentionIds) {
    if (detentionIds.length === 0) return [];
    const { data, error } = await client()
      .from("notification_log")
      .select(
        "id, detention_id, event, recipient_type, channel, recipient_label, message_body, status, sent_at, error_text",
      )
      .in("detention_id", detentionIds);
    if (error) throw asError(error);
    return ((data ?? []) as NotificationDbRow[]).map((row) => mapNotification(row, false));
  },

  async listDispatch(date) {
    const { data, error } = await client().rpc("list_notification_dispatch", { p_date: date });
    if (error) throw asError(error);
    return ((data ?? []) as NotificationDbRow[]).map((row) => mapNotification(row, true));
  },

  async setNotificationSent(id, sent) {
    const { data, error } = await client()
      .from("notification_log")
      .update({ status: sent ? "sent" : "pending" })
      .eq("id", id)
      .select("id");
    requireRows(data as { id: string }[] | null, error);
  },

  subscribeDetentions(onChange, onStatus) {
    const db = supabase;
    if (!db) return () => {};
    const channel = db
      .channel(`detentions-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "detentions" }, () => onChange())
      .on("postgres_changes", { event: "*", schema: "public", table: "notification_log" }, () => onChange())
      .subscribe((status) => onStatus?.(status === "SUBSCRIBED"));
    return () => {
      void db.removeChannel(channel);
    };
  },
};
