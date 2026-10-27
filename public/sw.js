const PRECACHE = /*PRECACHE*/ [];
const CACHE =
  "wayfarer-v2-" + PRECACHE.filter((p) => p.endsWith(".js")).join("|");
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        c.addAll(PRECACHE.length ? PRECACHE : ["/", "/manifest.webmanifest"]),
      ),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (
    e.request.method !== "GET" ||
    u.origin !== self.location.origin ||
    u.pathname.includes("/api/")
  )
    return;
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          if (r.ok) caches.open(CACHE).then((c) => c.put("/", r.clone()));
          return r;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }
  if (u.pathname.startsWith("/assets/"))
    e.respondWith(
      caches.match(e.request).then(
        (r) =>
          r ||
          fetch(e.request).then((res) => {
            if (res.ok)
              caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
            return res;
          }),
      ),
    );
});
