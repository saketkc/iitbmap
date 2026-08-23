const CACHE_NAME = "iitbmap-demo-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  // Cache key drops the query string: every shareable-route URL (?from=&to=&...) serves the
  // same app-shell document, so keying on it verbatim would grow the cache without bound.
  const cacheKey = new URL(request.url);
  cacheKey.search = "";

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey.href, copy));
        }
        return response;
      })
      .catch(() => caches.match(cacheKey.href).then((cached) => cached ?? Response.error())),
  );
});
