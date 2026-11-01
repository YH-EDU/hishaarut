// Phase 2 stub. Do not call the WhatsApp Cloud API from here yet.
//
// When the school is ready, set these Edge Function secrets (never in the
// client and never in school_settings):
//   WHATSAPP_TOKEN
//   WHATSAPP_PHONE_NUMBER_ID   (or read the non-secret id from school_settings)
//
// Expected request body, which the web app already sends through
// dispatchNotification() when notification_mode = 'cloud_api':
//   {
//     "notificationId": "uuid",
//     "to": "9725XXXXXXXX",
//     "body": "hebrew message",
//     "event": "marked" | "completed",
//     "recipientType": "parent" | "homeroom"
//   }
//
// A future implementation must:
//   1. Verify the JWT belongs to a secretary or admin (do not trust the client).
//   2. POST to https://graph.facebook.com/v21.0/{phone-number-id}/messages
//   3. Store provider_message_id and status on notification_log with the service role.
// Until then this function returns 501 and the screen keeps the wa.me link.

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let record: Record<string, unknown> = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object") {
      record = parsed as Record<string, unknown>;
    }
  } catch {
    record = {};
  }

  // Confirm the shape without echoing the phone number or the message.
  return json(
    {
      ok: false,
      error: "not_implemented",
      phase: 2,
      message:
        "שליחה אוטומטית דרך WhatsApp Cloud API עדיין לא מופעלת. יש לשלוח בקישור wa.me מהמספר העסקי של בית הספר.",
      accepted: {
        notificationId: typeof record.notificationId === "string" ? record.notificationId : null,
        hasRecipient: typeof record.to === "string" && record.to.length > 0,
        event: record.event === "marked" || record.event === "completed" ? record.event : null,
        recipientType:
          record.recipientType === "parent" || record.recipientType === "homeroom"
            ? record.recipientType
            : null,
      },
    },
    501,
  );
});
