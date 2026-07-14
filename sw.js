// Minimal app-shell cache so the page still loads with a spotty gym connection.
// Deliberately never caches Supabase REST calls — stale macros/workout data would
// be actively wrong, not just outdated, so those always hit the network.
//
// Network-first for shell files: always try to fetch the latest code when online,
// and only fall back to the cached copy if the network request fails. This means
// app updates show up on next load without needing a manual cache-version bump.
const CACHE = "iron-log-v3";
const SHELL = ["./", "index.html", "storage.js", "app.js", "manifest.json", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.hostname.endsWith("supabase.co")) return; // never cache live data
  if (e.request.method !== "GET") return;

  // cache: "no-store" bypasses the browser's own HTTP disk cache, not just our
  // Cache Storage — otherwise GitHub Pages' Cache-Control headers can hand back
  // a stale file even though this handler is "network-first".
  e.respondWith(
    fetch(e.request, { cache: "no-store" })
      .then((res) => {
        caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
