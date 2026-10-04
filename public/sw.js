/* E-J Success service worker.
 *
 * Caching strategy
 *  • /_next/static, /icons, fonts .......... cache-first (file names are content-hashed)
 *  • images ................................ stale-while-revalidate
 *  • page navigations ...................... network-first (3.5 s timeout), then cache, then /offline
 *  • RSC payloads (client-side navigation) . network only; on failure Next.js falls back to a full
 *                                            navigation, which is then served from the page cache
 *  • /api/* and POST (server actions) ...... never cached
 *  • WARM message .......................... pre-caches every page the user can open, plus the JS/CSS
 *                                            those pages need, so the whole app works offline
 *
 * Resync
 *  • Quiz runs played offline are queued in IndexedDB (see src/lib/offline/outbox.ts).
 *  • Background Sync ("ejs-outbox") replays them here when the connection returns (Chromium);
 *    elsewhere the page replays them on the "online" event. The server deduplicates by clientId.
 */
const VERSION = "v2";
const STATIC = `ejs-static-${VERSION}`;
const PAGES = `ejs-pages-${VERSION}`;
const IMAGES = `ejs-images-${VERSION}`;
const KEEP = [STATIC, PAGES, IMAGES];
const PRECACHE = ["/offline", "/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];
const MAX_PAGES = 200;
const MAX_IMAGES = 150;
const NETWORK_TIMEOUT = 3500;

const OUTBOX_DB = "ejs-offline";
const OUTBOX_STORE = "outbox";
const SYNC_TAG = "ejs-outbox";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("ejs-") && !KEEP.includes(n)).map((n) => caches.delete(n)));
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

/* ───────── fetch ───────── */

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname === "/sw.js") return;

  const isRsc = req.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
  if (isRsc) return; // see header comment

  if (req.mode === "navigate") {
    event.respondWith(networkFirstPage(event));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || req.destination === "font") {
    event.respondWith(cacheFirst(req, STATIC));
    return;
  }
  if (url.pathname.startsWith("/media/")) {
    // Quiz images never change for a given id.
    event.respondWith(cacheFirst(req, STATIC));
    return;
  }
  if (req.destination === "image" || url.pathname.startsWith("/_next/image")) {
    event.respondWith(staleWhileRevalidate(req, IMAGES, MAX_IMAGES));
    return;
  }
  event.respondWith(staleWhileRevalidate(req, STATIC));
});

function pageKey(url) {
  const u = new URL(url);
  u.hash = "";
  // Flash messages (?ok= / ?error=) shouldn't create separate cache entries.
  u.searchParams.delete("ok");
  u.searchParams.delete("error");
  return u.toString();
}

async function networkFirstPage(event) {
  const req = event.request;
  const cache = await caches.open(PAGES);
  const key = pageKey(req.url);
  try {
    const network = (async () => (await event.preloadResponse) || fetch(req))();
    const res = await Promise.race([
      network,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT)),
    ]);
    // Only cache real pages for signed-in content, never redirects (e.g. to /login).
    if (res.ok && !res.redirected && res.type === "basic") {
      event.waitUntil(cache.put(key, res.clone()).then(() => trim(PAGES, MAX_PAGES)));
    }
    return res;
  } catch {
    const cached = (await cache.match(key, { ignoreVary: true })) || (await cache.match(req, { ignoreSearch: true, ignoreVary: true }));
    if (cached) return cached;
    return (await caches.match("/offline", { ignoreVary: true })) || new Response("Hors ligne", { status: 503 });
  }
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, name, max) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreVary: true });
  const refresh = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone()).then(() => max && trim(name, max));
      return res;
    })
    .catch(() => hit);
  return hit || refresh;
}

async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

/* ───────── messages from the page ───────── */

self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type === "WARM" && Array.isArray(msg.urls)) event.waitUntil(warm(msg.urls));
  if (msg.type === "CLEAR_USER_CACHE") event.waitUntil(caches.delete(PAGES));
  if (msg.type === "SYNC_NOW") event.waitUntil(flushOutbox());
});

// Fetches each page and the static assets it references, so they open offline.
async function warm(urls) {
  const pages = await caches.open(PAGES);
  const assets = await caches.open(STATIC);
  const seen = new Set();
  for (const path of urls) {
    try {
      const res = await fetch(path, { credentials: "same-origin", headers: { Accept: "text/html" } });
      if (!res.ok || res.redirected) continue;
      const html = await res.clone().text();
      await pages.put(pageKey(new URL(path, self.location.origin).toString()), res);
      // Static assets and quiz images referenced by the page.
      for (const m of html.matchAll(/\/(?:_next\/static|media)\/[^"'\s)\\&]+/g)) {
        const asset = m[0];
        if (seen.has(asset)) continue;
        seen.add(asset);
        if (!(await assets.match(asset))) {
          const a = await fetch(asset).catch(() => null);
          if (a && a.ok) await assets.put(asset, a);
        }
      }
    } catch {
      /* offline or failed: try again on the next warm-up */
    }
  }
  await trim(PAGES, MAX_PAGES);
}

/* ───────── background sync ───────── */

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(flushOutbox());
});

function openOutbox() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OUTBOX_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(OUTBOX_STORE, { keyPath: "clientId" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idb(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction(OUTBOX_STORE, mode).objectStore(OUTBOX_STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function flushOutbox() {
  const db = await openOutbox();
  const runs = await idb(db, "readonly", (s) => s.getAll());
  const synced = [];
  for (const run of runs) {
    let res;
    try {
      res = await fetch("/api/sync/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(run),
        credentials: "same-origin",
      });
    } catch {
      throw new Error("offline"); // lets the browser retry the sync later
    }
    if (res.ok) {
      const data = await res.json();
      synced.push({ quizTitle: run.quizTitle, attemptId: data.attemptId, xpEarned: data.xpEarned });
      await idb(db, "readwrite", (s) => s.delete(run.clientId));
    } else if ([400, 403, 410].includes(res.status)) {
      await idb(db, "readwrite", (s) => s.delete(run.clientId));
    }
    // 401: the run belongs to someone who's signed out; keep it until they sign back in.
  }
  if (synced.length) {
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach((c) => c.postMessage({ type: "SYNCED", synced }));
  }
}
