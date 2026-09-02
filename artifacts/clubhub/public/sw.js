self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  
  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    return;
  }

  const title = payload.title || "Nahreo";
  const iconUrl = new URL("icons/icon-192.png", self.registration.scope).href;
  const badgeUrl = new URL("icons/notification-badge.png", self.registration.scope).href;
  const options = {
    body: payload.body || "New notification",
    icon: iconUrl,
    badge: badgeUrl,
    data: {
      path: payload.deepLink || "/",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const relativePath = String(event.notification.data.path || "/").replace(/^\/+/, "");
  const urlToOpen = new URL(relativePath, self.registration.scope).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      let matchingClient = null;
      for (let i = 0; i < windowClients.length; i++) {
        const windowClient = windowClients[i];
        if (windowClient.url === urlToOpen) {
          matchingClient = windowClient;
          break;
        }
      }

      if (matchingClient) {
        return matchingClient.focus();
      } else {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
