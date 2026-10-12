// Elayo Family service worker: makes the app installable and shows an offline page.
// Pages and data are never cached — they hold members' private records and must always be fresh.
const CACHE = "elayo-static-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/favicon-32.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("elayo-static-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Build output is content-hashed, so a cached copy never goes stale.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(caches.match(request).then((cached) => cached || fetchAndCache(request)));
    return;
  }

  // Icons and pictures: answer from the cache at once, refresh it in the background.
  if (url.pathname.startsWith("/icons/") || url.pathname.startsWith("/images/")) {
    const fresh = fetchAndCache(request);
    event.waitUntil(fresh.catch(() => undefined));
    event.respondWith(caches.match(request).then((cached) => cached || fresh));
  }
});

function fetchAndCache(request) {
  return fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  });
}
