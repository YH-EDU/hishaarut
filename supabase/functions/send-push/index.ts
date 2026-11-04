// Phone push notifications to a homeroom teacher.
//
// Called by the database trigger notify_homeroom_push() through pg_net with
//   { "detention_id": uuid, "event": "marked" | "released" | "no_show", "user_id": uuid }
// and header x-hook-secret = push_settings.hook_secret.
//
// GET ?init=1 makes sure VAPID keys exist (creates them once, stores them in
// push_settings) and returns the public key. The app calls this the first
// time someone turns notifications on, so no keys have to be set by hand.
//
// Deploy with "Verify JWT" OFF. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// provided automatically by Supabase.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8" },
  });
}

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

type Settings = {
  hook_secret: string;
  vapid_public_key: string | null;
  vapid_private_key: string | null;
  vapid_subject: string;
};

async function settings(): Promise<Settings> {
  const { data, error } = await db
    .from("push_settings")
    .select("hook_secret, vapid_public_key, vapid_private_key, vapid_subject")
    .eq("id", true)
    .single();
  if (error || !data) throw new Error(error?.message ?? "push_settings missing");
  if (!data.vapid_public_key || !data.vapid_private_key) {
    const keys = webpush.generateVAPIDKeys();
    // Only fill if still empty, so two first calls cannot overwrite each other.
    await db
      .from("push_settings")
      .update({ vapid_public_key: keys.publicKey, vapid_private_key: keys.privateKey })
      .eq("id", true)
      .is("vapid_public_key", null);
    return settings();
  }
  return data as Settings;
}

function hhmm(iso: string): string {
  return new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(iso),
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const cfg = await settings();
    if (req.method === "GET") return json({ publicKey: cfg.vapid_public_key });
    if (req.method !== "POST") return json({ error: "method" }, 405);
    if (req.headers.get("x-hook-secret") !== cfg.hook_secret) return json({ error: "forbidden" }, 403);

    const { detention_id, event, user_id } = await req.json();
    if (!detention_id || !user_id || !["marked", "released", "no_show"].includes(event)) {
      return json({ error: "bad request" }, 400);
    }

    const { data: d } = await db
      .from("detentions")
      .select("id, reason_text, release_at, students(first_name, last_name, classes(name)), marker:profiles!detentions_marked_by_fkey(full_name)")
      .eq("id", detention_id)
      .single();
    if (!d) return json({ ok: true, skipped: "no detention" });
    // deno-lint-ignore no-explicit-any
    const row = d as any;
    const student = `${row.students?.first_name ?? ""} ${row.students?.last_name ?? ""}`.trim();
    const klass = row.students?.classes?.name ? ` (${row.students.classes.name})` : "";
    const title =
      event === "marked" ? "תלמיד/ה שלך סומנ/ה להשארות" : event === "released" ? "תלמיד/ה שלך שוחרר/ה" : "תלמיד/ה שלך לא הגיע/ה להשארות";
    const body =
      event === "marked"
        ? `${student}${klass} · ${row.reason_text} · יציאה ${hhmm(row.release_at)} · סימן/ה ${row.marker?.full_name ?? ""}`
        : event === "released"
          ? `${student}${klass} שוחרר/ה מההשארות`
          : `${student}${klass} לא הגיע/ה להשארות היום`;

    const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", user_id);
    webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public_key!, cfg.vapid_private_key!);
    const payload = JSON.stringify({ title, body, url: "mine", tag: `${detention_id}-${event}` });
    let sent = 0;
    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
          TTL: 60 * 60 * 6,
          urgency: "high",
        });
        sent += 1;
      } catch (err) {
        // deno-lint-ignore no-explicit-any
        const code = (err as any)?.statusCode;
        if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", sub.id);
        else console.error("push failed", code, String(err));
      }
    }
    return json({ ok: true, sent });
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});
