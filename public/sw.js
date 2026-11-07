// Personal Radar service worker: shows push notifications, opens the right page when one is tapped,
// and keeps the hashed build files (/_next/static) on the phone so the app opens instantly.
// Pages and /api are never cached: the data is always live from the Mac.
const STATIC = "radar-static-v1";
// registered as /sw.js?dev=1 by `npm run dev`: dev build files keep the same names, so never cache them
const DEV = new URL(self.location.href).searchParams.has("dev");

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (DEV || k !== STATIC) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (DEV || e.request.method !== "GET" || url.origin !== location.origin) return;
  // build files have content hashes in their names, so a cached copy is always correct
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith((async () => {
      const cache = await caches.open(STATIC);
      const hit = await cache.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    })());
  }
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "Radar", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Radar", {
    body: d.body || "",
    tag: d.tag,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: d.url || "/" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const path = e.notification.data?.url || "/";
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const w = wins[0];
    if (w) {
      // the open app switches pages itself (client-side, no reload)
      w.postMessage({ type: "radar:open", url: path });
      if ("focus" in w) await w.focus().catch(() => {});
      return;
    }
    await self.clients.openWindow(new URL(path, location.origin).href);
  })());
});
