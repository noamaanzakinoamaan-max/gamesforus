/* HeavenDigital PWA Service Worker v5 — Offline Shell, Fast Asset Cache & Web Push */
"use strict";

const SW_VERSION = "hd-pwa-v5";
const SHELL_CACHE = SW_VERSION + "-shell";
const PAGE_CACHE = SW_VERSION + "-pages";
const IMG_CACHE = SW_VERSION + "-images";
const MAX_IMG_ENTRIES = 260;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./offline.html",
  "./manifest.json",
  "./seo.css",
  "./reviews.js",
  "./firebase-config.js",
  "./qrcode.min.js",
  "./pwa-features.css",
  "./pwa-features.js",
  "./favicon.ico",
  "./favicon-48.png",
  "./img/icon-180.png",
  "./img/icon-192.png",
  "./img/icon-512.png",
  "./img/pwa/icon-192.png",
  "./img/pwa/icon-512.png",
  "./img/pwa/icon-maskable-192.png",
  "./img/pwa/icon-maskable-512.png"
];

const BYPASS_HOSTS = [
  "firestore.googleapis.com",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
  "firebaseinstallations.googleapis.com",
  "fcmregistrations.googleapis.com",
  "fcm.googleapis.com",
  "apis.google.com",
  "accounts.google.com",
  "www.googletagmanager.com",
  "www.google-analytics.com",
  "analytics.google.com",
  "api.emailjs.com",
  "static.cloudflareinsights.com"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async cache => {
      await Promise.allSettled(
        PRECACHE_URLS.map(url =>
          fetch(url, { cache: "reload" }).then(res => {
            if (res && res.ok) return cache.put(url, res);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => !k.startsWith(SW_VERSION))
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

async function trimCache(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxItems) {
      await Promise.all(keys.slice(0, keys.length - maxItems).map(k => cache.delete(k)));
    }
  } catch (_) {}
}

function shouldBypass(url) {
  if (url.protocol !== "http:" && url.protocol !== "https:") return true;
  return BYPASS_HOSTS.some(h => url.hostname === h || url.hostname.endsWith("." + h));
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (shouldBypass(url)) return;

  // 1. HTML Navigation requests: Network-first with fast timeout -> cached page -> offline fallback
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith((async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4500);
        const netRes = await fetch(req, { signal: ctrl.signal });
        clearTimeout(timer);
        if (netRes && netRes.ok) {
          const copy = netRes.clone();
          caches.open(PAGE_CACHE).then(c => c.put(req, copy)).catch(() => {});
          return netRes;
        }
      } catch (_) {}

      const cachedPage = await caches.match(req, { ignoreSearch: true });
      if (cachedPage) return cachedPage;

      // Root SPA fallback if navigating to store root
      if (url.pathname === "/" || url.pathname.endsWith("/index.html")) {
        const rootCached = await caches.match("./index.html") || await caches.match("./");
        if (rootCached) return rootCached;
      }

      const offlineRes = await caches.match("./offline.html");
      return offlineRes || new Response("Offline — please reconnect to browse HeavenDigital.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    })());
    return;
  }

  // 2. Images: Cache-first with background refresh & bounded LRU cap
  if (req.destination === "image" || /\.(png|jpe?g|webp|svg|gif|ico)$/i.test(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      const fetchPromise = fetch(req).then(res => {
        if (res && (res.ok || res.type === "opaque")) {
          const copy = res.clone();
          caches.open(IMG_CACHE).then(c => {
            c.put(req, copy);
            trimCache(IMG_CACHE, MAX_IMG_ENTRIES);
          }).catch(() => {});
        }
        return res;
      }).catch(() => null);

      return cached || (await fetchPromise) || new Response("", { status: 404 });
    })());
    return;
  }

  // 3. Static JS/CSS/Manifest & Firebase SDK scripts: Stale-while-revalidate
  if (
    url.origin === self.location.origin ||
    url.hostname === "www.gstatic.com" ||
    url.hostname === "cdn.jsdelivr.net"
  ) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      const netPromise = fetch(req).then(res => {
        if (res && (res.ok || res.type === "opaque")) {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => null);
      return cached || (await netPromise) || new Response("", { status: 504 });
    })());
  }
});

/* ============ Web Push & Notification Handling ============ */
function buildNotificationOptions(payload) {
  const data = payload || {};
  const targetUrl = data.url || data.link || (data.data && data.data.url) || "./#/";
  const opts = {
    body: data.body || data.message || "Tap to open HeavenDigital for the latest gaming drop.",
    icon: data.icon || "./img/pwa/icon-192.png",
    badge: data.badge || "./img/pwa/icon-96.png",
    tag: data.tag || ("hd-push-" + (data.id || Date.now())),
    renotify: Boolean(data.renotify),
    vibrate: [120, 60, 120],
    data: {
      url: targetUrl,
      category: data.category || "offers",
      id: data.id || String(Date.now())
    },
    actions: [
      { action: "open", title: data.actionTitle || "View Now" },
      { action: "dismiss", title: "Dismiss" }
    ]
  };
  if (data.image) opts.image = data.image;
  return opts;
}

self.addEventListener("push", event => {
  let payload = {
    title: "HeavenDigital",
    body: "New game deal or order update available!",
    url: "./#/"
  };
  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed.notification) {
        payload = {
          ...parsed.data,
          ...parsed.notification,
          url: (parsed.fcmOptions && parsed.fcmOptions.link) || (parsed.data && parsed.data.url) || parsed.url || "./#/"
        };
      } else {
        payload = { ...payload, ...parsed };
      }
    } catch (_) {
      payload.body = event.data.text() || payload.body;
    }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "HeavenDigital", buildNotificationOptions(payload))
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  if (event.action === "dismiss") return;

  const rawTarget = (event.notification.data && event.notification.data.url) || "./#/";
  const targetUrl = new URL(rawTarget, self.location.origin).href;

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windowClients) {
      if (new URL(client.url).origin === self.location.origin && "focus" in client) {
        await client.focus();
        client.postMessage({ type: "HD_NAVIGATE", url: targetUrl });
        return;
      }
    }
    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});

self.addEventListener("message", event => {
  const msg = event.data || {};
  if (msg.type === "SKIP_WAITING") {
    self.skipWaiting();
  } else if (msg.type === "SHOW_NOTIFICATION" && msg.payload) {
    const p = msg.payload;
    event.waitUntil(
      self.registration.showNotification(p.title || "HeavenDigital", buildNotificationOptions(p))
    );
  }
});
