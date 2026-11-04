// Loaded into the generated service worker (workbox importScripts).
// Shows phone notifications sent by the send-push Edge Function.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "נשארים", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "נשארים", {
      body: data.body || "",
      tag: data.tag,
      dir: "rtl",
      lang: "he",
      icon: "icons/v3/icon-192.png",
      badge: "icons/v3/icon-192.png",
      data: { url: new URL(data.url || "", self.registration.scope).href },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(self.registration.scope) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
