# השארות

אפליקציית ווב בעברית, מימין לשמאל, לניהול השארות אחרי שעות הלימודים בבית ספר אחד.
מורים מסמנים תלמיד, המזכירות רואה את הרשימה בזמן אמת ומאשרת יציאה, וההודעות להורים ולמחנך נפתחות בלחיצה אחת בוואטסאפ של בית הספר.

ההתקנה, החיבור לגוגל, והפיכת המשתמש הראשון למנהל מוסברים ב-[SETUP.md](SETUP.md).

## Stack

- Vite, React, TypeScript, installable PWA
- Supabase Postgres, Google sign-in, Row Level Security, Realtime
- Phase 1 notifications: `wa.me` links sent by the secretary from the school WhatsApp Business account
- Phase 2 stub: `supabase/functions/send-whatsapp` returns HTTP 501 and is not wired to the Cloud API

```bash
npm install
npm test
npm run dev
```

Demo without a Supabase project (development only):

```bash
VITE_DEMO=1 npm run dev
```

The anon key is the only Supabase credential that belongs in the client. Parent phone numbers are not readable by subject teachers; see the policies in `supabase/migrations`.
