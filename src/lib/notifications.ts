import { whatsappUrl } from "./phone";
import type { NotificationEvent, NotificationMode, RecipientType } from "../api/types";

export interface CloudPayload {
  notificationId: string;
  to: string;
  body: string;
  event: NotificationEvent;
  recipientType: RecipientType;
}

export type DispatchResult =
  | { kind: "manual"; url: string }
  | { kind: "sent" }
  | { kind: "unavailable"; message: string; fallbackUrl: string | null };

export async function sendViaCloudApi(
  payload: CloudPayload,
  accessToken: string,
): Promise<{ ok: boolean; message: string }> {
  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!base || !accessToken) {
    return { ok: false, message: "השליחה האוטומטית לא זמינה" };
  }
  try {
    const response = await fetch(`${base}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anon,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
    if (response.ok && body.ok) return { ok: true, message: "" };
    return {
      ok: false,
      message: body.message || "השליחה האוטומטית לא זמינה. אפשר לשלוח בקישור וואטסאפ.",
    };
  } catch {
    return { ok: false, message: "השליחה האוטומטית לא זמינה. אפשר לשלוח בקישור וואטסאפ." };
  }
}

/**
 * Phase 1 opens a wa.me link. Phase 2 calls the Cloud API stub and, until that
 * exists, returns the same link so the secretary can still send.
 */
export async function dispatchNotification(input: {
  mode: NotificationMode;
  phone: string | null;
  message: string;
  notificationId: string;
  event: NotificationEvent;
  recipientType: RecipientType;
  accessToken?: string | null;
  sendCloud?: (payload: CloudPayload) => Promise<{ ok: boolean; message: string }>;
}): Promise<DispatchResult> {
  const url = whatsappUrl(input.phone, input.message);
  if (input.mode === "manual_link") {
    if (!url) return { kind: "unavailable", message: "אין מספר טלפון", fallbackUrl: null };
    return { kind: "manual", url };
  }

  const send = input.sendCloud ?? ((payload) => sendViaCloudApi(payload, input.accessToken ?? ""));
  if (!input.phone) {
    return { kind: "unavailable", message: "אין מספר טלפון", fallbackUrl: null };
  }
  const result = await send({
    notificationId: input.notificationId,
    to: input.phone,
    body: input.message,
    event: input.event,
    recipientType: input.recipientType,
  });
  if (result.ok) return { kind: "sent" };
  return { kind: "unavailable", message: result.message, fallbackUrl: url };
}
