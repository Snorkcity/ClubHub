// Only immutable, content-hashed build assets. No HTML, API responses, Clerk
// requests, uploaded photos, or personal data is stored in this cache.
const STATIC_CACHE_PREFIX = "nahreo-static-";
const STATIC_CACHE = `${STATIC_CACHE_PREFIX}v1`;
const MAX_STATIC_ASSETS = 80;

function isStaticAsset(request) {
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  return request.method === "GET"
    && url.origin === scope.origin
    && !url.search
    && url.pathname.startsWith(`${scope.pathname}assets/`)
    && /\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?)$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  if (!isStaticAsset(event.request)) return;
  event.respondWith((async () => {
    let cache;
    try {
      cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(event.request);
      if (cached) return cached;
    } catch (error) {
      console.warn("Static cache unavailable", error);
    }
    const response = await fetch(event.request);
    if (cache && response.ok && !response.redirected
      && /(?:javascript|text\/css|font\/)/i.test(response.headers.get("content-type") || "")) {
      const copy = response.clone();
      event.waitUntil((async () => {
        try {
          await cache.put(event.request, copy);
          const keys = await cache.keys();
          for (const key of keys.slice(0, Math.max(0, keys.length - MAX_STATIC_ASSETS))) {
            await cache.delete(key);
          }
        } catch (error) {
          console.warn("Could not retain static asset", error);
        }
      })());
    }
    return response;
  })());
});

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(STATIC_CACHE_PREFIX) && key !== STATIC_CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
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
  const iconUrl = new URL("icons/icon-192.png?v=open-compass", self.registration.scope).href;
  const badgeUrl = new URL("icons/notification-badge.png?v=open-compass", self.registration.scope).href;
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
