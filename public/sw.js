/* rectile service worker — hand-rolled, app-shell caching only.
 *
 * Strategy:
 *  - /api/*            : never touched (bearer-token API + MCP)
 *  - navigations       : network-first, fall back to cache, then /offline
 *  - /_next/static, fonts, /icons : cache-first (content-hashed / immutable)
 *  - everything else GET: network, populate cache as fallback copy
 *  - PRECACHE message  : the dashboard posts the full page list (all /p/<slug>
 *    pages) so every page opens offline even if never visited on this device
 */
const VERSION = "rectile-v2";
const SHELL = ["/", "/stale", "/offline"];

/* Precache pages AND every /_next/static asset they reference — without the
 * route chunks a cached page renders but never hydrates (dead buttons, native
 * form submits). Pass 1 caches page HTML and collects chunk paths; pass 2
 * fetches uncached chunks; pass 3 mines CSS for fonts/media. */
const ASSET_RE = /\/_next\/static\/[^"'<>\s\\)]+/g;

async function precache(urls) {
  const cache = await caches.open(VERSION);
  const assets = new Set();

  await Promise.allSettled(
    urls.map(async (url) => {
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) return;
      const text = await res.clone().text();
      await cache.put(url, res);
      for (const m of text.matchAll(ASSET_RE)) assets.add(m[0]);
    }),
  );

  const cssFiles = [];
  await Promise.allSettled(
    [...assets].map(async (path) => {
      if (await cache.match(path)) return;
      const res = await fetch(path);
      if (!res.ok) return;
      if (path.endsWith(".css")) cssFiles.push([path, await res.clone().text()]);
      await cache.put(path, res);
    }),
  );

  const media = new Set();
  for (const [, text] of cssFiles)
    for (const m of text.matchAll(ASSET_RE)) media.add(m[0]);
  await Promise.allSettled(
    [...media].map(async (path) => {
      if (await cache.match(path)) return;
      const res = await fetch(path);
      if (res.ok) await cache.put(path, res);
    }),
  );
}

self.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || msg.type !== "PRECACHE" || !Array.isArray(msg.urls)) return;
  event.waitUntil(precache(msg.urls));
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

/* web push — reminder deadline alerts (lib/push.ts broadcasts the payload) */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data && event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "rectile", {
      body: data.body || "",
      tag: data.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/reminders" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/reminders";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin) {
          w.navigate(url);
          return w.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // navigations: network-first so data is always fresh. Cache under the bare
  // pathname and match with ignoreVary — Next.js sends `Vary: rsc, ...` which
  // would otherwise make cached pages unmatchable for some navigations.
  // A dead origin behind Cloudflare is NOT a fetch error: CF answers with its
  // own 5xx error page, so status must gate both caching and the fallback.
  if (req.mode === "navigate") {
    const fromCache = () =>
      caches
        .match(url.pathname, { ignoreVary: true })
        .then((hit) => hit || caches.match(req, { ignoreVary: true, ignoreSearch: true }))
        .then((hit) => hit || caches.match("/offline", { ignoreVary: true }));

    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.status >= 500) return fromCache().then((hit) => hit || res);
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(() => fromCache().then((hit) => hit || Response.error())),
    );
    return;
  }

  // static assets: cache-first
  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    /\.(woff2?|png|svg|ico)$/.test(url.pathname);
  if (isStatic) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // default: network with cached fallback (5xx = origin down, see above)
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.status >= 500)
          return caches.match(req).then((hit) => hit || res);
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || Response.error())),
  );
});
