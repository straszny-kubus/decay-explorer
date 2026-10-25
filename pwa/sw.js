// Service worker: keeps the app and its nuclide table available offline.
// __VERSION__ is replaced by tools/build-site.js with a hash of the app files, so each deploy
// installs a fresh cache and drops the old one.
const VERSION = "__VERSION__";
const CACHE = `decay-${VERSION}`;
const FONTS = "decay-fonts";
const SHELL = ["./", "index.html", "nuclides.json", "manifest.webmanifest",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("decay-") && k !== CACHE && k !== FONTS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    // App files are versioned with the cache, so serve them from it; any page load falls back to the app.
    e.respondWith(caches.open(CACHE).then(async c =>
      (await c.match(req, { ignoreSearch: true })) ||
      fetch(req).catch(async () => (req.mode === "navigate" ? c.match("index.html") : Response.error()))));
  } else if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    // Fonts: use the cached copy, refresh it in the background.
    e.respondWith(caches.open(FONTS).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(res => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});
