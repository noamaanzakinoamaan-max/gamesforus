/* ============================================================================
   HeavenDigital v4 — PWA, retention, marketing & admin upgrade layer
   ----------------------------------------------------------------------------
   Loaded AFTER the main inline store script and the chat widget. It reaches the
   store only through window.hdCore (see index.html) — the store's own lexicals
   (state, cart, ROUTES, esc(), route(), CONFIG, …) stay private to that script.
   Nothing here replaces data: catalogue, orders, customers and settings keep
   flowing through the same Firestore project (games-bd87d).
   ========================================================================== */
(function () {
"use strict";

/* ------------------------------------------------------------------ */
/* 0 · tiny helpers                                                    */
/* ------------------------------------------------------------------ */
const HD = window.HD || {};
window.HD = HD;
/* private access to the store internals (window.hdCore is installed by index.html
   so this file never declares a second binding for state/cart/route/…) */
const CORE = window.hdCore || {};
if (!CORE.getState || !CORE.byId) console.warn("[hd] core store not found — v4 layer idle");
const state = new Proxy({}, {
  get: (_, k) => CORE.getState()[k],
  set: (_, k, v) => { CORE.getState()[k] = v; return true; },
  has: (_, k) => k in CORE.getState()
});
const cart = new Proxy({}, {
  get: (_, k) => CORE.getCart()[k],
  set: (_, k, v) => { CORE.getCart()[k] = v; return true; }
});
const route = (...a) => CORE.route(...a);
const toast = m => CORE.toast(m);
const byId = id => CORE.byId(id);

const LS = {
  wish: "hd_wishlist_v1",
  alerts: "hd_price_alerts_v1",
  notifs: "hd_notifs_v1",
  prefs: "hd_push_prefs_v1",
  install: "hd_install_state_v1",
  orders: "hd_local_orders_v1",
  seen: "hd_notif_seen_v1",
  reviews: "hd_review_prompt_v1"
};

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const v = JSON.parse(raw);
    return v == null ? fallback : v;
  } catch (e) { return fallback; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch (e) { return false; }
}
const nowTs = () => Date.now();
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const money = n => "₹" + Number(n || 0).toLocaleString("en-IN");

/* XSS-safe attribute/text escape (esc already exists, this one also strips control chars) */
function hdEsc(v) {
  return String(v == null ? "" : v)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
/* only allow http(s), mailto, tel, whatsapp, upi and in-page hash links */
function safeUrl(u, fallback = "#/") {
  const s = String(u == null ? "" : u).trim();
  if (!s) return fallback;
  if (/^#\//.test(s)) return s;
  if (/^(https?:|mailto:|tel:|upi:)/i.test(s)) return s;
  if (/^[a-z0-9._\-\/]+\.(png|jpe?g|webp|svg|gif|avif)$/i.test(s)) return s;
  if (/^img\//i.test(s)) return s;
  return fallback;
}
function safeImg(u) {
  const s = String(u || "").trim();
  if (!s) return "";
  if (/^(https?:)?\/\//i.test(s) || /^img\//i.test(s) || /^data:image\//i.test(s)) return s;
  return "";
}
const waNumber = () => String((typeof CONFIG !== "undefined" && CONFIG.whatsapp) || "919326436319").replace(/[^0-9]/g, "");
function waUrl(text) {
  return "https://wa.me/" + waNumber() + (text ? "?text=" + encodeURIComponent(text) : "");
}
function storeUrl(hash) {
  const base = location.origin + location.pathname.replace(/index\.html$/, "");
  return base + (hash || "");
}
function sharePayload(extra) {
  const base = {
    title: (typeof CONFIG !== "undefined" ? CONFIG.brand : "HeavenDigital") + " — PS5, Xbox & PC game accounts",
    text: "PS5, Xbox & PC game accounts in India — UPI checkout, ~10 min WhatsApp delivery, 2-year warranty.",
    url: storeUrl("#/")
  };
  return Object.assign(base, extra || {});
}

/* ------------------------------------------------------------------ */
/* 1 · persistent customer-side stores                                */
/* ------------------------------------------------------------------ */
/* One page-level mutable holder — the main store script owns its own lexicals,
   so every v4 field lives on HD.s to avoid global collisions. */
const S = HD.s = {
  wishlist: [], priceAlerts: [], notifs: [], prefs: null,
  pending: { profile: null, order: null }
};
function hydrateStores() {
  S.wishlist = lsGet(LS.wish, []); if (!Array.isArray(S.wishlist)) S.wishlist = [];
  S.priceAlerts = lsGet(LS.alerts, []); if (!Array.isArray(S.priceAlerts)) S.priceAlerts = [];
  S.notifs = lsGet(LS.notifs, []); if (!Array.isArray(S.notifs)) S.notifs = [];
  S.prefs = Object.assign(
    { enabled: false, new_releases: true, offers: true, price_drops: true, order_updates: true, asked: false },
    lsGet(LS.prefs, {}) || {}
  );
}
hydrateStores();
function P() { return S.prefs || (hydrateStores(), S.prefs); }

function saveWishlist() {
  lsSet(LS.wish, S.wishlist);
  paintWishBadge();
  syncWishlistCloud();
}
function inWishlist(id) { return S.wishlist.indexOf(id) > -1; }
function toggleWishlist(id) {
  if (!byId(id)) return false;
  const i = S.wishlist.indexOf(id);
  if (i > -1) S.wishlist.splice(i, 1); else S.wishlist.push(id);
  saveWishlist();
  document.querySelectorAll('[data-fav="' + id + '"]').forEach(b => {
    b.classList.toggle("on", inWishlist(id));
    b.setAttribute("aria-pressed", inWishlist(id) ? "true" : "false");
  });
  return inWishlist(id);
}
function paintWishBadge() {
  const dot = document.getElementById("wishDot");
  if (!dot) return;
  dot.textContent = String(S.wishlist.length);
  dot.hidden = S.wishlist.length === 0;
}
let wishCloudTimer = null;
function syncWishlistCloud() {
  if (!(state.fbReady && state.user && window.firebase)) return;
  clearTimeout(wishCloudTimer);
  wishCloudTimer = setTimeout(() => {
    try {
      firebase.firestore().collection("users").doc(state.user.uid)
        .set({ wishlist: S.wishlist.slice(0, 400), updatedAt: nowTs() }, { merge: true })
        .catch(() => {});
    } catch (e) {}
  }, 1200);
}
async function pullWishlistCloud() {
  if (!(state.fbReady && state.user && window.firebase)) return;
  try {
    const doc = await firebase.firestore().collection("users").doc(state.user.uid).get();
    const remote = doc.exists && Array.isArray(doc.data().wishlist) ? doc.data().wishlist : null;
    if (remote && remote.length) {
      const merged = Array.from(new Set(S.wishlist.concat(remote)));
      if (merged.length !== S.wishlist.length) { S.wishlist = merged; lsSet(LS.wish, S.wishlist); paintWishBadge(); }
    } else if (S.wishlist.length) {
      syncWishlistCloud();
    }
    applyProfile(doc.exists ? doc.data() : {});
  } catch (e) {}
}
function applyProfile(profile) {
  const p = profile || {};
  if (Array.isArray(p.wishlist) && p.wishlist.length) {
    const merged = Array.from(new Set(S.wishlist.concat(p.wishlist)));
    S.wishlist = merged; lsSet(LS.wish, S.wishlist); paintWishBadge();
  }
  if (Array.isArray(p.priceAlerts) && p.priceAlerts.length) {
    p.priceAlerts.forEach(a => {
      if (!a || !a.productId) return;
      if (!S.priceAlerts.some(x => x.productId === a.productId)) S.priceAlerts.push(a);
    });
    lsSet(LS.alerts, S.priceAlerts);
  }
  if (p.pushPrefs && typeof p.pushPrefs === "object") {
    S.prefs = Object.assign(P(), p.pushPrefs);
    lsSet(LS.prefs, P());
  }
  HD.profile = p;
}
function savePriceAlerts() {
  lsSet(LS.alerts, S.priceAlerts);
  if (state.fbReady && state.user && window.firebase) {
    const db = firebase.firestore();
    S.priceAlerts.slice(0, 40).forEach(a => {
      const id = (state.user.uid + "_" + a.productId).replace(/[^A-Za-z0-9_\-]/g, "").slice(0, 120);
      db.collection("S.priceAlerts").doc(id).set({
        uid: state.user.uid, productId: a.productId, title: String(a.title || "").slice(0, 150),
        targetPrice: Number(a.targetPrice) || 0, ts: a.ts || nowTs()
      }, { merge: true }).catch(() => {});
    });
  }
}
function alertFor(id) { return S.priceAlerts.find(a => a.productId === id) || null; }
function setPriceAlert(id, target) {
  const p = byId(id); if (!p) return;
  const t = clamp(Math.round(Number(target) || 0), 1, 100000);
  const i = S.priceAlerts.findIndex(a => a.productId === id);
  if (i > -1) S.priceAlerts.splice(i, 1);
  S.priceAlerts.push({ productId: id, title: p.title, targetPrice: t, ts: nowTs(), startPrice: p.price });
  savePriceAlerts();
}
function removePriceAlert(id) {
  const i = S.priceAlerts.findIndex(a => a.productId === id);
  if (i > -1) S.priceAlerts.splice(i, 1);
  savePriceAlerts();
}

/* ------------------------------------------------------------------ */
/* 2 · notification centre (in-app mirror of push)                     */
/* ------------------------------------------------------------------ */
function pushLocalNotif(n) {
  const item = {
    id: n.id || ("n" + nowTs() + Math.random().toString(36).slice(2, 6)),
    title: String(n.title || "HeavenDigital").slice(0, 90),
    body: String(n.body || "").slice(0, 220),
    url: safeUrl(n.url || "#/"),
    category: n.category || "offers",
    ts: n.ts || nowTs(),
    read: false,
    image: n.image ? safeImg(n.image) : ""
  };
  S.notifs.unshift(item);
  S.notifs = S.notifs.slice(0, 60);
  lsSet(LS.notifs, S.notifs);
  paintNotifBadge();
  return item;
}
function unreadNotifs() { return S.notifs.filter(n => !n.read).length; }
function paintNotifBadge() {
  const dot = document.getElementById("notifDot");
  if (!dot) return;
  const n = unreadNotifs();
  dot.textContent = n > 9 ? "9+" : String(n);
  dot.hidden = n === 0;
}
function markNotifsRead() {
  S.notifs.forEach(n => { n.read = true; });
  lsSet(LS.notifs, S.notifs);
  paintNotifBadge();
}
function notifIcon(cat) {
  return cat === "price_drops" ? "📉" : cat === "order_updates" ? "📦" : cat === "new_releases" ? "🆕" : "🎁";
}

/* Broadcast notifications published by the owner in the admin panel.
   The `notifications` collection is world-readable, owner-writable. */
let notifUnsub = null;
function listenBroadcasts() {
  if (!(state.fbReady && window.firebase) || notifUnsub) return;
  try {
    const seen = lsGet(LS.seen, []) || [];
    notifUnsub = firebase.firestore().collection("notifications")
      .orderBy("ts", "desc").limit(20)
      .onSnapshot(snap => {
        let added = 0;
        snap.docs.forEach(d => {
          const n = d.data() || {};
          if (seen.indexOf(d.id) > -1) return;
          if (n.active === false) return;
          const cat = n.category || "offers";
          if (!P()[cat]) return;
          if ((n.ts || 0) < nowTs() - 1000 * 60 * 60 * 24 * 30) return;
          pushLocalNotif({ id: d.id, title: n.title, body: n.body, url: n.url || "#/", category: cat, ts: n.ts, image: n.image });
          seen.push(d.id);
          added++;
        });
        if (added) {
          lsSet(LS.seen, seen.slice(-120));
          const first = S.notifs[0];
          if (first) toast("🔔 " + first.title);
        }
      }, err => { console.warn("[notifs] listener", err && err.message); });
  } catch (e) { console.warn("[notifs] subscribe failed", e); }
}

/* ------------------------------------------------------------------ */
/* 3 · service worker registration + install experience                */
/* ------------------------------------------------------------------ */
let swReg = null;
let deferredPrompt = null;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
  navigator.standalone === true ||
  (window.matchMedia && window.matchMedia("(display-mode: minimal-ui)").matches);

function registerSW() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js", { scope: "./" }).then(reg => {
      swReg = reg;
      if (reg.waiting) showUpdateToast(reg);
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) showUpdateToast(reg);
        });
      });
      setTimeout(() => { try { reg.update(); } catch (e) {} }, 60 * 1000 * 10);
    }).catch(err => console.warn("[pwa] service worker registration failed", err));
  });
  navigator.serviceWorker.addEventListener("message", ev => {
    const msg = ev.data || {};
    if (msg.type === "HD_NAVIGATE" && msg.url) {
      try {
        const u = new URL(msg.url, location.href);
        if (u.hash) location.hash = u.hash;
        else location.href = u.href;
      } catch (e) {}
    }
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (window.__hdReloading) return;
    window.__hdReloading = true;
    setTimeout(() => location.reload(), 200);
  });
}
function showUpdateToast(reg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.innerHTML = "App update ready — <b style=\"text-decoration:underline;cursor:pointer\" id=\"hdUpd\">tap to refresh</b>";
  t.classList.add("show");
  const btn = document.getElementById("hdUpd");
  if (btn) btn.onclick = () => {
    try { reg.waiting && reg.waiting.postMessage({ type: "SKIP_WAITING" }); } catch (e) {}
    setTimeout(() => location.reload(), 300);
  };
}

function captureInstallPrompt() {
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferredPrompt = e;
    setTimeout(maybeShowInstallBanner, 1200);
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    lsSet(LS.install, { installed: true, ts: nowTs() });
    hideInstallBanner(true);
    pushLocalNotif({ title: "You're all set 🎮", body: "HeavenDigital is installed. Open it any time from your home screen.", url: "#/", category: "offers" });
    toast("HeavenDigital installed 🎉");
  });
  setTimeout(maybeShowInstallBanner, 6000);
}
function installDismissed() {
  const s = lsGet(LS.install, {}) || {};
  if (s.installed) return true;
  if (!s.dismissedAt) return false;
  return nowTs() - s.dismissedAt < 1000 * 60 * 60 * 24 * 9;
}
function maybeShowInstallBanner() {
  if (isStandalone() || installDismissed()) return;
  const box = document.getElementById("pwaBanner");
  if (!box) return;
  const canNative = !!deferredPrompt;
  const iosGuide = isIOS && !canNative;
  if (!canNative && !iosGuide) return;
  box.innerHTML =
    '<img src="img/pwa/icon-192.png" alt="" width="46" height="46">' +
    '<div class="pwa-banner-txt"><b>Install ' + hdEsc(CONFIG.brand) + ' app</b>' +
    '<span>' + (iosGuide ? "Tap Share ⤴ then “Add to Home Screen” — full-screen, works offline." : "Faster launch, offline catalog & push alerts. No app store needed.") + "</span></div>" +
    '<button class="btn btn-sm" id="pwaInstallBtn">' + (iosGuide ? "How?" : "Install") + "</button>" +
    '<button class="pwa-banner-close" id="pwaBannerX" aria-label="Dismiss">✕</button>';
  box.hidden = false;
  const go = document.getElementById("pwaInstallBtn");
  if (go) go.onclick = iosGuide ? showIosGuide : doInstall;
  const x = document.getElementById("pwaBannerX");
  if (x) x.onclick = () => hideInstallBanner(false);
}
function hideInstallBanner(installed) {
  const box = document.getElementById("pwaBanner");
  if (box) { box.hidden = true; box.innerHTML = ""; }
  if (!installed) {
    const s = lsGet(LS.install, {}) || {};
    s.dismissedAt = nowTs();
    lsSet(LS.install, s);
  }
}
async function doInstall() {
  if (!deferredPrompt) { showIosGuide(); return; }
  try {
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (choice && choice.outcome === "accepted") hideInstallBanner(true);
    else hideInstallBanner(false);
  } catch (e) { hideInstallBanner(false); }
}
function showIosGuide() {
  openHdModal("Install on iPhone / iPad", `
    <ol class="hd-steps">
      <li>Open <b>heavendigital.store</b> in <b>Safari</b> (Chrome on iOS can't install).</li>
      <li>Tap the <b>Share</b> button <span class="hd-kbd">⤴</span> in the toolbar.</li>
      <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
      <li>Tap <b>Add</b> — the HeavenDigital icon appears on your home screen with splash screen and offline support.</li>
    </ol>
    <p class="hint">On Android: Chrome menu ⋮ → <b>Install app</b> (or the Install button in our banner).</p>
    <div class="paybtns"><button class="btn btn-block" data-close-modal>Got it</button></div>`);
}
function paintOfflineBar() {
  const bar = document.getElementById("offlineBar");
  if (!bar) return;
  bar.hidden = navigator.onLine;
}
function bindConnectivity() {
  window.addEventListener("online", () => { paintOfflineBar(); toast("Back online ✅"); syncPendingNotifs(); });
  window.addEventListener("offline", () => { paintOfflineBar(); toast("You're offline — cached catalog still works"); });
  paintOfflineBar();
}
function syncPendingNotifs() { if (state.fbReady) listenBroadcasts(); }

/* ------------------------------------------------------------------ */
/* 4 · Web Push (VAPID) consent + subscription                         */
/* ------------------------------------------------------------------ */
function b64ToU8(base64) {
  const pad = "=".repeat((4 - base64.length % 4) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
function vapidKey() {
  const s = (state && state.settings) || {};
  return String(s.vapidPublicKey || (typeof CONFIG !== "undefined" && CONFIG.vapidPublicKey) || "").trim();
}
async function enablePush(silent) {
  P().asked = true;
  lsSet(LS.prefs, P());
  if (!pushSupported()) {
    if (!silent) toast(isIOS && !isStandalone() ? "On iPhone: install the app first, then enable alerts" : "This browser can't receive push alerts — in-app alerts are on");
    return false;
  }
  let perm = Notification.permission;
  if (perm === "default") {
    try { perm = await Notification.requestPermission(); } catch (e) { perm = "denied"; }
  }
  if (perm !== "granted") {
    if (!silent) toast("Notifications blocked — allow them in your browser settings");
    P().enabled = false; lsSet(LS.prefs, P()); paintPushToggles();
    return false;
  }
  P().enabled = true;
  lsSet(LS.prefs, P());
  paintPushToggles();
  const key = vapidKey();
  try {
    const reg = swReg || (navigator.serviceWorker ? await navigator.serviceWorker.ready : null);
    if (!reg) throw new Error("no service worker");
    if (!key) {
      // No VAPID key configured yet: keep in-app alerts working and remember consent.
      if (!silent) toast("Alerts on — in-app notifications active. Push needs the VAPID key (see PUSH-SETUP.md).");
      await savePushConsent(reg, null);
      return true;
    }
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(key) });
    }
    await savePushConsent(reg, sub);
    if (!silent) {
      toast("Push alerts enabled 🔔");
      pushLocalNotif({ title: "Alerts enabled 🔔", body: "You'll be first to know about new releases, offers and price drops.", url: "#/account?tab=alerts", category: "offers" });
    }
    return true;
  } catch (err) {
    console.warn("[push] subscribe failed", err);
    // Graceful fallback when VAPID/Firebase Messaging is not set up yet.
    P().enabled = true; lsSet(LS.prefs, P());
    try { await savePushConsent(swReg, null); } catch (e) {}
    if (!silent) toast("Alerts on for this device — in-app notifications active");
    return true;
  }
}
async function savePushConsent(reg, sub) {
  if (!(state.fbReady && window.firebase)) return;
  const json = sub ? sub.toJSON() : null;
  const id = String(state.user ? state.user.uid : "guest").replace(/[^A-Za-z0-9_\-]/g, "") + "_" +
    (json && json.endpoint ? json.endpoint.slice(-24).replace(/[^A-Za-z0-9_\-]/g, "") : "inapp");
  const payload = {
    uid: state.user ? state.user.uid : "guest",
    endpoint: (json && json.endpoint) || storeUrl("#/") + " (in-app only)",
    keys: (json && json.keys) || null,
    topics: {
      new_releases: !!P().new_releases,
      offers: !!P().offers,
      price_drops: !!P().price_drops,
      order_updates: !!P().order_updates
    },
    consentAt: nowTs(),
    updatedAt: nowTs(),
    platform: isIOS ? "ios" : /Android/i.test(navigator.userAgent) ? "android" : "desktop",
    ua: navigator.userAgent.slice(0, 180),
    active: true
  };
  try {
    await firebase.firestore().collection("pushSubscriptions").doc(id.slice(0, 120)).set(payload, { merge: true });
  } catch (e) { console.warn("[push] consent save skipped", e && e.message); }
  if (state.user) {
    firebase.firestore().collection("users").doc(state.user.uid)
      .set({ pushPrefs: Object.assign({}, P(), { enabled: true }), updatedAt: nowTs() }, { merge: true })
      .catch(() => {});
  }
}
function disablePush() {
  P().enabled = false;
  lsSet(LS.prefs, P());
  paintPushToggles();
  (async () => {
    try {
      const reg = swReg || (navigator.serviceWorker ? await navigator.serviceWorker.ready : null);
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
      }
    } catch (e) {}
  })();
  toast("Push alerts off");
}
function paintPushToggles() {
  document.querySelectorAll("[data-push-toggle]").forEach(el => {
    el.checked = !!P()[el.dataset.pushToggle];
  });
  document.querySelectorAll("[data-push-master]").forEach(el => {
    el.checked = !!P().enabled;
    const lbl = el.closest(".push-master");
    if (lbl) lbl.classList.toggle("on", !!P().enabled);
  });
}
async function askNotificationConsent(force) {
  if (!force && (P().asked || P().enabled)) return;
  /* Never steal a dialog from the visitor: if something else is open (checkout,
     notification centre, a product dialog) wait for a quieter moment. */
  if (!force) {
    const root = document.getElementById("modalRoot");
    if (root && root.innerHTML.trim()) {
      if (!askNotificationConsent._retry) {
        askNotificationConsent._retry = true;
        setTimeout(() => { askNotificationConsent._retry = false; askNotificationConsent(false); }, 20000);
      }
      return;
    }
  }
  if (isStandalone() === false && isIOS) { /* iOS needs installed PWA for push */ }
  openHdModal("Never miss a drop", `
    <p class="sub" style="margin-top:0">Get a silent, one-line alert when a wishlisted game drops in price, a new release lands, or a limited offer goes live. We never message more than a few times a month.</p>
    <div class="consent-grid">
      <label class="consent-item"><input type="checkbox" checked disabled> <span><b>New releases</b><i>Day-one drops &amp; preorders</i></span></label>
      <label class="consent-item"><input type="checkbox" checked disabled> <span><b>Offers &amp; sales</b><i>Automatic discount windows</i></span></label>
      <label class="consent-item"><input type="checkbox" checked disabled> <span><b>Price drops</b><i>Wishlist &amp; price alerts</i></span></label>
      <label class="consent-item"><input type="checkbox" checked disabled> <span><b>Order updates</b><i>Payment verified &amp; delivered</i></span></label>
    </div>
    <p class="hint">You can turn any of these off later in <b>Account → Alerts</b>. Consent is stored on this device and, if you're signed in, in your HeavenDigital account.</p>
    <div class="paybtns">
      <button class="btn btn-block" id="consentYes">Enable alerts</button>
      <button class="btn btn-ghost btn-block" data-consent-no>Not now</button>
    </div>`);
  const yes = document.getElementById("consentYes");
  if (yes) yes.onclick = async () => { await enablePush(false); closeModal(); route(); };
  document.querySelectorAll("[data-consent-no]").forEach(b => b.onclick = () => {
    P().asked = true; lsSet(LS.prefs, P()); closeModal();
  });
}

/* ------------------------------------------------------------------ */
/* 5 · modal shell (used by every new dialog)                         */
/* ------------------------------------------------------------------ */
function openHdModal(title, bodyHtml, opts) {
  const o = opts || {};
  const root = document.getElementById("modalRoot");
  if (!root) return;
  root.innerHTML =
    '<div class="overlay" data-overlay><div class="modal' + (o.wide ? " modal-wide" : "") + '" role="dialog" aria-modal="true" aria-label="' + hdEsc(title) + '">' +
    '<button class="x" data-close-modal aria-label="Close">✕</button>' +
    (title ? "<h3>" + hdEsc(title) + "</h3>" : "") + bodyHtml + "</div></div>";
  document.body.style.overflow = "hidden";
  const ov = root.querySelector("[data-overlay]");
  if (ov) ov.addEventListener("click", e => { if (e.target === ov) closeModal(); });
  const f = root.querySelector("[autofocus]");
  if (f) setTimeout(() => { try { f.focus(); } catch (e) {} }, 60);
  return root;
}

/* ------------------------------------------------------------------ */
/* 6 · sharing                                                         */
/* ------------------------------------------------------------------ */
function shareProduct(id) {
  const p = byId(id);
  if (!p) return;
  const url = storeUrl("#/p/" + p.id);
  const off = offPct(p);
  const text = "🎮 " + p.title + " — " + money(p.price) + (off ? " (" + off + "% off, MRP " + money(p.mrp) + ")" : "") +
    " on " + CONFIG.brand + ". UPI checkout, WhatsApp delivery in ~10 min, 2-year warranty.";
  const waText = text + "\n" + url;
  openHdModal("Share this deal", `
    <p class="sub" style="margin-top:0">Send it to a friend — every share carries your store link and live price.</p>
    <div class="share-card">
      ${p.img ? '<img src="' + hdEsc(safeImg(p.img)) + '" alt="" loading="lazy">' : ""}
      <div><b>${hdEsc(p.title)}</b><span>${money(p.price)}${off ? " · " + off + "% off" : ""}</span></div>
    </div>
    <div class="share-grid">
      <a class="share-btn wa" target="_blank" rel="noopener" href="${hdEsc(waUrl(waText))}">${WAICON}<span>WhatsApp</span></a>
      <button class="share-btn" type="button" data-share-copy="${hdEsc(waText)}">🔗 Copy link</button>
      <button class="share-btn" type="button" data-share-native="${hdEsc(id)}">📤 More apps</button>
      <a class="share-btn" target="_blank" rel="noopener" href="https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}">✈️ Telegram</a>
      <a class="share-btn" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}">𝕏 Post</a>
      <a class="share-btn" target="_blank" rel="noopener" href="https://api.whatsapp.com/send?text=${encodeURIComponent(text + "\n" + url)}">💬 Status</a>
    </div>
    <p class="hint" style="margin-bottom:0">Tip: share to WhatsApp Status for the highest reach — most of our buyers arrive from a friend's screenshot.</p>`);
}
async function nativeShare(title, text, url) {
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return true; } catch (e) { return false; }
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* 7 · instant search overlay                                          */
/* ------------------------------------------------------------------ */
let searchTimer = null;
function openSearchOverlay(prefill) {
  openHdModal("", `
    <div class="quick-search">
      <div class="filter-search" style="margin-bottom:10px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input class="f" id="qsInput" placeholder="Search 250+ games — try “spider”, “fc”, “pass”…" autofocus autocomplete="off" value="${hdEsc(prefill || "")}">
      </div>
      <div id="qsOut" class="qs-out"></div>
      <p class="hint" style="margin-bottom:0">Press <span class="hd-kbd">Esc</span> to close · <span class="hd-kbd">/</span> opens search anywhere.</p>
    </div>`);
  const inp = document.getElementById("qsInput");
  if (inp) {
    inp.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => renderQuickSearch(inp.value), 90); });
    setTimeout(() => { try { inp.focus(); } catch (e) {} }, 50);
    if (prefill) renderQuickSearch(prefill); else renderQuickSearch("");
  }
}
function renderQuickSearch(q) {
  const out = document.getElementById("qsOut");
  if (!out) return;
  const term = String(q || "").trim();
  if (!term) {
    const hot = Object.values(state.products).filter(p => p.active !== false).sort((a, b) => offPct(b) - offPct(a)).slice(0, 6);
    out.innerHTML = '<p class="qs-h">Top deals right now</p>' + quickRows(hot);
    return;
  }
  const s = term.toLowerCase();
  const hits = Object.values(state.products).filter(p => p.active !== false && (
    (p.title || "").toLowerCase().includes(s) ||
    (p.games || []).some(g => String(g).toLowerCase().includes(s)) ||
    (p.region || "").toLowerCase().includes(s) ||
    (PLATFORMS[p.platform] || {}).long && (PLATFORMS[p.platform].long || "").toLowerCase().includes(s)
  )).slice(0, 8);
  out.innerHTML = hits.length
    ? '<p class="qs-h">' + hits.length + " match" + (hits.length === 1 ? "" : "es") + "</p>" + quickRows(hits) +
      '<a class="btn btn-ghost btn-block btn-sm" href="#/search?q=' + encodeURIComponent(term) + '" data-close-modal style="margin-top:10px">See all results →</a>'
    : '<p class="sub" style="text-align:center;padding:14px 0">No match for “' + hdEsc(term) + '”. <a href="' + hdEsc(waUrl("Hi! Do you have " + term + "?")) + '" target="_blank" rel="noopener">Ask us on WhatsApp</a> — if it exists, we source it.</p>';
}
function quickRows(list) {
  return '<div class="qs-list">' + list.map(p => {
    const pl = PLATFORMS[p.platform] || PLATFORMS.pc;
    return '<a class="qs-row" href="#/p/' + p.id + '" data-close-modal>' +
      (p.img ? '<img src="' + hdEsc(safeImg(p.img)) + '" alt="" loading="lazy">' : '<span class="qs-ph">' + hdEsc((p.title || "?")[0]) + "</span>") +
      '<span class="qs-t"><b>' + hdEsc(p.title) + "</b><i>" + hdEsc(pl.long) + " · " + hdEsc(p.region || "Global") + "</i></span>" +
      '<span class="qs-p">' + money(p.price) + (offPct(p) ? '<em>' + offPct(p) + "% off</em>" : "") + "</span></a>";
  }).join("") + "</div>";
}

/* ------------------------------------------------------------------ */
/* 8 · UPI QR (client-side, no network call, no data leaves the device) */
/* ------------------------------------------------------------------ */
/* CONFIG is a top-level const in index.html, so it is not a global here:
   read the same values through the settings the store keeps in state. */
const hdCfg = () => Object.assign({ brand: "HeavenDigital", whatsapp: "919326436319", upiId: "Q693100998@ybl",
  email: "support@heavendigital.in", hours: "10am–11pm IST" }, (state.settings || {}));
const CONFIG = new Proxy({}, { get: (_, k) => hdCfg()[k] });
function upiString(amount, note) {
  const upi = String((CONFIG && CONFIG.upiId) || "").trim();
  return "upi://pay?pa=" + encodeURIComponent(upi) +
    "&pn=" + encodeURIComponent(CONFIG.brand || "HeavenDigital") +
    "&am=" + Number(amount || 0).toFixed(2) + "&cu=INR" +
    (note ? "&tn=" + encodeURIComponent(String(note).slice(0, 40)) : "");
}
function upiQrSvg(amount, note, sizePx) {
  const px = sizePx || 132;
  try {
    if (typeof qrcode !== "function") return "";
    const qr = qrcode(0, "M");
    qr.addData(upiString(amount, note));
    qr.make();
    const n = qr.getModuleCount();
    const quiet = 2, total = n + quiet * 2;
    let path = "";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) path += "M" + (c + quiet) + " " + (r + quiet) + "h1v1h-1z";
      }
    }
    return '<svg viewBox="0 0 ' + total + " " + total + '" width="' + px + '" height="' + px +
      '" role="img" aria-label="UPI payment QR code" shape-rendering="crispEdges">' +
      '<rect width="' + total + '" height="' + total + '" fill="#fff"/>' +
      '<path d="' + path + '" fill="#0b0d12"/></svg>';
  } catch (e) { return ""; }
}
const UPI_APPS = [
  ["GPay", "tez://upi/pay"],
  ["PhonePe", "phonepe://pay"],
  ["Paytm", "paytmmp://pay"]
];
function upiAppLinks(amount, note) {
  return UPI_APPS.map(([name, scheme]) => {
    const q = upiString(amount, note).replace(/^upi:\/\/pay\?/, "");
    return '<a class="upi-app-btn" href="' + scheme + "?" + q + '" target="_blank" rel="noopener">' + name + "</a>";
  }).join("");
}

/* ------------------------------------------------------------------ */
/* 9 · invoices (printable + downloadable, no external library)       */
/* ------------------------------------------------------------------ */
function invoiceHtml(order, items) {
  const o = order || {};
  const lines = Array.isArray(items) ? items : (Array.isArray(o.items) ? o.items : []);
  const oid = o.oid || "HD-00000";
  const dt = o.ts ? new Date(o.ts) : new Date();
  const total = Number(o.total || 0);
  const disc = Number(o.discount || 0) + Number(o.refOff || 0) + Number(o.promoOff || 0) + Number(o.pointsOff || 0);
  const sub = total + disc;
  const rows = lines.map(l => {
    const s = String(l);
    const m = s.match(/^(.*?)\s+—\s+₹([\d,]+)\s*$/);
    const label = m ? m[1] : s;
    const amt = m ? Number(m[2].replace(/,/g, "")) : "";
    return "<tr><td>" + hdEsc(label) + "</td><td style=\"text-align:right\">" + (amt ? money(amt) : "—") + "</td></tr>";
  }).join("");
  return '<div class="inv-paper" id="invPaper">' +
    '<div class="inv-head"><div><b style="font-size:19px">' + hdEsc(CONFIG.brand) + '</b>' +
    '<div class="sub" style="font-size:12px;margin-top:2px">heavendigital.store · ' + hdEsc(CONFIG.email) + "<br>WhatsApp +" + hdEsc(CONFIG.whatsapp) + " · " + hdEsc(CONFIG.hours) + "</div></div>" +
    '<div style="text-align:right"><b style="font-family:var(--mono)">' + hdEsc(oid) + "</b>" +
    '<div class="sub" style="font-size:12px">' + dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) + "<br>Status: " + hdEsc((o.status || "pending").toUpperCase()) + "</div></div></div>" +
    '<table class="inv-tbl"><thead><tr><th>Item</th><th style="text-align:right">Amount</th></tr></thead><tbody>' + rows + "</tbody></table>" +
    '<div class="sumline"><span>Subtotal</span><span>' + money(sub) + "</span></div>" +
    (disc ? '<div class="sumline"><span>Discounts &amp; rewards</span><span>− ' + money(disc) + "</span></div>" : "") +
    '<div class="sumline total"><span>Total paid</span><span>' + money(total) + "</span></div>" +
    '<div class="inv-warranty"><b>2-year replacement warranty.</b> Keep this invoice for warranty claims. All sales are final — replacements only, no refunds. Independent reseller; not affiliated with Sony, Microsoft, Valve, EA or Ubisoft.</div>' +
    '<p class="sub" style="font-size:11px;margin:12px 0 0">Warranty/help: WhatsApp +' + hdEsc(CONFIG.whatsapp) + " · " + hdEsc(CONFIG.email) + " · quote order " + hdEsc(oid) + ".</p>" +
    "</div>";
}
function openInvoice(order, items) {
  openHdModal("Invoice " + (order && order.oid ? order.oid : ""), invoiceHtml(order, items) + `
    <div class="paybtns no-print" style="margin-top:14px">
      <button class="btn btn-block" data-print-invoice>🖨 Print / Save as PDF</button>
      <button class="btn btn-ghost btn-block" data-download-invoice="${hdEsc((order && order.oid) || "")}">⬇ Download HTML copy</button>
      <a class="btn btn-ghost btn-block" target="_blank" rel="noopener" href="${hdEsc(waUrl("Hi! Invoice/order update request for " + ((order && order.oid) || "")))}">Ask support on WhatsApp</a>
    </div>`);
}
function downloadInvoice(oid) {
  const ord = (state.orders || []).find(o => o.oid === oid) || (localOrders().find(o => o.oid === oid)) || { oid };
  const body = invoiceHtml(ord, ord.items);
  const doc = "<!doctype html><html><head><meta charset=\"utf-8\"><title>Invoice " + hdEsc(oid) + "</title>" +
    "<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#fff;color:#111;max-width:720px;margin:24px auto;padding:0 16px}" +
    ".inv-head{display:flex;justify-content:space-between;gap:14px;border-bottom:1px solid #ddd;padding-bottom:12px}" +
    ".inv-tbl{width:100%;border-collapse:collapse;margin:14px 0}.inv-tbl th,.inv-tbl td{border-bottom:1px solid #e5e5e5;padding:8px 6px;text-align:left;font-size:13px}" +
    ".sub{color:#666;font-size:12px}.sumline{display:flex;justify-content:space-between;padding:5px 0;font-size:13px}.sumline.total{font-weight:800;border-top:1px solid #ddd;margin-top:6px;padding-top:10px}" +
    ".inv-warranty{border:1px solid #86efac;background:#f4fdf7;border-radius:10px;padding:10px;font-size:12px;margin-top:14px}.no-print{display:none}</style></head><body>" +
    body + "</body></html>";
  const blob = new Blob([doc], { type: "text/html;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "HeavenDigital-Invoice-" + String(oid).replace(/[^A-Za-z0-9\-]/g, "") + ".html";
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  toast("Invoice downloaded");
}
function printInvoice() { try { window.print(); } catch (e) { toast("Use your browser's Print option"); } }

/* ------------------------------------------------------------------ */
/* 10 · local order mirror (works even when signed out)                */
/* ------------------------------------------------------------------ */
function localOrders() {
  const list = lsGet(LS.orders, []);
  return Array.isArray(list) ? list : [];
}
function rememberLocalOrder(o) {
  if (!o || !o.oid) return;
  const list = localOrders().filter(x => x.oid !== o.oid);
  list.unshift({
    oid: o.oid, ts: o.ts || nowTs(), total: Number(o.total || 0), status: o.status || "pending",
    items: Array.isArray(o.items) ? o.items.slice(0, 25) : [],
    discount: Number(o.discount || 0), refOff: Number(o.refOff || 0),
    promoOff: Number(o.promoOff || 0), pointsOff: Number(o.pointsOff || 0),
    name: (o.name || "").slice(0, 60)
  });
  lsSet(LS.orders, list.slice(0, 40));
}
HD.localOrders = localOrders;
HD.rememberLocalOrder = rememberLocalOrder;

/* ------------------------------------------------------------------ */
/* 11 · release calendar data (static, owner-editable in admin later)  */
/* ------------------------------------------------------------------ */
const HD_RELEASES = [
  { title: "Resident Evil 9: Requiem", date: "2026-02-27", plats: ["PS5", "Xbox", "PC"], tag: "Survival horror", img: "img/gt/resident-evil-9-requiem.jpg", note: "Leon & Grace return — launch-day accounts from ₹999." },
  { title: "Crimson Desert", date: "2026-03-19", plats: ["PS5", "Xbox", "PC"], tag: "Open world", img: "img/crimson-desert-cover.png", note: "Pearl Abyss' single-player epic. Preorder price locks today." },
  { title: "007 First Light", date: "2026-03-27", plats: ["PS5", "Xbox", "PC"], tag: "Action", img: "img/585a355a3599.png", note: "Bond's origin story from IO Interactive." },
  { title: "Saros", date: "2026-03-20", plats: ["PS5"], tag: "Roguelike", img: "img/gt/saros.jpg", note: "Housemarque's Returnal follow-up." },
  { title: "Marvel's Wolverine", date: "2026-04-24", plats: ["PS5"], tag: "Action", img: "img/5bc87779b227.jpg", note: "Insomniac's grounded, M-rated Wolverine." },
  { title: "Phantom Blade Zero", date: "2026-05-15", plats: ["PS5", "PC"], tag: "Action RPG", img: "img/phantom-blade-zero-cover.jpg", note: "Kung-fu punk slasher — PC from ₹499." },
  { title: "Forza Horizon 6", date: "2026-06-12", plats: ["Xbox", "PC"], tag: "Racing", img: "img/46dda431d2e6.jpg", note: "Japan-set Horizon. Premium Edition bundles available." },
  { title: "Ghost of Yotei", date: "2026-07-10", plats: ["PS5"], tag: "Open world", img: "img/9524759650d5.png", note: "Sucker Punch's follow-up to Tsushima." },
  { title: "Resonance: A Plague Tale Legacy", date: "2026-08-21", plats: ["PS5", "Xbox", "PC"], tag: "Story", img: "img/gt/resonance-a-plague-tale-legacy.jpg", note: "New chapter in the Plague Tale universe." },
  { title: "EA SPORTS FC 27", date: "2026-09-25", plats: ["PS5", "Xbox", "PC"], tag: "Sports", img: "img/fc27-cover.png", note: "Ultimate Edition bundles land day one." },
  { title: "Call of Duty: Modern Warfare 4", date: "2026-10-16", plats: ["PS5", "Xbox", "PC"], tag: "Shooter", img: "img/cod-mw4-cover.webp", note: "Campaign + multiplayer, cross-gen accounts." },
  { title: "NBA 2K27", date: "2026-09-04", plats: ["PS5", "Xbox"], tag: "Sports", img: "img/gt/nba-2k27.jpg", note: "Next-gen build — 4K/120 supported." },
  { title: "GTA VI", date: "2026-11-19", plats: ["PS5", "Xbox"], tag: "Blockbuster", img: "img/1c13fc05be39.png", note: "The one everyone's waiting for. Price alerts open now." },
  { title: "Blood of Dawnwalker", date: "2026-12-04", plats: ["PS5", "Xbox", "PC"], tag: "Dark fantasy", img: "img/blood-of-dawnwalker-cover.jpg", note: "Rebel Wolves' debut — day/night RPG." },
  { title: "Control Resonant", date: "2027-02-12", plats: ["PS5", "Xbox", "PC"], tag: "Action", img: "img/control-resonant-cover.jpg", note: "Remedy returns to the Federal Bureau of Control." }
];
function releaseState(r) {
  const t = new Date(r.date + "T00:00:00+05:30").getTime();
  const d = t - nowTs();
  if (d <= 0 && d > -1000 * 60 * 60 * 24 * 45) return { cls: "now", label: "Out now" };
  if (d <= 0) return { cls: "now", label: "Available" };
  if (d < 1000 * 60 * 60 * 24 * 30) return { cls: "pre", label: "This month" };
  return { cls: "soon", label: "Upcoming" };
}
function fmtDate(iso) {
  const d = new Date(iso + "T00:00:00+05:30");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
HD.releases = HD_RELEASES;
/* --- part 2: storefront views --- */
/* ------------------------------------------------------------------ */
/* 12 · storefront views — cards, catalog, deals, S.wishlist            */
/* ------------------------------------------------------------------ */
/* --- storefront views live in the main store script; only the card markup is
   upgraded here so wishlist/notify/share actions appear on every grid. --- */
function hdCardV4(p) {
  const fav = inWishlist(p.id);
  const chips = (p.games || []).slice(0, 3).map(g => '<span class="gchip">' + hdEsc(g) + "</span>").join("");
  const more = p.games && p.games.length > 3 ? '<span class="gchip">+' + (p.games.length - 3) + " more</span>" : "";
  const pl = PLATFORMS[p.platform] || PLATFORMS.pc;
  const heart = '<button class="card-fav' + (fav ? " on" : "") + '" type="button" data-fav="' + hdEsc(p.id) + '" aria-pressed="' + (fav ? "true" : "false") + '" aria-label="Wishlist" title="Save to wishlist">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 5.6a5.2 5.2 0 0 0-7.4 0L12 7l-1.4-1.4a5.2 5.2 0 1 0-7.4 7.4L12 21.5l8.8-8.5a5.2 5.2 0 0 0 0-7.4z"/></svg></button>';
  const ribbon = offPct(p) >= 50 ? '<span class="card-ribbon">' + offPct(p) + "% OFF</span>" : "";
  return '<article class="card"><span class="glare"></span>' + heart + ribbon + artHTML(p) +
    '<div class="card-body">' +
    '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center">' +
    (p.tag ? '<span class="tag">' + hdEsc(p.tag) + "</span>" : '<span class="tag" style="visibility:hidden">·</span>') +
    '<span class="card-cat-pill">' + hdEsc(pl.mono) + " · " + hdEsc(productCategories(p)) + "</span></div>" +
    '<h3 class="card-title"><a href="#/p/' + hdEsc(p.id) + '">' + hdEsc(p.title) + "</a></h3>" +
    (chips || more ? '<div class="gchips">' + chips + more + "</div>" : "") +
    (saveAmt(p) ? '<div class="save">Save ' + money(saveAmt(p)) + " · " + offPct(p) + "% off</div>" : "") +
    stockLine(p) +
    '<div class="card-foot"><span class="price">' + (p.p2 ? '<i class="t2l" style="font-style:normal;font-size:10px;margin-right:5px">FROM</i>' : "") +
    money(p.price) + '<s class="mrp">' + money(p.mrp) + "</s></span>" +
    '<span style="display:flex;gap:6px">' +
    (p.stock > 0
      ? '<button class="btn btn-sm" data-add="' + hdEsc(p.id) + '" aria-label="Add to cart">Add</button>'
      : '<button class="btn btn-sm btn-ghost" data-notify-stock="' + hdEsc(p.id) + '" type="button">Notify</button>') +
    '<button class="btn btn-sm btn-ghost" type="button" data-share="' + hdEsc(p.id) + '" aria-label="Share" style="padding:9px 11px">↗</button>' +
    "</span></div></div></article>";
}
function matchQ(p, q) {
  const s = String(q || "").toLowerCase().trim();
  if (!s) return true;
  return ((p.title || "") + " " + (p.games || []).join(" ") + " " + (p.region || "") + " " + (p.tag || "")).toLowerCase().indexOf(s) > -1;
}

function productCategories(p) {
  if (p.collection === "membership") return "Membership";
  if (p.collection === "mystery") return "Mystery";
  if (p.kind === "subscription") return "Subscription";
  if (p.kind === "wallet") return "Top-up";
  return "Game account";
}
function cardHTML(p) {
  const fav = inWishlist(p.id);
  const chips = (p.games || []).slice(0, 3).map(g => '<span class="gchip">' + hdEsc(g) + "</span>").join("");
  const more = p.games && p.games.length > 3 ? '<span class="gchip">+' + (p.games.length - 3) + " more</span>" : "";
  const pl = PLATFORMS[p.platform] || PLATFORMS.pc;
  const heart = '<button class="card-fav' + (fav ? " on" : "") + '" type="button" data-fav="' + hdEsc(p.id) + '" aria-pressed="' + (fav ? "true" : "false") + '" aria-label="Wishlist" title="Save to wishlist">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 5.6a5.2 5.2 0 0 0-7.4 0L12 7l-1.4-1.4a5.2 5.2 0 1 0-7.4 7.4L12 21.5l8.8-8.5a5.2 5.2 0 0 0 0-7.4z"/></svg></button>';
  return '<article class="card"><span class="glare"></span>' + heart + artHTML(p) +
    '<div class="card-body">' +
    '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center">' +
    (p.tag ? '<span class="tag">' + hdEsc(p.tag) + "</span>" : '<span class="tag" style="visibility:hidden">·</span>') +
    '<span class="card-cat-pill">' + hdEsc(pl.mono) + " · " + hdEsc(productCategories(p)) + "</span></div>" +
    '<h3 class="card-title"><a href="#/p/' + hdEsc(p.id) + '">' + hdEsc(p.title) + "</a></h3>" +
    (chips || more ? '<div class="gchips">' + chips + more + "</div>" : "") +
    (saveAmt(p) ? '<div class="save">Save ' + money(saveAmt(p)) + " · " + offPct(p) + "% off</div>" : "") +
    stockLine(p) +
    '<div class="card-foot"><span class="price">' + (p.p2 ? '<i class="t2l" style="font-style:normal;font-size:10px;margin-right:5px">FROM</i>' : "") +
    money(p.price) + '<s class="mrp">' + money(p.mrp) + "</s></span>" +
    '<span style="display:flex;gap:6px">' +
    (p.stock > 0
      ? '<button class="btn btn-sm" data-add="' + hdEsc(p.id) + '" aria-label="Add to cart">Add</button>'
      : '<button class="btn btn-sm btn-ghost" data-notify-stock="' + hdEsc(p.id) + '" type="button">Notify</button>') +
    '<button class="btn btn-sm btn-ghost" type="button" data-share="' + hdEsc(p.id) + '" aria-label="Share" style="padding:9px 11px">↗</button>' +
    "</span></div></div></article>";
}
function matchQ(p, q) {
  const s = String(q || "").toLowerCase().trim();
  if (!s) return true;
  return ((p.title || "") + " " + (p.games || []).join(" ") + " " + (p.region || "") + " " + (p.tag || "")).toLowerCase().indexOf(s) > -1;
}
function catalogItems(pl) {
  const all = Object.values(state.products).filter(p => p.active !== false &&
    (pl === "subs" ? p.kind === "subscription" : p.platform === pl));
  const q = String(state.catQ || "").trim();
  const kind = catFilter || "all";
  const band = state.catPrice || "all";
  const stockOnly = !!state.catStock;
  const items = all.filter(p => {
    if (kind !== "all" && p.kind !== kind) return false;
    if (stockOnly && !(p.stock > 0)) return false;
    if (band === "u500" && !(p.price < 500)) return false;
    if (band === "500-1000" && !(p.price >= 500 && p.price < 1000)) return false;
    if (band === "1000-2000" && !(p.price >= 1000 && p.price < 2000)) return false;
    if (band === "2000+" && !(p.price >= 2000)) return false;
    return matchQ(p, q);
  });
  const s = state.sortBy || "feat";
  if (s === "lo") items.sort((a, b) => a.price - b.price);
  else if (s === "hi") items.sort((a, b) => b.price - a.price);
  else if (s === "disc") items.sort((a, b) => offPct(b) - offPct(a));
  else if (s === "new") items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  else items.sort((a, b) => (b.featured === true) - (a.featured === true));
  return { all: all, items: items };
}

function vDeals() {
  const all = Object.values(state.products).filter(p => p.active !== false);
  const deep = all.filter(p => offPct(p) >= 80).sort((a, b) => offPct(b) - offPct(a));
  const under500 = all.filter(p => p.price < 500 && p.stock > 0).sort((a, b) => a.price - b.price).slice(0, 8);
  const endings = all.filter(p => p.stock > 0 && p.stock <= 2).slice(0, 8);
  const best = (deep.length ? deep : all.slice().sort((a, b) => offPct(b) - offPct(a))).slice(0, 12);
  const minOrder = couponMinOrder() || 5500;
  const block = (title, sub, list) => list.length
    ? '<section class="sec"><div class="sec-head rv"><div><h2>' + title + '</h2><p class="sub">' + sub + '</p></div></div><div class="grid">' + list.map(hdCardV4).join("") + "</div></section>"
    : "";
  const sortOpts = [["disc", "Biggest discount"], ["lo", "Price: Low → High"], ["hi", "Price: High → Low"], ["feat", "Featured"]]
    .map(o => '<option value="' + o[0] + '"' + ((state.sortBy || "disc") === o[0] ? " selected" : "") + ">" + o[1] + "</option>").join("");
  const shown = state.dealQ ? all.filter(p => matchQ(p, state.dealQ)) : best;
  return '<div class="sec-head rv" style="padding-top:26px;margin-bottom:6px"><div>' +
    '<span class="eyebrow">Automatic 10% off orders ' + money(minOrder) + '+</span><h2>🔥 Crazy deals</h2>' +
    '<p class="sub">Every listing below is live stock at its real catalogue price — no inflated MRPs, no coupon games.</p></div></div>' +
    '<div class="filter-shell rv"><div class="filter-top"><div class="filter-search">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
    '<input class="f" id="dealQ" placeholder="Search deals…" oninput="dealSearchLive(this.value)" value="' + hdEsc(state.dealQ || "") + '"></div>' +
    '<div class="filter-selects"><select class="f" onchange="setSort(this.value)">' + sortOpts + '</select></div></div></div>' +
    '<div id="dealGrid"><div class="grid">' + (shown.map(hdCardV4).join("") || '<p class="sub">Nothing here yet.</p>') + "</div></div>" +
    block("Everything under ₹500", "The cheapest working accounts in the store — perfect for trying us out.", under500) +
    block("Almost gone", "Two units or fewer left at this price.", endings) +
    '<div class="cta-band rv"><div><h2>Want a deal on a specific game?</h2><p>Ask us for the title and platform — we quote live stock in minutes.</p></div>' +
    '<a class="btn" href="' + hdEsc(waUrl("Hi! Best price for this game: ")) + '" target="_blank" rel="noopener">Ask on WhatsApp</a></div>';
}
function dealSearchLive(v) {
  state.dealQ = v;
  clearTimeout(dealSearchLive._t);
  dealSearchLive._t = setTimeout(() => {
    const g = document.getElementById("dealGrid");
    const all = Object.values(state.products).filter(p => p.active !== false);
    const list = (v ? all.filter(p => matchQ(p, v)) : all.slice().sort((a, b) => offPct(b) - offPct(a))).slice(0, 60);
    if (g) g.innerHTML = '<div class="grid">' + (list.map(hdCardV4).join("") ||
      '<p class="sub" style="grid-column:1/-1">No deal matches “' + hdEsc(v) + '”. <a href="' + hdEsc(waUrl("Hi! Do you have " + v + "?")) + '" target="_blank" rel="noopener">Ask us</a>.</p>') + "</div>";
    const i = document.getElementById("dealQ");
    if (i) { i.focus(); try { i.setSelectionRange(i.value.length, i.value.length); } catch (e) {} }
  }, 200);
}

/* wishlist page */
function vWishlist() {
  const items = S.wishlist.map(id => byId(id)).filter(Boolean);
  return '<div class="sec-head rv" style="padding-top:26px;margin-bottom:6px"><div><h2>❤️ Your wishlist</h2><p class="sub">' +
    items.length + " saved game" + (items.length === 1 ? "" : "s") + " · synced to your account when you sign in</p></div>" +
    (items.length ? '<button class="btn btn-ghost btn-sm" data-wish-clear>Clear list</button>' : "") + "</div>" +
    (items.length
      ? '<div class="grid">' + items.map(hdCardV4).join("") + "</div>"
      : '<div class="empty"><b>Nothing saved yet</b>Tap the ♥ on any listing to keep it here — we\'ll alert you when the price drops.<br><a class="btn" href="#/deals">Browse deals</a> <a class="btn btn-ghost" href="#/psn">Browse PS5</a></div>') +
    (items.length ? '<div class="cta-band rv"><div><h2>Set a price alert</h2><p>Open any title and tap “Price alert” — you\'ll be pinged the moment it drops to your target.</p></div><a class="btn btn-ghost" href="#/account?tab=alerts">Manage alerts</a></div>' : "");
}

/* release calendar */
function vReleases() {
  const list = HD_RELEASES.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  const available = list.filter(r => releaseState(r).cls === "now");
  const upcoming = list.filter(r => releaseState(r).cls !== "now");
  const card = r => {
    const st = releaseState(r);
    const key = r.title.toLowerCase().split(":")[0].trim();
    const match = Object.values(state.products).find(p => (p.games || []).some(g => String(g).toLowerCase().indexOf(key) > -1));
    return '<article class="rel-card rv"><div class="rel-art">' +
      (r.img ? '<img src="' + hdEsc(safeImg(r.img)) + '" alt="" loading="lazy" onerror="this.remove()">' : "") +
      '<span class="rel-date-badge">' + hdEsc(fmtDate(r.date)) + "</span>" +
      '<span class="rel-status ' + st.cls + '">' + hdEsc(st.label) + "</span></div>" +
      '<div class="rel-body"><h3>' + hdEsc(r.title) + "</h3>" +
      '<div class="rel-plats">' + r.plats.map(p => '<span class="rel-plat-chip">' + hdEsc(p) + "</span>").join("") + "</div>" +
      '<p class="sub" style="margin:0;flex:1">' + hdEsc(r.note) + "</p>" +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
      (match ? '<a class="btn btn-sm" href="#/p/' + hdEsc(match.id) + '">Buy ' + money(match.price) + "</a>"
             : '<a class="btn btn-sm" href="' + hdEsc(waUrl("Hi! Preorder/availability for " + r.title + "?")) + '" target="_blank" rel="noopener">Ask for preorder</a>') +
      '<button class="btn btn-sm btn-ghost" data-share-release="' + hdEsc(r.title) + '">↗ Share</button>' +
      "</div></div></article>";
  };
  return '<div class="sec-head rv" style="padding-top:26px;margin-bottom:6px"><div>' +
    '<span class="eyebrow">Updated ' + new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) + '</span>' +
    '<h2>📅 Game release calendar</h2><p class="sub">Every major PS5, Xbox and PC release — with live store pricing where we already stock it.</p></div>' +
    '<button class="btn btn-ghost btn-sm" data-remind-releases>🔔 Remind me</button></div>' +
    (upcoming.length ? '<section class="sec"><div class="sec-head rv"><div><h2>Coming up</h2></div></div><div class="rel-grid">' + upcoming.map(card).join("") + "</div></section>" : "") +
    (available.length ? '<section class="sec"><div class="sec-head rv"><div><h2>Out now</h2></div></div><div class="rel-grid">' + available.map(card).join("") + "</div></section>" : "") +
    '<div class="cta-band rv"><div><h2>Get release alerts</h2><p>Enable notifications and we\'ll ping you on launch day with the live price.</p></div><button class="btn" data-ask-push>Turn on alerts</button></div>';
}

/* 5-step order tracking */
const HD_STEPS = [
  ["pending", "Order placed"],
  ["paid", "Payment verified"],
  ["processing", "Credentials prepared"],
  ["delivered", "Delivered on WhatsApp"],
  ["complete", "Setup confirmed"]
];
function stepIndex(status) {
  const st = String(status || "pending").toLowerCase();
  if (st === "cancelled" || st === "refunded") return -1;
  const i = HD_STEPS.findIndex(s => s[0] === st);
  if (i > -1) return i;
  if (st === "confirmed") return 4;
  return 0;
}
function orderTimeline(order) {
  const i = stepIndex(order.status);
  const st = String(order.status || "pending").toLowerCase();
  if (i < 0) return '<div class="err" style="margin:6px 0 0">This order was ' + hdEsc(st) + ". Questions? Message support with " + hdEsc(order.oid || "") + ".</div>";
  return '<div class="ord-stepper">' + HD_STEPS.map((s, k) => {
    const cls = k < i ? "done" : k === i ? "curr" : "";
    return '<div class="ord-st-node ' + cls + '"><i></i><span>' + hdEsc(s[1]) + "</span></div>";
  }).join("") + "</div>";
}
function orderWaMessage(o) {
  return "Hi " + CONFIG.brand + "! Order " + (o.oid || "") + " — status update please.\nTotal: " + money(o.total) +
    "\nItems:\n" + (Array.isArray(o.items) ? o.items.join("\n") : "");
}
function orderCard(o, detailed) {
  const status = String(o.status || "pending").toLowerCase();
  const items = Array.isArray(o.items) ? o.items : [];
  return '<div class="ord-history-card" style="margin-top:12px">' +
    '<div class="ord-top" style="display:flex;justify-content:space-between;gap:8px;align-items:center">' +
    '<b style="font-family:var(--mono)">' + hdEsc(o.oid || "") + "</b>" + ordPill(status) + "</div>" +
    '<div class="sub" style="font-size:12px">' + (o.ts ? new Date(o.ts).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "") + "</div>" +
    orderTimeline(o) +
    (items.length ? '<div class="ord-it">' + items.map(l => "<div>• " + hdEsc(l) + "</div>").join("") + "</div>" : "") +
    '<div class="ord-top" style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:4px">' +
    '<span class="ord-amt" style="font-family:var(--mono);font-weight:800;color:var(--gold)">' + money(o.total) + "</span>" +
    '<span class="rowbtns" style="display:flex;gap:6px;flex-wrap:wrap">' +
    (detailed ? '<button class="btn btn-sm btn-ghost" data-invoice-oid="' + hdEsc(o.oid || "") + '">🧾 Invoice</button>' : "") +
    '<a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="' + hdEsc(waUrl(orderWaMessage(o))) + '">WhatsApp</a>' +
    "</span></div></div>";
}
/* quick category strip appended under the hero by the store's vHome */
function homeStrip() {
  const all = Object.values(state.products).filter(p => p.active !== false);
  const deep = all.filter(p => offPct(p) >= 80).length;
  return '<div class="quick-cats">' +
    '<a class="qcat hot" href="#/deals">🔥 <b>' + deep + "</b> deep deals</a>" +
    '<a class="qcat" href="#/psn">🕹 PS5 · <b>' + all.filter(p => p.platform === "psn").length + "</b></a>" +
    '<a class="qcat" href="#/xbox">🎮 Xbox · <b>' + all.filter(p => p.platform === "xbox").length + "</b></a>" +
    '<a class="qcat" href="#/pc">💻 PC · <b>' + all.filter(p => p.platform === "pc").length + "</b></a>" +
    '<a class="qcat" href="#/membership">💛 Membership</a>' +
    '<a class="qcat" href="#/releases">📅 Release calendar</a>' +
    '<a class="qcat" href="#/wishlist">♥ Wishlist</a></div>';
}

/* ------------------------------------------------------------------ */
/* 13 · authentication helpers (friendly errors, reset, Google)       */
/* ------------------------------------------------------------------ */
function hdAuthError(err) {
  const code = String((err && (err.code || err.message)) || "");
  const map = {
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/missing-password": "Please enter your password.",
    "auth/wrong-password": "Wrong email or password. Try again, or use “Forgot password”.",
    "auth/invalid-credential": "Wrong email or password. Try again, or use “Forgot password”.",
    "auth/invalid-login-credentials": "Wrong email or password. Try again, or use “Forgot password”.",
    "auth/user-not-found": "No account with that email yet — tap “Create account”.",
    "auth/email-already-in-use": "That email already has an account — sign in instead.",
    "auth/weak-password": "Use at least 6 characters for your password.",
    "auth/too-many-requests": "Too many attempts. Wait a couple of minutes, or reset your password.",
    "auth/network-request-failed": "Network problem — check your connection and try again.",
    "auth/operation-not-allowed": "This sign-in method isn't enabled yet. Use email + password, or WhatsApp us.",
    "auth/popup-blocked": "Your browser blocked the Google popup — allow popups, or sign in with email.",
    "auth/popup-closed-by-user": "Google sign-in was closed before it finished.",
    "auth/cancelled-popup-request": "Google sign-in was interrupted — try once more.",
    "auth/unauthorized-domain": "Google sign-in isn't authorised for this domain yet — use email + password.",
    "auth/requires-recent-login": "For security, sign out and back in, then retry."
  };
  if (map[code]) return map[code];
  const msg = String((err && err.message) || code || "Something went wrong");
  if (/password/i.test(msg) && /invalid/i.test(msg)) return "Wrong email or password.";
  return msg.replace(/^Firebase:\s*/, "").replace(/\s*\(auth\/[^)]+\)\.?$/, "").slice(0, 140) || "Something went wrong — try again.";
}
function authMsg(html) {
  const el = document.getElementById("auMsg") || document.getElementById("adMsg");
  if (el) el.innerHTML = html || "";
}
function setAuthBusy(on) {
  document.querySelectorAll("[data-hd-auth]").forEach(b => { b.disabled = !!on; });
}
function pwToggle(id) {
  const inp = document.getElementById(id);
  if (!inp) return;
  inp.type = inp.type === "password" ? "text" : "password";
  const btn = document.querySelector('[data-pw-toggle="' + id + '"]');
  if (btn) btn.textContent = inp.type === "password" ? "Show" : "Hide";
}
async function hdSignIn() {
  if (!state.fbReady || !window.firebase) { authMsg('<div class="err">Sign-in is still starting up — refresh in a second.</div>'); return; }
  const email = String((document.getElementById("au-email") || {}).value || "").trim();
  const pass = String((document.getElementById("au-pass") || {}).value || "");
  if (!email || !pass) { authMsg('<div class="err">Enter your email and password.</div>'); return; }
  authMsg("");
  setAuthBusy(true);
  try {
    await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    await firebase.auth().signInWithEmailAndPassword(email, pass);
    toast("Welcome back 👋");
  } catch (err) {
    authMsg('<div class="err">' + hdEsc(hdAuthError(err)) + "</div>");
  }
  setAuthBusy(false);
}
async function hdSignUp() {
  if (!state.fbReady || !window.firebase) { authMsg('<div class="err">Sign-up is still starting up — refresh in a second.</div>'); return; }
  const name = String((document.getElementById("au-name") || {}).value || "").trim();
  const email = String((document.getElementById("au-email") || {}).value || "").trim();
  const pass = String((document.getElementById("au-pass") || {}).value || "");
  const optIn = !!(document.getElementById("au-optin") || {}).checked;
  if (!email || !pass) { authMsg('<div class="err">Enter your email and a password (6+ characters).</div>'); return; }
  if (pass.length < 6) { authMsg('<div class="err">Use at least 6 characters for your password.</div>'); return; }
  authMsg("");
  setAuthBusy(true);
  try {
    await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    const cred = await firebase.auth().createUserWithEmailAndPassword(email, pass);
    if (cred.user && name) { try { await cred.user.updateProfile({ displayName: name }); } catch (e) {} }
    try {
      await firebase.firestore().collection("users").doc(cred.user.uid).set({
        name: name || "", email: email, optIn: !!optIn, wishlist: S.wishlist.slice(0, 400), pushPrefs: Object.assign({}, P()), createdAt: nowTs(), updatedAt: nowTs(), tier: "Free"
      }, { merge: true });
    } catch (e) { console.warn("[auth] profile write", e && e.message); }
    toast("Account created 🎉");
    try { await hdTrack("sign_up", { method: "email" }); } catch (e) {}
  } catch (err) {
    authMsg('<div class="err">' + hdEsc(hdAuthError(err)) + "</div>");
  }
  setAuthBusy(false);
}
async function hdForgot() {
  const email = String(((document.getElementById("au-email") || {}).value || "").trim() ||
                       ((document.getElementById("ad-email") || {}).value || "").trim());
  if (!state.fbReady || !window.firebase) { authMsg('<div class="err">Password reset needs the store connection — try again in a moment.</div>'); return; }
  if (!email) { authMsg('<div class="err">Type your email first, then tap “Forgot password”.</div>'); return; }
  try {
    await firebase.auth().sendPasswordResetEmail(email);
    authMsg('<div class="ok-note">Reset link sent to <b>' + hdEsc(email) + "</b> — check spam too. The link works for one hour.</div>");
  } catch (err) {
    authMsg('<div class="err">' + hdEsc(hdAuthError(err)) + "</div>");
  }
}
async function hdGoogle() {
  if (!state.fbReady || !window.firebase) { authMsg('<div class="err">Google sign-in is still starting up — refresh in a second.</div>'); return; }
  authMsg("");
  setAuthBusy(true);
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    const res = await firebase.auth().signInWithPopup(provider);
    if (res.user) {
      try {
        await firebase.firestore().collection("users").doc(res.user.uid).set({
          name: res.user.displayName || "", email: res.user.email || "", wishlist: S.wishlist.slice(0, 400), updatedAt: nowTs()
        }, { merge: true });
      } catch (e) {}
    }
    toast("Signed in with Google");
  } catch (err) {
    authMsg('<div class="err">' + hdEsc(hdAuthError(err)) + '</div><p class="hint">You can always sign in with the email + password you registered.</p>');
  }
  setAuthBusy(false);
}
/* ---- loyalty maths (mirrors the store's own rules) ---------------- */
function pointsToRupees(pts) { return Math.floor(Number(pts || 0) / 100) * 50; }
function loyaltyAvailable() {
  const L = state.loyalty || (state.user && HD.profile && HD.profile.loyalty) || {};
  const n = Number(L.available != null ? L.available : 0);
  return isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
/* ---- promo codes stored in settings.store.promos ------------------ */
function promosList() {
  const raw = (state.settings && state.settings.promos) || [];
  const list = Array.isArray(raw) ? raw : [];
  return list.filter(p => p && p.code).map(p => ({
    code: String(p.code).toUpperCase(),
    pct: Number(p.pct || 0),
    off: Number(p.off || 0),
    min: Number(p.min || 0),
    on: p.on !== false
  }));
}
function promoOffFor(sub) {
  const p = state.promo;
  if (!p) return 0;
  const live = promosList().find(x => x.code === String(p.code || "").toUpperCase());
  const rule = live || p;
  if (rule.on === false) return 0;
  if (Number(rule.min || 0) && sub < Number(rule.min)) return 0;
  let off = 0;
  if (Number(rule.pct || 0)) off = Math.round(sub * Number(rule.pct) / 100);
  else if (Number(rule.off || 0)) off = Number(rule.off);
  return Math.max(0, Math.min(off, sub));
}
function applyPromo() {
  const code = String(((document.getElementById("promoCode") || {}).value || "")).trim().toUpperCase();
  const msg = document.getElementById("promoMsg");
  if (!code) { if (msg) msg.innerHTML = '<div class="err">Enter a promo code first.</div>'; return; }
  const rule = promosList().find(x => x.code === code);
  if (!rule || rule.on === false) {
    if (msg) msg.innerHTML = '<div class="err">That code is not active right now.</div>';
    state.promo = null;
    return;
  }
  state.promo = rule;
  if (msg) msg.innerHTML = '<div class="ok-note">Applied ' + hdEsc(code) + " — " +
    (rule.pct ? rule.pct + "% off" : money(rule.off) + " off") +
    (rule.min ? " on orders over " + money(rule.min) : "") + ".</div>";
  toast("Promo applied 🎟");
  route();
}
/* ---- misc that the store exposes ---------------------------------- */
function hdTrack(event, params) {
  try {
    if (typeof gtag === "function") gtag("event", event, Object.assign({ send_to: ((state.settings && state.settings.gaId) || "G-EG9CFD4R0Q") }, params || {}));
  } catch (e) {}
}

/* ------------------------------------------------------------------ */
/* 14 · customer account dashboard                                    */
/* ------------------------------------------------------------------ */
function acctTab() {
  const h = location.hash;
  const m = h.match(/[?&]tab=([a-z]+)/i);
  const t = (m && m[1]) || state.acctTab || "orders";
  return ["orders", "rewards", "alerts", "profile"].indexOf(t) > -1 ? t : "orders";
}
function authLoadingSkeleton() {
  return '<div class="sec-head" style="padding-top:26px;margin-bottom:10px"><div><h2>Your account</h2><p class="sub">Restoring your session…</p></div></div>' +
    '<div class="panel" style="max-width:520px"><div class="skel skel-line" style="width:55%"></div>' +
    '<div class="skel skel-line" style="width:80%"></div><div class="skel skel-block"></div>' +
    '<div class="skel skel-line" style="width:40%"></div></div>';
}
function authPanel() {
  const up = authMode === "up";
  return '<div class="sec-head" style="padding-top:26px;margin-bottom:10px"><div><h2>' + (up ? "Create your account" : "Sign in") + '</h2>' +
    '<p class="sub">Order history, invoices, Heaven Points, wishlist &amp; price alerts in one place.</p></div></div>' +
    '<div class="panel" style="max-width:480px">' +
    '<div class="filters" style="margin:0 0 14px"><button class="fbtn' + (!up ? " on" : "") + '" data-auth-mode="in">Sign in</button>' +
    '<button class="fbtn' + (up ? " on" : "") + '" data-auth-mode="up">Create account</button></div>' +
    (up ? '<label class="pm-l" for="au-name">Your name</label><input class="f" id="au-name" placeholder="Aditya" autocomplete="name">' : "") +
    '<label class="pm-l" for="au-email">Email</label><input class="f" id="au-email" type="email" autocomplete="email" inputmode="email" placeholder="you@gmail.com">' +
    '<label class="pm-l" for="au-pass">Password</label><div class="pw-wrap"><input class="f" id="au-pass" type="password" autocomplete="' + (up ? "new-password" : "current-password") + '" placeholder="••••••••">' +
    '<button class="pw-tog" type="button" data-pw-toggle="au-pass">Show</button></div>' +
    (up ? '<label style="display:flex;gap:8px;align-items:center;margin-top:12px;font-size:13px"><input type="checkbox" id="au-optin" checked> Ping me about new releases &amp; offers</label>' : "") +
    '<div class="paybtns" style="margin-top:14px"><button class="btn btn-block" data-hd-auth="' + (up ? "up" : "in") + '" data-hd-' + (up ? "signup" : "signin") + ">" + (up ? "Create my account" : "Sign in") + "</button>" +
    '<button class="btn btn-ghost btn-block" type="button" data-hd-google>Continue with Google</button></div>' +
    '<div id="auMsg" class="err"></div>' +
    '<div style="display:flex;justify-content:space-between;gap:10px;margin-top:10px;flex-wrap:wrap">' +
    '<button class="rm" type="button" data-hd-forgot>Forgot password?</button>' +
    '<a class="rm" href="' + hdEsc(waUrl("Hi! I need help signing in to my HeavenDigital account.")) + '" target="_blank" rel="noopener">Can\'t sign in? WhatsApp us</a></div>' +
    '<p class="hint">No spam, no password sharing. We never ask for your OTP — anyone who does is not us. Sessions stay signed in on this device.</p></div>';
}
function vAccount() {
  if (!state.fbReady) {
    if (state.fbLoading) return authLoadingSkeleton();
    /* Offline / SDK blocked: the form still works for guests (local order history,
       wishlist and alerts); sign-in explains what is missing. */
    return authPanel(acctTab());
  }
  if (!state.user) return authPanel(acctTab());
  const tab = acctTab();
  const nm = state.user.displayName || (state.user.email || "").split("@")[0] || "gamer";
  setTimeout(loadAccountData, 30);
  const tabs = [["orders", "📦 Orders"], ["rewards", "💛 Rewards"], ["alerts", "🔔 Alerts"], ["profile", "⚙️ Profile"]]
    .map(t => '<button class="tab-btn' + (tab === t[0] ? " on" : "") + '" data-acct-tab="' + t[0] + '">' + t[1] + "</button>").join("");
  return '<div class="sec-head" style="padding-top:26px;margin-bottom:6px"><div><h2>Hey, ' + hdEsc(nm) + " 👋</h2>" +
    '<p class="sub">' + hdEsc(state.user.email || "") + " · " + (state.user.emailVerified ? "verified email" : "email not verified yet") + "</p></div>" +
    '<button class="btn btn-ghost btn-sm" data-signout>Sign out</button></div>' +
    '<div class="acct-tabs">' + tabs + "</div>" +
    '<div id="acctBody">' + acctSkeleton() + "</div>";
}
function acctSkeleton() {
  return '<div class="panel"><div class="skel skel-line" style="width:45%"></div><div class="skel skel-block"></div><div class="skel skel-line" style="width:70%"></div></div>';
}
function acctOrdersHtml() {
  const orders = (state.myOrders || []).slice();
  const localOnly = localOrders().filter(l => !orders.some(o => o.oid === l.oid));
  const all = orders.concat(localOnly);
  if (!all.length) {
    return '<div class="empty" style="padding:34px 0"><b>No orders yet</b>Your orders appear here automatically once you check out — even as a guest on this device.<br>' +
      '<a class="btn" href="#/deals">Browse deals</a> <a class="btn btn-ghost" href="#/track">Track an order ID</a></div>';
  }
  return all.map(o => orderCard(o, true)).join("");
}
function acctRewardsHtml() {
  const L = state.loyalty || { earned: 0, used: 0, available: 0, tier: "Free", multiplier: 1 };
  const value = pointsToRupees(L.available);
  return '<div class="panel loyalty-panel"><div class="points-orb">' + L.available + "<small>POINTS</small></div>" +
    '<div><span class="eyebrow">' + hdEsc(L.tier) + " TIER" + (L.multiplier > 1 ? " · " + L.multiplier + "× ACTIVE" : "") + "</span>" +
    '<h3 style="margin:5px 0 6px">Worth up to ' + money(value) + " on your next order</h3>" +
    '<p class="sub" style="margin:0 0 12px">Earn 1 point per ₹10 on completed orders · 100 points = ₹50 off · redeem from 100 points · max 20% of an order.</p>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
    (L.available >= 100
      ? '<a class="btn btn-sm" href="#/cart">Redeem at checkout</a><button class="btn btn-sm btn-ghost" data-redeem-points>Claim via WhatsApp</button>'
      : '<a class="btn btn-sm" href="#/membership">Earn faster with a membership</a>') +
    "</div></div></div>" +
    '<div class="stats"><div class="stat"><b>' + L.earned + "</b><span>Points earned</span></div>" +
    '<div class="stat"><b>' + L.used + "</b><span>Points used</span></div>" +
    '<div class="stat"><b>' + L.available + "</b><span>Available now</span></div>" +
    '<div class="stat"><b>' + (L.tier || "Free") + "</b><span>Current tier</span></div></div>" +
    referBoxHtml() +
    '<div class="panel" style="margin-top:16px"><h3 style="margin-top:0">How Heaven Points work</h3>' +
    '<div class="dlv">' + CHECK + " 1 point for every ₹10 of a delivered order</div>" +
    '<div class="dlv">' + CHECK + " Silver 2× · Gold 3× · Platinum 5× while a plan is active</div>" +
    '<div class="dlv">' + CHECK + " 100 points = ₹50 off, up to 20% of any order, redeemed in the cart</div>" +
    '<div class="dlv">' + CHECK + " Cancelled or refunded orders earn nothing; points have no cash value</div></div>";
}
function referBoxHtml() {
  const u = (HD.profile || {}) || {};
  if (!u.refCode) return '<div class="panel" style="margin-top:16px"><h3 style="margin-top:0">🎁 Give ₹50, get ₹50</h3>' +
    '<p class="sub" style="margin:0">Your personal code appears here in a moment — it\'s created automatically the first time you open this page.</p></div>';
  const link = storeUrl("#/?ref=" + encodeURIComponent(u.refCode));
  const msg = "🎮 ₹50 off your first game on HeavenDigital with my code " + u.refCode + " — " + link;
  return '<div class="panel" style="margin-top:16px"><h3 style="margin-top:0">🎁 Give ₹50, get ₹50</h3>' +
    '<label class="pm-l">Your referral code</label>' +
    '<div class="couprow"><input class="f" id="myRef" readonly value="' + hdEsc(u.refCode) + '">' +
    '<button class="btn btn-sm" data-copy-ref>Copy</button></div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
    '<a class="btn btn-sm" target="_blank" rel="noopener" href="' + hdEsc(waUrl(msg)) + '">' + WAICON + " Share on WhatsApp</a>" +
    '<button class="btn btn-sm btn-ghost" data-share-ref="' + hdEsc(u.refCode) + '">📤 Share link</button></div>' +
    '<p class="hint">Friends get <b>₹50 off</b> their first order with your code. You earn <b>₹50</b> per completed order as UPI cashback. Earned so far: <b class="t2l">' + money(u.earned || 0) +
    "</b> (" + (u.referrals || 0) + " referral" + ((u.referrals || 0) === 1 ? "" : "s") + ").</p></div>";
}
function acctAlertsHtml() {
  const rows = S.priceAlerts.map(a => {
    const p = byId(a.productId) || {};
    const cur = Number(p.price || a.startPrice || 0);
    const hit = cur > 0 && cur <= Number(a.targetPrice || 0);
    const gap = cur > 0 ? cur - Number(a.targetPrice || 0) : 0;
    return '<div class="ord-history-card"><div class="ord-top" style="display:flex;justify-content:space-between;gap:8px;align-items:center">' +
      '<b><a href="#/p/' + hdEsc(a.productId) + '">' + hdEsc(a.title || (p.title || "Listing")) + "</a></b>" +
      (hit ? '<span class="pill on">TARGET HIT</span>' : '<span class="pill pay">WATCHING</span>') + "</div>" +
      '<div class="sub" style="font-size:12.5px">Current ' + money(cur) + " · your target " + money(a.targetPrice) +
      (hit ? " · 🎉 below your target — grab it" : gap > 0 ? " · " + money(gap) + " to go" : "") + "</div>" +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
      '<a class="btn btn-sm" href="#/p/' + hdEsc(a.productId) + '">View listing</a>' +
      '<button class="btn btn-sm btn-ghost" data-alert-remove="' + hdEsc(a.productId) + '">Remove alert</button></div></div>';
  }).join("");
  const wishRows = S.wishlist.map(id => byId(id)).filter(Boolean);
  return '<div class="panel"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">' +
    '<div><h3 style="margin:0">Price alerts</h3><p class="sub" style="margin:2px 0 0">We watch the price and notify you the moment it drops to your target.</p></div>' +
    '<button class="btn btn-sm btn-ghost" data-alert-for-wishlist>+ Add from wishlist</button></div>' +
    '<div id="alertList" style="margin-top:12px">' + (rows || '<p class="sub" style="margin:0">No alerts yet — open any listing and tap the price-alert button.</p>') + "</div></div>" +
    '<div class="panel" style="margin-top:16px"><h3 style="margin-top:0">🔔 Notification preferences</h3>' +
    '<p class="sub" style="margin-top:0">Choose what we ping you about. Applies to push (when enabled) and the in-app 🔔 centre.</p>' +
    '<div class="push-master" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;border:1px solid var(--line);border-radius:12px;margin-bottom:10px">' +
    '<div><b style="font-size:14px">Push notifications</b><br><span class="sub" style="font-size:12px">' + (P().enabled ? "Enabled on this device" : "Off — tap to enable") + "</span></div>" +
    '<label class="stock-toggle" style="margin:0"><input type="checkbox" data-push-master ' + (P().enabled ? "checked" : "") + ' onchange="hdPushMaster(this.checked)"> Enable</label></div>' +
    [["new_releases", "New releases", "Day-one drops & preorders"],
     ["offers", "Offers & sales", "Automatic discount windows"],
     ["price_drops", "Price drops", "Wishlist & price alerts"],
     ["order_updates", "Order updates", "Payment verified & delivered"]]
      .map(t => '<label class="consent-item"><input type="checkbox" data-push-toggle="' + t[0] + '" onchange="hdPushPref(\'' + t[0] + '\',this.checked)"> <span><b>' + t[1] + "</b><i>" + t[2] + "</i></span></label>").join("") +
    '<p class="hint">On iPhone, push needs the app installed to the home screen (iOS 16.4+). Everything still shows in the in-app 🔔 centre.</p></div>' +
    '<div class="panel" style="margin-top:16px"><h3 style="margin-top:0">❤️ Wishlist (' + wishRows.length + ")</h3>" +
    (wishRows.length ? '<div class="grid">' + wishRows.slice(0, 8).map(hdCardV4).join("") + "</div>" +
      (wishRows.length > 8 ? '<a class="btn btn-ghost btn-sm" href="#/wishlist" style="margin-top:10px">See all ' + wishRows.length + "</a>" : "")
      : '<p class="sub" style="margin:0">Tap the ♥ on any listing to save it here.</p>') + "</div>";
}
function acctProfileHtml() {
  const u = HD.profile || {};
  return '<div class="panel" style="max-width:560px"><h3 style="margin-top:0">Contact details</h3>' +
    '<label class="pm-l" for="ac-wa">WhatsApp number (for delivery &amp; alerts)</label>' +
    '<input class="f" id="ac-wa" inputmode="tel" placeholder="919876543210" value="' + hdEsc(u.wa || "") + '">' +
    '<label class="pm-l" for="ac-name">Display name</label>' +
    '<input class="f" id="ac-name" placeholder="Your name" value="' + hdEsc(u.name || (state.user && state.user.displayName) || "") + '">' +
    '<div id="acProfileMsg"></div>' +
    '<div class="paybtns" style="margin-top:12px"><button class="btn btn-sm" data-acct-save-profile>Save details</button>' +
    '<button class="btn btn-sm btn-ghost" data-hd-verify-email>Verify email</button></div>' +
    '<p class="hint">Delivery always happens on WhatsApp — keep this number reachable. We never ask for your password or OTP.</p></div>' +
    '<div class="panel" style="max-width:560px;margin-top:16px"><h3 style="margin-top:0">Security</h3>' +
    '<div class="dlv">' + CHECK + " Signed in as <b>" + hdEsc(state.user.email || "") + "</b></div>" +
    '<div class="dlv">' + CHECK + " Session kept on this device (you stay signed in)</div>" +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
    '<button class="btn btn-sm btn-ghost" data-hd-reset-pass>Change password</button>' +
    '<button class="btn btn-sm btn-ghost" data-signout>Sign out</button></div></div>' +
    '<div class="panel" style="max-width:560px;margin-top:16px"><h3 style="margin-top:0">Your data</h3>' +
    '<p class="sub" style="margin-top:0">We keep only what\'s needed to deliver orders and honour the warranty. You can request a copy or deletion any time.</p>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
    '<a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="' + hdEsc(waUrl("Hi! Please send me a copy of my HeavenDigital account data (" + (state.user.email || "") + ").")) + '">Request my data</a>' +
    '<a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="' + hdEsc(waUrl("Hi! Please delete my HeavenDigital account data (" + (state.user.email || "") + ").")) + '">Request deletion</a></div>' +
    '<p class="hint">See the <a href="#/privacy">privacy policy</a> for what we store and why.</p></div>';
}
function renderAccountBody() {
  const box = document.getElementById("acctBody");
  if (!box) return;
  const tab = acctTab();
  if (!state.acctLoaded) { box.innerHTML = acctSkeleton(); return; }
  if (tab === "orders") box.innerHTML = acctOrdersHtml();
  else if (tab === "rewards") box.innerHTML = acctRewardsHtml();
  else if (tab === "alerts") { box.innerHTML = acctAlertsHtml(); paintPushToggles(); }
  else box.innerHTML = acctProfileHtml();
}
async function loadAccountData(force) {
  if (!(state.user && state.fbReady && window.firebase)) return;
  if (state.acctLoading) return;
  if (state.acctLoaded && !force) { renderAccountBody(); return; }
  state.acctLoading = true;
  try {
    const db = firebase.firestore();
    const res = await Promise.all([
      db.collection("orders").where("uid", "==", state.user.uid).get().catch(() => null),
      db.collection("users").doc(state.user.uid).get().catch(() => null)
    ]);
    const orders = res[0] ? res[0].docs.map(d => Object.assign({ oid: d.id }, d.data() || {}))
      .sort((a, b) => (b.ts || 0) - (a.ts || 0)) : [];
    orders.forEach(rememberLocalOrder);
    state.myOrders = orders;
    const profile = res[1] && res[1].exists ? res[1].data() : {};
    HD.profile = Object.assign({}, HD.profile || {}, profile);
    state.loyalty = loyaltyFromOrders(orders, profile.pointsRedeemed || 0);
    state.acctLoaded = true;
    renderAccountBody();
  } catch (err) {
    console.warn("[account] load failed", err);
    state.acctLoaded = true;
    renderAccountBody();
  }
  state.acctLoading = false;
}
function hdPushMaster(on) {
  if (on) enablePush(false).then(() => { renderAccountBody(); });
  else { disablePush(); renderAccountBody(); }
}
function hdPushPref(topic, on) {
  P()[topic] = !!on;
  lsSet(LS.prefs, P());
  if (state.user && state.fbReady) {
    firebase.firestore().collection("users").doc(state.user.uid)
      .set({ pushPrefs: Object.assign({}, P(), { enabled: !!P().enabled || !!on }), updatedAt: nowTs() }, { merge: true })
      .catch(() => {});
  }
  toast(on ? "Alerts on for " + topic.replace("_", " ") : "Alerts off for " + topic.replace("_", " "));
}
/* ------------------------------------------------------------------ */
/* 15 · secure checkout — canonical prices, UPI QR, UTR, points, promo */
/* ------------------------------------------------------------------ */
function canonicalCart() {
  /* Never trust a stale price: rebuild every line from the live catalog. */
  const lines = [];
  let sub = 0;
  let pruned = [];
  const c = CORE.getCart();            /* the proxy below only sees existing keys */
  Object.keys(c).forEach(k => {
    const [id, opt] = splitKey(k);
    const p = byId(id);
    if (!p || p.active === false) { pruned.push(id); return; }
    const qty = Math.max(1, Math.min(10, Number(c[k]) || 1));
    const unit = priceOf(p, opt);
    sub += unit * qty;
    lines.push({
      key: k, id: id, qty: qty, unit: unit,
      label: qty + "× " + p.title + (opt === "p2" ? " (" + optLabel(p, true) + ")" : "") + " — " + money(unit * qty)
    });
  });
  return { lines: lines, sub: sub, pruned: pruned };
}
function checkoutBreakdown(sub) {
  const autoPct = autoDiscountPct();
  const autoDisc = Math.round(sub * autoPct / 100);
  const refOff = state.refBy ? Math.min(50, Math.max(0, sub - autoDisc)) : 0;
  const promoOff = Math.min(promoOffFor(sub), Math.max(0, sub - autoDisc - refOff));
  const after = Math.max(0, sub - autoDisc - refOff - promoOff);
  const maxPointsValue = Math.floor(after * 0.2);
  let pts = Math.floor(Math.min(Number(state.pointsRedeem || 0), loyaltyAvailable()) / 100) * 100;
  let pointsOff = Math.min(pointsToRupees(pts), maxPointsValue);
  if (pointsOff < pointsToRupees(pts)) pts = 0, pointsOff = 0;
  return { autoPct, autoDisc, refOff, promoOff, points: pts, pointsOff, maxPointsValue, total: Math.round(Math.max(0, after - pointsOff)) };
}
function openCheckout() {
  const canon = canonicalCart();
  if (!canon.lines.length) { toast("Your cart is empty"); location.hash = "#/cart"; return; }
  if (canon.pruned.length) toast("Some items are no longer available and were removed");
  const b = checkoutBreakdown(canon.sub);
  const oid = "HD-" + Math.random().toString(36).slice(2, 7).toUpperCase();
  const upi = upiString(b.total, oid);
  const saved = savedCheckoutContact();
  const defaultEmail = (state.user && state.user.email) || saved.email || "";
  const defaultName = saved.name || (state.user && state.user.displayName) || "";
  const defaultWa = saved.wa || (HD.profile && HD.profile.wa) || "";
  state.checkout = {
    oid: oid, lines: canon.lines.map(l => l.label), total: b.total, sub: canon.sub,
    disc: b.autoDisc, refOff: b.refOff, refBy: state.refBy || null,
    promoCode: state.promo ? state.promo.code : null, promoOff: b.promoOff,
    pointsRequested: b.points, pointsOff: b.pointsOff,
    coupon: null, upi: upi, saved: false, utr: ""
  };
  const rows = canon.lines.map(l => '<div class="sumline"><span>' + hdEsc(l.label) + "</span><span>" + money(l.unit * l.qty) + "</span></div>").join("");
  const qr = upiQrSvg(b.total, oid, 132);
  openHdModal("Secure checkout", `
    <div class="oid" style="color:var(--mut);font-family:var(--mono);font-size:13px">Order ${hdEsc(oid)} · ${new Date().toLocaleDateString("en-IN")}</div>
    <div style="margin-top:12px">${rows}
      ${b.autoDisc ? '<div class="sumline"><span>' + b.autoPct + "% off (orders " + money(couponMinOrder() || 5500) + '+)</span><span>− ' + money(b.autoDisc) + "</span></div>" : ""}
      ${b.promoOff ? '<div class="sumline"><span>Promo ' + hdEsc(state.promo.code) + "</span><span>− " + money(b.promoOff) + "</span></div>" : ""}
      ${b.refOff ? '<div class="sumline"><span>Referral ' + hdEsc(state.refBy) + "</span><span>− " + money(b.refOff) + "</span></div>" : ""}
      ${b.pointsOff ? '<div class="sumline"><span>Heaven Points (' + b.points + " pts)</span><span>− " + money(b.pointsOff) + "</span></div>" : ""}
      <div class="sumline total"><span>Total payable</span><span>${money(b.total)}</span></div>
    </div>
    <div class="tstrip"><span>✓ 2-year warranty</span><span>✓ Guided setup till you play</span><span>✓ Saved to owner dashboard</span></div>
    <div class="panel" style="background:rgba(255,255,255,.025);margin:12px 0;padding:12px">
      <h4 style="margin:0 0 8px">1 · Buyer details</h4>
      <div class="form2">
        <div><label for="co-name">Name</label><input class="f" id="co-name" autocomplete="name" placeholder="Your name" value="${hdEsc(defaultName)}"></div>
        <div><label for="co-wa">WhatsApp number</label><input class="f" id="co-wa" inputmode="tel" autocomplete="tel" placeholder="919876543210" value="${hdEsc(defaultWa)}"></div>
        <div><label for="co-email">Email <span class="hint">optional</span></label><input class="f" id="co-email" type="email" autocomplete="email" placeholder="you@gmail.com" value="${hdEsc(defaultEmail)}"></div>
      </div>
      <p class="hint" style="margin:8px 0 0">Saved before payment so your order reaches us even if UPI or WhatsApp doesn't open.</p>
    </div>
    <div class="panel" style="background:rgba(255,255,255,.025);margin:12px 0;padding:12px">
      <h4 style="margin:0 0 8px">2 · Pay ${money(b.total)} via UPI</h4>
      <div class="upi-qr-box">
        <div class="upi-qr-svg">${qr || '<span style="color:#111;font-size:11px;padding:8px;text-align:center">QR unavailable — use the UPI ID</span>'}</div>
        <div>
          <div class="sub" style="font-size:12px;margin-bottom:4px">Scan with any UPI app, or tap to open:</div>
          <div style="font-family:var(--mono);font-weight:800;font-size:15px;margin-bottom:8px">${hdEsc(CONFIG.upiId)}</div>
          <div class="upi-apps">${upiAppLinks(b.total, oid)}</div>
          <button class="btn btn-sm btn-ghost" type="button" data-copy="${hdEsc(CONFIG.upiId)}" style="margin-top:8px;width:100%">Copy UPI ID</button>
        </div>
      </div>
      <p class="hint" style="margin:0 0 8px">Add <b>${hdEsc(oid)}</b> as the payment note so we can match it instantly. Pay only to <b>${hdEsc(CONFIG.upiId)}</b> — we never ask for OTPs or card details.</p>
      <label for="co-utr">3 · UTR / UPI reference <span class="hint">optional, speeds up verification</span></label>
      <input class="f" id="co-utr" placeholder="12-digit UTR from your UPI app" inputmode="numeric" maxlength="24">
    </div>
    <label id="co-agree-wrap" style="display:flex;gap:9px;align-items:flex-start;margin:14px 0 4px;font-size:12.5px;line-height:1.6;color:var(--mut)">
      <input type="checkbox" id="co-agree" style="margin-top:3px;flex:0 0 auto">
      <span>I have read and accept the <a href="#/terms">terms of service</a> and the <a href="#/refund-policy">refund policy</a>. I understand <b>all sales are final, refunds are not available in any case</b>, and delivery times are estimates only.</span></label>
    <div id="checkoutMsg"></div>
    <div class="paybtns">
      <button class="btn btn-block" data-checkout-action="upi">Save order &amp; open UPI app (${money(b.total)})</button>
      <button class="btn btn-ghost btn-block" data-checkout-action="wa">Save order &amp; confirm on WhatsApp</button>
      <button class="btn btn-ghost btn-block" data-checkout-action="copy">Save order &amp; copy UPI ID</button>
    </div>
    <p class="hint"><b>How this works:</b> details → save order → pay UPI → tap WhatsApp confirmation. We verify in our bank app and hand over on WhatsApp — usually under 10 minutes during ${hdEsc(CONFIG.hours)}. Track anytime with <b>${hdEsc(oid)}</b>. <a href="#/track?id=${hdEsc(oid)}">Track this order →</a></p>`);
  state.refBy = null; state.refOff = 0;
  const name = document.getElementById("co-name");
  if (name && !name.value) setTimeout(() => { try { name.focus(); } catch (e) {} }, 60);
}
async function hdPersistOrder(action, contact) {
  const ch = state.checkout;
  if (!ch) return false;
  if (ch.saved) { checkoutMsg('<div class="ok-note">Order ' + hdEsc(ch.oid) + " is already saved — continue with payment or WhatsApp us.</div>"); return true; }
  const canon = canonicalCart();
  if (!canon.lines.length) { checkoutMsg('<div class="err">Your cart is empty — add a game first.</div>'); return false; }
  const b = checkoutBreakdown(canon.sub);
  if (b.total !== ch.total) {
    /* Price changed while the checkout was open: never charge a stale figure. */
    ch.total = b.total; ch.lines = canon.lines.map(l => l.label);
    ch.disc = b.autoDisc; ch.refOff = b.refOff; ch.promoOff = b.promoOff;
    ch.pointsRequested = b.points; ch.pointsOff = b.pointsOff;
    checkoutMsg('<div class="err">Prices were refreshed — the total is now <b>' + money(b.total) + "</b>. Please review and tap the button again.</div>");
    return false;
  }
  if (!(window.firebase && firebaseConfigured())) {
    rememberLocalOrder({ oid: ch.oid, ts: nowTs(), total: ch.total, status: "pending", items: ch.lines,
      discount: ch.disc, refOff: ch.refOff, promoOff: ch.promoOff, pointsOff: ch.pointsOff, name: contact.name });
    checkoutMsg('<div class="err">Saved on this device. Live sync is unavailable — tap the WhatsApp button so we receive the order before you pay.</div>');
    return false;
  }
  const now = nowTs();
  try {
    const current = (firebase.auth && firebase.auth().currentUser) || null;
    const u = current && !current.isAnonymous ? current : null;
    const utr = String((document.getElementById("co-utr") || {}).value || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 24);
    ch.utr = utr;
    const order = {
      uid: (u && u.uid) || "guest", guest: !u, items: ch.lines, total: ch.total, oid: ch.oid,
      ts: now, updatedAt: now, status: "pending", source: "website",
      refBy: ch.refBy || null, coupon: null, discount: ch.disc || 0, refOff: ch.refOff || 0,
      promoCode: ch.promoCode || null, promoOff: ch.promoOff || 0,
      pointsRequested: ch.pointsRequested || 0, pointsOff: ch.pointsOff || 0,
      hasUtr: !!utr, checkoutAction: action || "checkout", contactProvided: true
    };
    const contactDoc = {
      oid: ch.oid, name: contact.name, wa: contact.wa,
      email: contact.email || ((u && u.email) || ""), utr: utr || null,
      ts: now, updatedAt: now, source: "website", checkoutAction: action || "checkout"
    };
    const db = firebase.firestore();
    const oref = db.collection("orders").doc(ch.oid);
    const exists = await oref.get().then(d => d.exists).catch(() => false);
    if (!exists) {
      const batch = db.batch();
      batch.set(oref, order);
      batch.set(db.collection("orderContacts").doc(ch.oid), contactDoc);
      await batch.commit();
      try { await sendOwnerOrderEmail(order, contactDoc); } catch (e) {}
      try { sendReceiptEmail(ch.oid, ch.lines, ch.total, ch.disc, ch.refOff, contactDoc); } catch (e) {}
      if (u) {
        try {
          await db.collection("users").doc(u.uid).set({
            lastOrderAt: now, pendingPoints: firebase.firestore.FieldValue.increment(ch.pointsRequested || 0)
          }, { merge: true });
        } catch (e) {}
      }
    }
    ch.saved = true;
    rememberLocalOrder(Object.assign({}, order, { name: contact.name }));
    pushLocalNotif({
      title: "Order " + ch.oid + " saved 📦",
      body: "We've received your order. Pay " + money(ch.total) + " to " + CONFIG.upiId + " and confirm on WhatsApp — then we verify and hand over.",
      url: "#/track?id=" + ch.oid, category: "order_updates"
    });
    try { hdTrack("purchase", { transaction_id: ch.oid, value: ch.total, currency: "INR" }); } catch (e) {}
    checkoutMsg('<div class="ok-note">Order ' + hdEsc(ch.oid) + " saved. It\'s live in the owner dashboard — you can track it any time.</div>");
    return true;
  } catch (err) {
    console.warn("[checkout] order save failed", err);
    rememberLocalOrder({ oid: ch.oid, ts: now, total: ch.total, status: "pending", items: ch.lines, name: contact.name });
    checkoutMsg('<div class="err">Kept on this device but not synced: ' + hdEsc(String(err.message || err).slice(0, 110)) +
      '. Use the WhatsApp button so we receive it before you pay.</div>');
    return false;
  }
}
async function hdCheckoutAction(btn) {
  const action = (btn && btn.dataset && btn.dataset.checkoutAction) || "upi";
  if (action !== "wa") {
    const agree = document.getElementById("co-agree");
    if (agree && !agree.checked) {
      checkoutMsg('<div class="err">Please tick the box to accept the terms and the no-refund policy before continuing.</div>');
      const wrap = document.getElementById("co-agree-wrap");
      if (wrap && wrap.scrollIntoView) wrap.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
  }
  const contact = hdContactFromForm();
  const bad = hdContactError(contact);
  if (bad) { checkoutMsg('<div class="err">' + hdEsc(bad) + "</div>"); return; }
  saveCheckoutContact(contact);
  let popup = null;
  try { if (action === "wa") popup = window.open("about:blank", "_blank"); } catch (e) {}
  setCheckoutBusy(true);
  const saved = await hdPersistOrder(action, contact);
  setCheckoutBusy(false);
  if (action === "wa") {
    const url = hdCheckoutWaUrl(action);
    if (popup) { try { popup.location.href = url; } catch (e) { window.open(url, "_blank", "noopener"); } }
    else window.open(url, "_blank", "noopener");
    return;
  }
  if (!saved) return;
  if (action === "copy") {
    copyText(CONFIG.upiId);
    checkoutMsg('<div class="ok-note">Order saved and UPI ID copied. Pay to <b>' + hdEsc(CONFIG.upiId) + "</b> with note <b>" +
      hdEsc((state.checkout || {}).oid || "") + "</b>, then tap “Save order &amp; confirm on WhatsApp”.</div>");
    return;
  }
  const upi = (state.checkout || {}).upi;
  if (upi) {
    const frame = document.createElement("iframe");
    frame.style.display = "none";
    frame.src = upi;
    document.body.appendChild(frame);
    setTimeout(() => frame.remove(), 4000);
    checkoutMsg('<div class="ok-note">Order saved. If your UPI app didn\'t open, scan the QR above or copy the UPI ID <b>' +
      hdEsc(CONFIG.upiId) + "</b> and pay <b>" + money((state.checkout || {}).total) + "</b>. Then confirm on WhatsApp.</div>");
    const waBtn = document.querySelector('[data-checkout-action="wa"]');
    if (waBtn) waBtn.classList.add("pulse-cta");
  }
}
function hdCheckoutWaUrl(action) {
  const c = hdContactFromForm();
  const ch = state.checkout || {};
  const label = action === "upi" ? "I am paying via UPI" : action === "copy" ? "I copied the UPI ID and will pay" : "I've paid / confirming payment";
  const msg = "New order " + ch.oid + " on " + CONFIG.brand + "\n" + (ch.lines || []).join("\n") +
    (ch.disc ? "\nAutomatic discount: −" + money(ch.disc) : "") +
    (ch.promoOff ? "\nPromo " + (ch.promoCode || "") + ": −" + money(ch.promoOff) : "") +
    (ch.refOff ? "\nReferral " + (ch.refBy || "") + ": −" + money(ch.refOff) : "") +
    (ch.pointsOff ? "\nHeaven Points (" + ch.pointsRequested + "): −" + money(ch.pointsOff) : "") +
    "\nTotal: " + money(ch.total || 0) +
    "\nName: " + c.name + "\nWhatsApp: +" + c.wa + (c.email ? "\nEmail: " + c.email : "") +
    (ch.utr ? "\nUTR: " + ch.utr : "") +
    "\nStatus: " + label;
  return "https://wa.me/" + waNumber() + "?text=" + encodeURIComponent(msg);
}
function cartWaMessage() {
  const canon = canonicalCart();
  const b = checkoutBreakdown(canon.sub);
  return "Hi " + CONFIG.brand + "! I'd like to order:\n" + canon.lines.map(l => l.label).join("\n") +
    "\nTotal: " + money(b.total) + "\nName: ";
}
function hdContactFromForm() {
  const digits = v => String(v || "").replace(/[^0-9]/g, "");
  const rawWa = ((document.getElementById("co-wa") || {}).value || "").trim();
  let wa = digits(rawWa);
  if (wa.length === 10) wa = "91" + wa;
  return {
    name: ((document.getElementById("co-name") || {}).value || "").trim(),
    wa: wa,
    email: ((document.getElementById("co-email") || {}).value || "").trim().toLowerCase()
  };
}
function hdContactError(c) {
  if (!c.name || c.name.length < 2) return "Please enter the buyer name so we can identify the order.";
  if (!c.wa || c.wa.length < 10 || c.wa.length > 15) return "Please enter a valid WhatsApp number with country code, e.g. 919876543210.";
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email)) return "Please enter a valid email address, or leave email blank.";
  return "";
}
/* ------------------------------------------------------------------ */
/* 16 · owner command centre                                          */
/* ------------------------------------------------------------------ */
function admTab() {
  const m = String(location.hash || "").match(/[?&]tab=([a-z]+)/i);
  const t = (m && m[1]) || state.admTab || "overview";
  return ["overview", "orders", "products", "customers", "promos", "notifications", "settings"].indexOf(t) > -1 ? t : "overview";
}
function setAdmTab(t) {
  state.admTab = t;
  try { history.replaceState(null, "", "#/admin?tab=" + t); } catch (e) { location.hash = "#/admin?tab=" + t; }
  vAdminRender();
}
function admShell(tab, body) {
  const tabs = [["overview", "📊 Overview"], ["orders", "📦 Orders"], ["products", "🎮 Products"], ["customers", "👥 Customers"],
                ["promos", "🎟️ Promotions"], ["notifications", "🔔 Push"], ["settings", "⚙️ Settings"]];
  return '<div class="sec-head" style="padding-top:26px;margin-bottom:0"><div><h2>Command centre</h2>' +
    "<p class=\"sub\">Signed in as " + hdEsc(state.user.email || "") + " · catalog " + (state.source === "firestore" ? "live on Firestore" : "local") + "</p></div>" +
    '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" data-adm-refresh>↻ Refresh</button>' +
    '<button class="btn btn-ghost btn-sm" data-logout>Log out</button></div></div>' +
    '<div class="adm-tabs">' + tabs.map(t => '<button class="tab-btn' + (tab === t[0] ? " on" : "") + '" data-adm-tab="' + t[0] + '">' + t[1] + "</button>").join("") + "</div>" +
    '<div id="admBody">' + body + "</div>";
}
function hdAdminPage() {
  if (!state.fbReady) {
    return '<div class="sec-head" style="padding-top:26px;margin-bottom:10px"><div><h2>Owner admin</h2><p class="sub">Private — only you can log in here.</p></div></div>' +
      '<div class="demo-note"><b>' + (state.fbLoading ? "Connecting to Firestore…" : "Setup not finished yet.") + "</b><br>This is where you manage products, prices, stock, orders and offers. To switch it on: (1) paste your Firebase config into <b>firebase-config.js</b>, (2) publish <b>firestore.rules</b> with your admin UID, (3) redeploy. Step-by-step: <b>SETUP-FIREBASE.md</b>.<br><br>The storefront keeps working in the meantime using the local starter catalog.</div>";
  }
  setTimeout(vAdminRender, 30);
  if (state.user && state.settings.adminUid && state.user.uid !== state.settings.adminUid) {
    return '<div class="sec-head" style="padding-top:26px;margin-bottom:10px"><div><h2>Owner admin</h2></div></div>' +
      '<div class="demo-note">This account (' + hdEsc(state.user.email || "") + ') is a <b>customer account</b>, not the store owner. The admin panel is available only to the owner account.</div>' +
      '<button class="btn btn-ghost btn-sm" data-signout>Sign out</button>';
  }
  if (!state.user) {
    return '<div class="sec-head" style="padding-top:26px;margin-bottom:10px"><div><h2>Owner login</h2><p class="sub">Private admin — authorized email only.</p></div></div>' +
      '<div class="panel" style="max-width:460px">' +
      '<label for="ad-email">Email</label><input class="f" id="ad-email" type="email" autocomplete="username" inputmode="email" placeholder="you@yourdomain.com">' +
      '<label for="ad-pass">Password</label><div class="pw-wrap"><input class="f" id="ad-pass" type="password" autocomplete="current-password" placeholder="••••••••••">' +
      '<button class="pw-tog" type="button" data-pw-toggle="ad-pass">Show</button></div>' +
      '<div class="paybtns"><button class="btn btn-block" data-login>Log in</button></div>' +
      '<div id="adMsg" class="err">' + (state.adminMsg ? hdEsc(state.adminMsg) : "") + "</div>" +
      '<button class="rm" type="button" data-hd-forgot style="margin-top:8px">Forgot password?</button>' +
      '<p class="hint">Sign-up is intentionally not offered. Your account is created in the Firebase console (see SETUP-FIREBASE.md).</p></div>';
  }
  return admShell(admTab(), '<div class="panel"><div class="skel skel-line" style="width:45%"></div><div class="skel skel-block"></div></div>');
}
function vAdminRender() {
  const box = document.getElementById("admBody");
  if (!box) return;
  const tab = admTab();
  if (tab === "orders") box.innerHTML = admOrdersPanel();
  else if (tab === "products") box.innerHTML = admProductsPanel();
  else if (tab === "customers") box.innerHTML = admCustomersPanel();
  else if (tab === "promos") box.innerHTML = admPromosPanel();
  else if (tab === "notifications") box.innerHTML = admPushPanel();
  else if (tab === "settings") box.innerHTML = admSettingsPanel();
  else box.innerHTML = admOverviewPanel();
  /* document.querySelectorAll("[data-adm-tab]").forEach(b => b.classList.toggle("on", b.dataset.admTab === tab)); */
  document.querySelectorAll(".adm-tabs .tab-btn").forEach(b => b.classList.toggle("on", b.dataset.admTab === tab));
  if (tab === "orders") { if (!state.ordersLoaded) loadAdminOrders(); else hdRenderOrders(); }
  if (tab === "customers") { if (!state.custLoaded) loadCustomers(); else renderCustomers(); }
  if (tab === "products") { renderAdminTable(); }
}
function admOrdersPanel() {
  return '<div class="panel" style="margin-bottom:18px">' +
    '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><h3 style="margin:0">Orders &amp; fulfilment</h3>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sm btn-ghost" data-load-orders>↻ Refresh</button>' +
    '<button class="btn btn-sm" data-add-order>＋ Add WhatsApp order</button>' +
    '<button class="btn btn-sm btn-ghost" data-export-orders>⬇ Export CSV</button></div></div>' +
    '<div class="stats"><div class="stat"><b id="ordTotal">–</b><span>Orders</span></div>' +
    '<div class="stat"><b id="ordRev">–</b><span>Revenue (paid+)</span></div>' +
    '<div class="stat"><b id="ordPend">–</b><span>Pending</span></div>' +
    '<div class="stat"><b id="ordToday">–</b><span>Today</span></div></div>' +
    '<div class="filter-search" style="margin-bottom:10px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
    '<input class="f" id="ordSearch" placeholder="Search order ID, name, WhatsApp, UTR…" oninput="setOrdQ(this.value)" value="' + hdEsc(state.ordQ || "") + '"></div>' +
    '<div class="filters" style="margin:0 0 12px" id="ordChips"></div>' +
    '<div id="ordersList"><p class="sub" style="margin:0">Loading orders…</p></div></div>';
}
function admOverviewPanel() {
  const all = Object.values(state.products);
  const orders = state.orders || [];
  const paid = orders.filter(o => ["paid", "delivered", "complete"].indexOf(String(o.status || "").toLowerCase()) > -1);
  const rev = paid.reduce((a, o) => a + Number(o.total || 0), 0);
  const aov = paid.length ? Math.round(rev / paid.length) : 0;
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const today = orders.filter(o => (o.ts || 0) >= t0.getTime());
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const next = d.getTime() + 86400000;
    const list = paid.filter(o => (o.ts || 0) >= d.getTime() && (o.ts || 0) < next);
    days.push({ label: d.toLocaleDateString("en-IN", { weekday: "short" }), value: list.reduce((a, o) => a + Number(o.total || 0), 0), count: list.length });
  }
  const max = Math.max.apply(null, days.map(d => d.value).concat([1]));
  const byPlat = { psn: 0, pc: 0, xbox: 0, subs: 0 };
  orders.forEach(o => (Array.isArray(o.items) ? o.items : []).forEach(line => {
    const s = String(line).toLowerCase();
    if (s.indexOf("ps5") > -1 || s.indexOf("psn") > -1 || s.indexOf("playstation") > -1) byPlat.psn++;
    else if (s.indexOf("xbox") > -1 || s.indexOf("game pass") > -1) byPlat.xbox++;
    else if (s.indexOf("membership") > -1 || s.indexOf("mystery") > -1) byPlat.subs++;
    else byPlat.pc++;
  }));
  const platTotal = Object.keys(byPlat).reduce((a, k) => a + byPlat[k], 0) || 1;
  const statusCount = ["pending", "paid", "delivered", "cancelled"].map(s => ({ s: s, n: orders.filter(o => String(o.status || "").toLowerCase() === s).length }));
  const lowStock = all.filter(p => p.stock > 0 && p.stock <= 2).sort((a, b) => a.stock - b.stock).slice(0, 6);
  const alerts = S.priceAlerts.length;
  const subs = (state.customers || []).filter(c => c.u && c.u.optIn).length;
  return '<div class="stats" style="margin-top:0">' +
    '<div class="stat"><b>' + money(rev) + "</b><span>Revenue (paid + delivered)</span></div>" +
    '<div class="stat"><b>' + orders.length + "</b><span>Total orders</span></div>" +
    '<div class="stat"><b>' + money(aov) + "</b><span>Average order value</span></div>" +
    '<div class="stat"><b>' + today.length + "</b><span>Orders today</span></div>" +
    '<div class="stat"><b>' + all.filter(p => p.active !== false).length + "</b><span>Active listings</span></div>" +
    '<div class="stat"><b>' + all.filter(p => p.stock <= 0).length + "</b><span>Out of stock</span></div>" +
    "</div>" +
    '<div class="an-grid">' +
    '<div class="panel"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><h3 style="margin:0">Revenue — last 7 days</h3>' +
    '<span class="sub" style="font-size:11.5px">' + money(days.reduce((a, d) => a + d.value, 0)) + " total</span></div>" +
    '<div class="bar-chart">' + days.map(d => '<div class="bar-col"><span class="sub" style="font-size:9.5px">' + (d.value ? money(d.value).replace("₹", "") : "") + "</span>" +
      '<div class="bar-fill" style="height:' + Math.max(3, Math.round(d.value / max * 100)) + '%"></div>' +
      '<span class="bar-lbl">' + hdEsc(d.label) + "</span></div>").join("") + "</div></div>" +
    '<div class="panel"><h3 style="margin:0 0 12px">Sales by platform</h3>' +
    [["PSN", "psn"], ["Xbox", "xbox"], ["PC", "pc"], ["Memberships", "subs"]].map(p =>
      '<div class="split-row"><div class="split-head"><span>' + p[0] + "</span><span>" + byPlat[p[1]] + "</span></div>" +
      '<div class="split-track"><i style="width:' + Math.round(byPlat[p[1]] / platTotal * 100) + '%"></i></div></div>').join("") +
    '<h3 style="margin:16px 0 10px">Order status</h3>' +
    statusCount.map(s => '<div class="split-row"><div class="split-head"><span>' + hdEsc(s.s) + "</span><span>" + s.n + "</span></div>" +
      '<div class="split-track"><i style="width:' + Math.round(s.n / (orders.length || 1) * 100) + '%"></i></div></div>').join("") + "</div></div>" +
    '<div class="an-grid">' +
    '<div class="panel"><h3 style="margin-top:0">Needs attention</h3>' +
    (lowStock.length ? lowStock.map(p => '<div class="sumline"><span>' + hdEsc(p.title) + '</span><span class="t2l">' + p.stock + " left</span></div>").join("")
      : '<p class="sub" style="margin:0">Stock levels look healthy.</p>') +
    (state.settings.adminUid ? "" : '<div class="demo-note" style="margin:12px 0 0"><b>One-time:</b> claim ownership so nobody else can.<br><button class="btn btn-sm" data-claim-owner style="margin-top:8px">🔒 Claim owner with this account</button><div id="claimMsg"></div></div>') +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
    '<button class="btn btn-sm btn-ghost" data-export-orders>⬇ Orders CSV</button>' +
    '<button class="btn btn-sm btn-ghost" data-export-customers>⬇ Customers CSV</button>' +
    '<button class="btn btn-sm btn-ghost" data-export-products>⬇ Catalog CSV</button></div></div>' +
    '<div class="panel"><h3 style="margin-top:0">Retention snapshot</h3>' +
    '<div class="sumline"><span>Price alerts being watched</span><span>' + alerts + "</span></div>" +
    '<div class="sumline"><span>Customers opted in to offers</span><span>' + subs + "</span></div>" +
    '<div class="sumline"><span>Referral codes issued</span><span>' + (state.customers || []).filter(c => c.u && c.u.refCode).length + "</span></div>" +
    '<div class="sumline"><span>Points outstanding</span><span>' + (state.customers || []).reduce((a, c) => a + (c.available || 0), 0) + "</span></div>" +
    '<p class="hint" style="margin-bottom:0">Tip: run a “new release” push when a blockbuster lands — that single message historically drives the most same-day orders.</p></div></div>' +
    admFirestorePanel();
}
function admFirestorePanel() {
  const all = Object.values(state.products);
  const deleted = (typeof deletedIds === "function" ? deletedIds() : []).length;
  return '<div class="panel"><h3 style="margin-top:0">Firestore catalog</h3>' +
    '<p class="hint" style="margin-top:0">Firestore holds <b>' + (state.fsCount || 0) + "</b> product(s) · local catalog has <b>" +
    Object.keys(state._seedProducts || {}).length + '</b>. <b>Upload once</b> to make the catalog live and manageable from any device.' +
    (deleted ? " <b>" + deleted + "</b> deleted item(s) can be restored." : "") + "</p>" +
    '<div class="paybtns" style="margin:0"><button class="btn btn-sm" data-sync-up>⬆ Upload catalog to Firestore</button>' +
    (deleted ? '<button class="btn btn-ghost btn-sm" data-restore-deleted>Restore deleted</button>' : "") + "</div>" +
    '<div id="syncMsg"></div></div>';
}
function admProductsPanel() {
  const all = Object.values(state.products);
  return '<div class="panel">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px">' +
    '<h3 style="margin:0">Products &amp; pricing (' + all.length + ')</h3>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sm" data-add-product>＋ Add product</button>' +
    '<button class="btn btn-sm btn-ghost" data-export-products>⬇ CSV</button></div></div>' +
    '<div class="filters" style="margin:2px 0 12px;flex-wrap:wrap">' +
    ["all", "psn", "pc", "xbox", "subs"].map(k => {
      const n = k === "all" ? all.length : all.filter(p => p.platform === k).length;
      const lb = k === "all" ? "All" : k === "psn" ? "PSN" : k === "pc" ? "PC / Steam" : k === "xbox" ? "Xbox" : "Extras";
      return '<button class="fbtn' + (state.adPlat === k ? " on" : "") + '" data-adplat="' + k + '">' + lb + " (" + n + ")</button>";
    }).join("") + "</div>" +
    '<label for="ad-search" style="margin-top:0">Search</label>' +
    '<input class="f" id="ad-search" placeholder="Filter by title…" oninput="renderAdminTable()">' +
    '<div class="tblwrap"><table class="ptable"><thead><tr><th>Product</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead><tbody id="adminRows"></tbody></table></div>' +
    '<div class="plist-m" id="adminCards"></div>' +
    '<p class="hint">Price guards stay enforced: PC under ₹599 by default, PSN Secondary ≥ ₹799 and Primary ≥ ₹2,299, Xbox accounts ≥ ₹899. Editing a price marks the field as owner-set so the policy never overwrites you again.</p></div>';
}
function admCustomersPanel() {
  return '<div class="panel"><h3 style="margin-top:0">Customers &amp; loyalty</h3>' +
    '<div class="stats"><div class="stat"><b id="custCount">–</b><span>Registered buyers</span></div>' +
    '<div class="stat"><b id="custOpt">–</b><span>Want offers</span></div>' +
    '<div class="stat"><b id="custSpend">–</b><span>Customer spend</span></div>' +
    '<div class="stat"><b id="custPts">–</b><span>Points to redeem</span></div></div>' +
    '<div class="paybtns" style="justify-content:flex-start"><button class="btn btn-sm" data-load-customers>↻ Reload customers</button>' +
    '<button class="btn btn-ghost btn-sm" data-copy-emails>Copy opted-in contacts</button>' +
    '<button class="btn btn-ghost btn-sm" data-export-customers>⬇ CSV</button></div>' +
    '<label for="cust-search" style="margin-top:14px">Search</label>' +
    '<input class="f" id="cust-search" placeholder="Name, email, WhatsApp, order ID…" value="' + hdEsc(state.custQ || "") + '" oninput="setCustQ(this.value)">' +
    '<div class="filters" style="margin:10px 0 2px;flex-wrap:wrap" id="custChips"></div>' +
    '<div id="custMsg"></div><div id="custList"><p class="sub" style="margin:10px 0 0">Loading customers…</p></div>' +
    '<div id="topRef"></div></div>';
}
function admPromosPanel() {
  const promos = promosList();
  const rows = promos.length
    ? promos.map((p, i) => '<div class="sumline" style="align-items:center"><span><b class="t2l">' + hdEsc(p.code) + "</b> · " +
        (p.pct ? p.pct + "% off" : money(p.off) + " off") + (p.min ? " · min " + money(p.min) : "") +
        (p.on === false ? ' <span class="pill can">OFF</span>' : ' <span class="pill on">LIVE</span>') + "</span>" +
        '<span><button class="btn btn-sm btn-ghost" data-promo-toggle="' + i + '">' + (p.on === false ? "Enable" : "Disable") + "</button> " +
        '<button class="btn btn-sm btn-ghost" data-promo-del="' + i + '">Delete</button></span></div>').join("")
    : '<p class="sub" style="margin:0">No promo codes yet — add one below. Customers can also use the automatic cart discount, referral codes and Heaven Points.</p>';
  return '<div class="panel"><h3 style="margin-top:0">🎟️ Promo codes</h3>' +
    '<p class="hint" style="margin-top:0">The automatic 10% above ' + money(couponMinOrder() || 5500) + " stays on. Promo codes stack on top of it and never push a total below ₹0.</p>" +
    '<div id="promoList">' + rows + "</div>" +
    '<div class="form2" style="margin-top:16px">' +
    '<div><label for="pr-code">Code</label><input class="f" id="pr-code" placeholder="FESTIVE10" style="text-transform:uppercase"></div>' +
    '<div><label for="pr-kind">Type</label><select class="f" id="pr-kind"><option value="pct">Percent off</option><option value="flat">Flat ₹ off</option></select></div>' +
    '<div><label for="pr-val">Value</label><input class="f" id="pr-val" type="number" min="1" placeholder="10"></div>' +
    '<div><label for="pr-min">Minimum order (₹)</label><input class="f" id="pr-min" type="number" min="0" step="100" value="0"></div>' +
    "</div><div class=\"paybtns\" style=\"justify-content:flex-start\"><button class=\"btn btn-sm\" data-promo-add>＋ Add promo code</button></div>" +
    '<div id="promoAdminMsg"></div></div>' +
    '<div class="panel" style="margin-top:16px"><h3 style="margin-top:0">🧾 Retired codes</h3>' +
    '<p class="sub" style="margin-top:0">These codes no longer grant discounts and show the “coupon limit reached” message, exactly as before: <b>' +
    hdEsc(((typeof COUPON_RULE !== "undefined" && COUPON_RULE.retired) || []).join(", ") || "none") + "</b></p></div>";
}
function admPushPanel() {
  const key = vapidKey();
  const recent = S.notifs.slice(0, 6);
  return '<div class="panel"><h3 style="margin-top:0">🔔 Push &amp; in-app notifications</h3>' +
    '<p class="hint" style="margin-top:0">Every message you publish here appears instantly in the in-app 🔔 centre for all visitors, and is delivered as a real Web Push notification to subscribed devices once the VAPID key is configured.</p>' +
    '<div class="form2">' +
    '<div><label for="pn-title">Title</label><input class="f" id="pn-title" maxlength="80" placeholder="GTA VI is live — day-one accounts"></div>' +
    '<div><label for="pn-cat">Category</label><select class="f" id="pn-cat"><option value="new_releases">New release</option><option value="offers">Offer / sale</option><option value="price_drops">Price drop</option><option value="order_updates">Order update</option></select></div>' +
    '<div style="grid-column:1/-1"><label for="pn-body">Message</label><textarea class="f" id="pn-body" rows="3" maxlength="200" placeholder="Day-one PS5 accounts from ₹1,999 — 2-year warranty, delivered in ~10 minutes."></textarea></div>' +
    '<div style="grid-column:1/-1"><label for="pn-url">Tap-through link</label><input class="f" id="pn-url" placeholder="#/deals"></div>' +
    "</div>" +
    '<div class="paybtns" style="justify-content:flex-start"><button class="btn btn-sm" data-push-send>Publish notification</button>' +
    '<button class="btn btn-ghost btn-sm" data-push-test>Send test to this device</button></div>' +
    '<div id="pnMsg"></div></div>' +
    '<div class="panel" style="margin-top:16px"><h3 style="margin-top:0">VAPID / Web Push configuration</h3>' +
    '<p class="sub" style="margin-top:0">Public key only — the private key stays on your push dispatcher (see <b>PUSH-SETUP.md</b>). Generate a pair with <code>npx web-push generate-vapid-keys</code>.</p>' +
    '<label for="pn-vapid">VAPID public key</label><input class="f" id="pn-vapid" placeholder="B…" value="' + hdEsc(key) + '">' +
    '<div class="paybtns" style="justify-content:flex-start"><button class="btn btn-sm" data-save-vapid>Save key</button>' +
    '<button class="btn btn-ghost btn-sm" data-push-consent-row>Request permission on this device</button></div>' +
    '<div id="vapidMsg">' + (key ? '<div class="ok-note" style="margin-top:10px">Key configured — devices that tapped “Enable alerts” are subscribed.</div>'
      : '<div class="demo-note" style="margin-top:10px"><b>Not configured yet.</b> In-app notifications already work for every visitor. Real push needs a VAPID key pair and the dispatcher worker: open <b>PUSH-SETUP.md</b>.</div>') + "</div></div>" +
    '<div class="panel" style="margin-top:16px"><h3 style="margin-top:0">Recent notifications on this device</h3>' +
    (recent.length ? recent.map(n => '<div class="notif-item' + (n.read ? "" : " unread") + '"><div class="notif-item-top"><span class="notif-cat">' +
      hdEsc(n.category) + "</span><span>" + (n.ts ? new Date(n.ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "") + "</span></div>" +
      "<b>" + hdEsc(n.title) + '</b><span class="sub" style="font-size:12.5px">' + hdEsc(n.body) + "</span></div>").join("")
      : '<p class="sub" style="margin:0">Nothing yet — publish a notification to test the funnel.</p>') + "</div>";
}
function admSettingsPanel() {
  const s = state.settings || {};
  return '<div class="panel"><h3 style="margin-top:0">Announcement &amp; automatic discount</h3>' +
    '<label for="set-announce">Announcement bar text</label><input class="f" id="set-announce" value="' + hdEsc(s.announce) + '">' +
    '<div class="form2">' +
    '<div><label for="set-code">Retired coupon code</label><input class="f" id="set-code" value="' + hdEsc(s.couponCode) + '" style="text-transform:uppercase"></div>' +
    '<div><label for="set-pct">Automatic discount %</label><input class="f" id="set-pct" type="number" min="1" max="90" value="' + hdEsc(s.couponPercent) + '"></div>' +
    '<div><label for="set-min">Minimum order for the discount (₹)</label><input class="f" id="set-min" type="number" min="0" step="100" value="' + hdEsc(couponMinOrder()) + '"></div>' +
    "</div>" +
    '<label style="display:flex;gap:8px;align-items:center;margin-top:14px"><input type="checkbox" id="set-on" ' + (s.couponOn ? "checked" : "") + "> Automatic discount active</label>" +
    '<label for="set-dealends" style="margin-top:14px">Deal countdown — real end time (empty = hidden)</label>' +
    '<input class="f" id="set-dealends" placeholder="2026-12-31T23:59:00+05:30" value="' + hdEsc(s.dealEnds || "") + '">' +
    '<div class="paybtns" style="justify-content:flex-start"><button class="btn btn-sm" data-save-settings>Save offer settings</button></div>' +
    '<div id="setMsg"></div></div>' +
    '<div class="panel" style="margin-top:16px"><h3 style="margin-top:0">Store name &amp; contact</h3>' +
    '<div class="form2">' +
    '<div><label for="st-brand">Website / brand name</label><input class="f" id="st-brand" value="' + hdEsc(CONFIG.brand) + '"></div>' +
    '<div><label for="st-wa">WhatsApp number (with 91…)</label><input class="f" id="st-wa" inputmode="numeric" value="' + hdEsc(CONFIG.whatsapp) + '"></div>' +
    '<div><label for="st-upi">UPI ID (checkout payments)</label><input class="f" id="st-upi" value="' + hdEsc(CONFIG.upiId) + '"></div>' +
    '<div><label for="st-email">Support email</label><input class="f" id="st-email" type="email" value="' + hdEsc(CONFIG.email) + '"></div>' +
    '<div><label for="st-ig">Instagram</label><input class="f" id="st-ig" value="' + hdEsc(CONFIG.instagram) + '"></div>' +
    '<div><label for="st-ch">WhatsApp channel link</label><input class="f" id="st-ch" value="' + hdEsc(CONFIG.channel) + '"></div>' +
    '<div><label for="st-hours">Support hours</label><input class="f" id="st-hours" value="' + hdEsc(CONFIG.hours) + '"></div>' +
    "</div><div class=\"paybtns\" style=\"justify-content:flex-start\"><button class=\"btn btn-sm\" data-save-store>Save store details</button></div>" +
    '<div id="storeMsg"></div></div>' +
    '<div class="panel" style="margin-top:16px"><h3 style="margin-top:0">Analytics</h3>' +
    '<div class="form2">' +
    '<div><label for="st-ga">Google Analytics 4 ID</label><input class="f" id="st-ga" value="' + hdEsc(s.gaId || DEFAULT_GA_ID) + '"></div>' +
    '<div><label for="st-cf">Cloudflare Web Analytics token</label><input class="f" id="st-cf" value="' + hdEsc(s.cfToken || "") + '"></div>' +
    "</div><div class=\"paybtns\" style=\"justify-content:flex-start\"><button class=\"btn btn-sm\" data-save-analytics>Save analytics</button></div>" +
    '<div id="anMsg"></div></div>' +
    '<div class="panel" style="margin-top:16px"><h3 style="margin-top:0">Chat assistant replies</h3>' +
    '<label class="pm-l" for="st-chatintro">Greeting</label><input class="f" id="st-chatintro" value="' + hdEsc(s.chatIntro || "") + '">' +
    '<label class="pm-l" style="margin-top:12px" for="st-chatqa">Custom Q&amp;A — one per line: <b>question | answer</b></label>' +
    '<textarea class="f" id="st-chatqa" rows="5">' + hdEsc(s.chatQA || "") + "</textarea>" +
    '<div class="paybtns" style="justify-content:flex-start"><button class="btn btn-sm" data-save-chat>Save chat replies</button></div>' +
    '<div id="chatMsg2"></div></div>' +
    '<div class="panel" style="margin-top:16px"><h3 style="margin-top:0">Data &amp; backups</h3>' +
    '<p class="sub" style="margin-top:0">Export a full snapshot of the catalog, orders and customers any time. Keep a copy before big price changes.</p>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sm btn-ghost" data-export-products>⬇ Catalog CSV</button>' +
    '<button class="btn btn-sm btn-ghost" data-export-orders>⬇ Orders CSV</button>' +
    '<button class="btn btn-sm btn-ghost" data-export-customers>⬇ Customers CSV</button>' +
    '<button class="btn btn-sm btn-ghost" data-export-json>⬇ Full JSON backup</button></div></div>';
}

/* ---- admin: orders list extension (search + invoices + WhatsApp) ---- */
function setOrdQ(v) { state.ordQ = v; hdRenderOrders(); }
function hdOrdActions(o) {
  const st = String(o.status || "pending").toLowerCase();
  const b = [];
  const btn = (label, stat, cls) => '<button class="btn ' + cls + ' btn-sm" data-ord-status="' + hdEsc(o.oid) + "|" + stat + '">' + label + "</button>";
  if (st === "pending") { b.push(btn("✓ Paid", "paid", "")); b.push(btn("✕ Cancel", "cancelled", "btn-ghost")); }
  else if (st === "paid") { b.push(btn("⚙ Preparing", "processing", "btn-ghost")); b.push(btn("⌘ Delivered", "delivered", "")); }
  else if (st === "processing") { b.push(btn("⌘ Delivered", "delivered", "")); }
  else if (st === "delivered") { b.push(btn("✓ Setup done", "complete", "btn-ghost")); }
  b.push('<button class="btn btn-sm btn-ghost" data-invoice-oid="' + hdEsc(o.oid) + '">🧾</button>');
  b.push('<a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="' + hdEsc(waUrl(custTemplate(o))) + '">💬</a>');
  return b.join("");
}
function custTemplate(o) {
  const name = (o.name || "there").split(" ")[0];
  const st = String(o.status || "pending").toLowerCase();
  if (st === "delivered" || st === "complete") {
    return "Hi " + name + "! Your HeavenDigital order " + o.oid + " is delivered 🎮\n\nAnything not working? Reply here within your 2-year warranty and we'll replace it. Enjoy the game!\n— " + CONFIG.brand;
  }
  if (st === "paid") {
    return "Hi " + name + "! Payment verified for " + o.oid + " ✅\nWe're preparing your account credentials and will send them here in a few minutes. Keep this chat open.\n— " + CONFIG.brand;
  }
  return "Hi " + name + "! Quick check on your HeavenDigital order " + o.oid + " (" + money(o.total) + ").\n" +
    "Pay to UPI " + CONFIG.upiId + " with the order ID in the note, then reply with the UTR / screenshot and we'll deliver in ~10 minutes.\n— " + CONFIG.brand;
}
function hdRenderOrders() {
  const box = document.getElementById("ordersList");
  if (!box) return;
  const all = state.orders || [];
  const rev = all.filter(o => ["paid", "delivered", "complete"].indexOf(String(o.status || "").toLowerCase()) > -1).reduce((a, o) => a + Number(o.total || 0), 0);
  const pend = all.filter(o => String(o.status || "pending") === "pending").length;
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const today = all.filter(o => (o.ts || 0) >= t0.getTime()).length;
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set("ordTotal", all.length); set("ordRev", money(rev)); set("ordPend", pend); set("ordToday", today);
  const counts = {
    all: all.length, pending: pend,
    paid: all.filter(o => String(o.status) === "paid").length,
    delivered: all.filter(o => ["delivered", "complete"].indexOf(String(o.status)) > -1).length,
    cancelled: all.filter(o => ["cancelled", "refunded"].indexOf(String(o.status)) > -1).length
  };
  const chips = document.getElementById("ordChips");
  if (chips) chips.innerHTML = ["all", "pending", "paid", "delivered", "cancelled"].map(k =>
    '<button class="fbtn' + (state.ordFilter === k ? " on" : "") + '" data-ordfilter="' + k + '">' + k[0].toUpperCase() + k.slice(1) +
    " (" + counts[k] + ")</button>").join("");
  let rows = all.slice();
  if (state.ordFilter === "cancelled") rows = rows.filter(o => ["cancelled", "refunded"].indexOf(String(o.status)) > -1);
  else if (state.ordFilter && state.ordFilter !== "all") rows = rows.filter(o => String(o.status || "pending") === state.ordFilter);
  const q = String(state.ordQ || "").toLowerCase().trim();
  if (q) rows = rows.filter(o => ((o.oid || "") + " " + (o.name || "") + " " + (o.wa || "") + " " + (o.email || "") + " " + (o.utr || "")).toLowerCase().indexOf(q) > -1);
  rows = rows.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  if (!rows.length) {
    box.innerHTML = '<p class="sub" style="margin:0">No orders here yet. Website checkouts land here automatically once the buyer saves their order — add WhatsApp orders with “＋ Add WhatsApp order”.</p>';
    return;
  }
  box.innerHTML = rows.map(o => '<div class="acard">' +
    '<div class="ord-top"><b>' + hdEsc(o.oid || "?") + "</b><span>" +
    (o.ts ? new Date(o.ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "") + "</span>" + ordPill(o.status) +
    (o.refBy ? ' <span class="pill pay">🎁 ' + hdEsc(o.refBy) + "</span>" : "") +
    (o.utr ? ' <span class="pill on">UTR</span>' : "") + "</div>" +
    '<div class="ord-buyer">' + hdEsc(o.email || "") + (o.wa ? " · WhatsApp " + hdEsc(o.wa) : "") + (o.name ? " · " + hdEsc(o.name) : "") +
    (o.utr ? " · UTR " + hdEsc(o.utr) : "") + "</div>" +
    (o.items && o.items.length ? '<p class="ord-it">' + o.items.map(l => hdEsc(l)).join("<br>") + "</p>" : "") +
    (o.promoCode || o.pointsOff || o.discount ? '<div class="sub" style="font-size:11.5px">' +
      (o.discount ? "auto-discount " + money(o.discount) + " " : "") +
      (o.promoCode ? "· promo " + hdEsc(o.promoCode) + " " + money(o.promoOff || 0) + " " : "") +
      (o.pointsOff ? "· points " + (o.pointsRequested || 0) + " (" + money(o.pointsOff) + ")" : "") + "</div>" : "") +
    '<div class="ord-top" style="margin-top:4px"><span class="ord-amt">' + money(o.total || 0) + '</span><span class="rowbtns">' + hdOrdActions(o) + "</span></div></div>").join("");
}
/* status update with referral + points ledger + customer notification */
async function ordSetStatus(oid, st) {
  try {
    const db = firebase.firestore();
    await db.collection("orders").doc(oid).set({ status: st, updatedAt: nowTs() }, { merge: true });
    const o = (state.orders || []).find(x => x.oid === oid);
    if (o) { o.status = st; o.updatedAt = nowTs(); }
    if (st === "paid" && o && o.refBy) {
      try {
        const rc = await db.collection("refcodes").doc(o.refBy).get();
        if (rc.exists) {
          await db.collection("users").doc(rc.data().uid).set({
            earned: firebase.firestore.FieldValue.increment(50),
            referrals: firebase.firestore.FieldValue.increment(1), updatedAt: nowTs()
          }, { merge: true });
          toast("Referrer credited ₹50 🎁");
        }
      } catch (e) {}
    }
    if ((st === "delivered" || st === "complete") && o && o.uid && o.uid !== "guest" && Number(o.pointsRequested || 0) > 0) {
      try { await db.collection("users").doc(o.uid).set({ pointsRedeemed: firebase.firestore.FieldValue.increment(Number(o.pointsRequested || 0)) }, { merge: true }); } catch (e) {}
    }
    if (o) {
      const msg = st === "delivered" ? "Your order " + oid + " is delivered 🎮" :
                  st === "paid" ? "Payment verified for " + oid + " ✅" :
                  st === "processing" ? "We're preparing credentials for " + oid + " ⚙" :
                  "Order " + oid + " → " + st;
      pushLocalNotif({ title: "Order " + oid + " updated", body: msg, url: "#/track?id=" + oid, category: "order_updates" });
    }
    hdRenderOrders();
    toast(oid + " → " + st);
  } catch (err) { toast("Failed: " + (err.message || err)); }
}
/* CSV export helper */
function downloadCsv(filename, rows) {
  const csv = rows.map(r => r.map(c => {
    const s = String(c == null ? "" : c).replace(/"/g, '""');
    return /[",\n]/.test(s) ? '"' + s + '"' : s;
  }).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1200);
  toast(filename + " downloaded");
}
function exportOrders() {
  const rows = [["Order ID", "Date", "Status", "Total (INR)", "Discount", "Promo", "Points used", "Referral", "Name", "WhatsApp", "Email", "UTR", "Items"]];
  (state.orders || []).forEach(o => rows.push([
    o.oid, o.ts ? new Date(o.ts).toISOString() : "", o.status || "", o.total || 0, (o.discount || 0) + (o.refOff || 0) + (o.promoOff || 0),
    o.promoCode || "", o.pointsRequested || 0, o.refBy || "", o.name || "", o.wa || "", o.email || "", o.utr || "",
    (o.items || []).join(" | ")
  ]));
  downloadCsv("heavendigital-orders-" + new Date().toISOString().slice(0, 10) + ".csv", rows);
}
function exportProducts() {
  const rows = [["ID", "Title", "Platform", "Kind", "Price", "MRP", "Tier2", "Stock", "Active", "Featured", "Region", "Image"]];
  Object.values(state.products).forEach(p => rows.push([p.id, p.title, p.platform, p.kind, p.price, p.mrp, p.p2 || "", p.stock, p.active !== false, !!p.featured, p.region || "", p.img || ""]));
  downloadCsv("heavendigital-catalog-" + new Date().toISOString().slice(0, 10) + ".csv", rows);
}
function exportCustomers() {
  const rows = [["Name", "Email", "WhatsApp", "Tier", "Orders", "Spent (INR)", "Points available", "Referral code", "Offers opt-in", "Joined"]];
  (state.customers || []).forEach(c => rows.push([
    custName(c.u), c.u.email || "", c.u.wa || "", c.tier, c.orders.length, c.spent, c.available,
    c.u.refCode || "", c.u.optIn ? "yes" : "no", c.joined ? new Date(c.joined).toISOString() : ""
  ]));
  downloadCsv("heavendigital-customers-" + new Date().toISOString().slice(0, 10) + ".csv", rows);
}
function exportJson() {
  const blob = new Blob([JSON.stringify({
    exportedAt: new Date().toISOString(), settings: state.settings,
    products: Object.values(state.products), orders: state.orders || [],
    customers: (state.customers || []).map(c => ({ name: custName(c.u), email: c.u.email, tier: c.tier, orders: c.orders.length, spent: c.spent }))
  }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "heavendigital-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1200);
  toast("Backup downloaded");
}
/* promo admin */
async function savePromos(list) {
  const clean = list.slice(0, 40).map(p => ({
    code: String(p.code || "").toUpperCase().replace(/[^A-Z0-9\-]/g, "").slice(0, 20),
    pct: Math.max(0, Math.min(90, Number(p.pct) || 0)),
    off: Math.max(0, Math.min(100000, Number(p.off) || 0)),
    min: Math.max(0, Number(p.min) || 0),
    on: p.on !== false
  })).filter(p => p.code && (p.pct || p.off));
  await firebase.firestore().collection("settings").doc("store").set({ promos: clean }, { merge: true });
  state.settings = Object.assign({}, state.settings, { promos: clean });
  vAdminRender();
}
/* push composer */
async function publishNotification() {
  const title = String((document.getElementById("pn-title") || {}).value || "").trim();
  const body = String((document.getElementById("pn-body") || {}).value || "").trim();
  const cat = (document.getElementById("pn-cat") || {}).value || "offers";
  const url = safeUrl((document.getElementById("pn-url") || {}).value || "#/", "#/");
  const msg = document.getElementById("pnMsg");
  if (!title || !body) { if (msg) msg.innerHTML = '<div class="err">Add both a title and a message.</div>'; return; }
  try {
    await firebase.firestore().collection("notifications").add({
      title: title.slice(0, 90), body: body.slice(0, 220), category: cat, url: url,
      ts: nowTs(), active: true, sentBy: (state.user && state.user.email) || "owner"
    });
    pushLocalNotif({ title: title, body: body, url: url, category: cat });
    if (msg) msg.innerHTML = '<div class="ok-note">Published — it is live in every visitor\'s 🔔 centre now. Subscribed devices get a push once the dispatcher runs.</div>';
    document.getElementById("pn-title").value = ""; document.getElementById("pn-body").value = "";
    vAdminRender();
  } catch (err) {
    if (msg) msg.innerHTML = '<div class="err">Publish failed: ' + hdEsc(err.message || String(err)) + "</div>";
  }
}
/* ------------------------------------------------------------------ */
/* 17 · notification centre drawer                                    */
/* ------------------------------------------------------------------ */
function openNotifs() {
  markNotifsRead();
  const rows = S.notifs.length
    ? S.notifs.map(n => '<div class="notif-item' + (n.read ? "" : " unread") + '">' +
        '<div class="notif-item-top"><span class="notif-cat">' + notifIcon(n.category) + " " + hdEsc(n.category.replace("_", " ")) + "</span>" +
        "<span>" + (n.ts ? new Date(n.ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "") + "</span></div>" +
        "<b>" + hdEsc(n.title) + "</b>" +
        '<span class="sub" style="font-size:12.5px">' + hdEsc(n.body) + "</span>" +
        (n.url && n.url !== "#/" ? '<a class="rm" href="' + hdEsc(safeUrl(n.url)) + '" data-close-modal style="margin-top:2px">Open →</a>' : "") +
        "</div>").join("")
    : '<p class="sub" style="margin:0">No notifications yet. Enable alerts and we\'ll ping you about new releases, offers and price drops.</p>';
  openHdModal("🔔 Notifications", '<div class="notif-list">' + rows + "</div>" +
    '<div class="paybtns" style="margin-top:14px">' +
    (P().enabled ? '<a class="btn btn-ghost btn-block" href="#/account?tab=alerts" data-close-modal>Manage preferences</a>'
                       : '<button class="btn btn-block" data-ask-push>Enable push alerts</button>') +
    "</div>");
}
function openPriceAlert(id) {
  const p = byId(id);
  if (!p) return;
  const existing = alertFor(id);
  const suggest = Math.max(1, Math.round(p.price * 0.9));
  openHdModal("Price alert", '<p class="sub" style="margin-top:0">We\'ll notify you the moment <b>' + hdEsc(p.title) + "</b> drops to your target. Current price: <b>" + money(p.price) + "</b>.</p>" +
    '<label for="pa-target">Notify me at or below (₹)</label>' +
    '<input class="f" id="pa-target" type="number" min="1" max="100000" value="' + hdEsc(existing ? existing.targetPrice : suggest) + '" autofocus inputmode="numeric">' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
    [5, 10, 15, 20].map(d => '<button class="btn btn-sm btn-ghost" type="button" data-pa-quick="' + Math.round(p.price * (1 - d / 100)) + '">−' + d + "% (" + money(Math.round(p.price * (1 - d / 100))) + ")</button>").join("") + "</div>" +
    '<div class="paybtns" style="margin-top:14px"><button class="btn btn-block" data-alert-set="' + hdEsc(id) + '">Save alert</button>' +
    (existing ? '<button class="btn btn-ghost btn-block" data-alert-remove="' + hdEsc(id) + '">Remove this alert</button>' : "") + "</div>" +
    '<p class="hint">Alerts are stored on this device and in your account (when signed in). Enable push in <a href="#/account?tab=alerts" data-close-modal>Alerts</a> to be pinged instantly.</p>');
}
function saveAlertFromModal(id) {
  const inp = document.getElementById("pa-target");
  const v = Number((inp && inp.value) || 0);
  if (!v || v < 1) { toast("Enter a target price"); return; }
  setPriceAlert(id, v);
  toast("Alert set for " + money(v) + " 🔔");
  if (!P().enabled) setTimeout(() => askNotificationConsent(false), 500);
  closeModal();
  route();
}
function checkPriceDrops() {
  const dropped = [];
  S.priceAlerts.forEach(a => {
    const p = byId(a.productId);
    if (!p) return;
    if (p.price <= Number(a.targetPrice || 0) && !a.notifiedAt) {
      a.notifiedAt = nowTs();
      dropped.push(a);
      pushLocalNotif({
        title: "Price drop: " + p.title,
        body: p.title + " is now " + money(p.price) + " — at or below your " + money(a.targetPrice) + " target.",
        url: "#/p/" + p.id, category: "price_drops"
      });
    }
  });
  if (dropped.length) { lsSet(LS.alerts, S.priceAlerts); toast("📉 Price drop on " + dropped.length + " watched game(s)"); }
}
function alertAllWishlist() {
  const items = S.wishlist.map(id => byId(id)).filter(Boolean);
  if (!items.length) { toast("Save a few games to your wishlist first"); return; }
  items.forEach(p => {
    if (!alertFor(p.id)) setPriceAlert(p.id, Math.round(p.price * 0.9));
  });
  toast("Watching " + items.length + " wishlisted game" + (items.length === 1 ? "" : "s"));
  route();
}

/* ------------------------------------------------------------------ */
/* 18 · product page decoration                                       */
/* ------------------------------------------------------------------ */
function decorateProduct(html, id) {
  const p = byId(id);
  if (!p) return html;
  const fav = inWishlist(id);
  const al = alertFor(id);
  const utils = '<div class="pd-util-row">' +
    '<button class="pd-util-btn' + (fav ? " active" : "") + '" type="button" data-fav="' + hdEsc(id) + '" aria-pressed="' + (fav ? "true" : "false") + '">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 5.6a5.2 5.2 0 0 0-7.4 0L12 7l-1.4-1.4a5.2 5.2 0 1 0-7.4 7.4L12 21.5l8.8-8.5a5.2 5.2 0 0 0 0-7.4z"/></svg>' +
    (fav ? "Saved" : "Wishlist") + "</button>" +
    '<button class="pd-util-btn' + (al ? " alert-on" : "") + '" type="button" data-price-alert="' + hdEsc(id) + '">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17l5-6 4 4 4-6 5 8"/></svg>' +
    (al ? "Alert at " + money(al.targetPrice) : "Price alert") + "</button>" +
    '<button class="pd-util-btn" type="button" data-share="' + hdEsc(id) + '">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>Share</button>' +
    '<a class="pd-util-btn pd-wa-btn" target="_blank" rel="noopener" href="' + hdEsc(waUrl("Hi " + CONFIG.brand + "! Is this available — " + p.title + " (" + money(p.price) + ")?")) + '">' +
    WAICON + "Ask a question</a></div>" +
    (al && p.price <= al.targetPrice
      ? '<div class="ok-note" style="margin:8px 0 12px">📉 This is at or below your ' + money(al.targetPrice) + " alert — good time to grab it.</div>"
      : "");
  let out = html;
  if (out.indexOf('<div class="pd-price">') > -1) out = out.replace('<div class="pd-price">', utils + '<div class="pd-price">');
  /* trust + share block before the related grid */
  const shareBlock = '<div class="panel rv" style="margin:18px 0"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">' +
    '<div><b>Know someone who wants this?</b><br><span class="sub" style="font-size:13px">Send the live price and link — it updates itself.</span></div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
    '<a class="btn btn-sm" target="_blank" rel="noopener" href="' + hdEsc(waUrl("🎮 " + p.title + " — " + money(p.price) + " on " + CONFIG.brand + "\n" + storeUrl("#/p/" + p.id))) + '">' + WAICON + " WhatsApp</a>" +
    '<button class="btn btn-sm btn-ghost" type="button" data-share="' + hdEsc(id) + '">All channels</button></div></div></div>';
  if (out.indexOf('<section class="sec"><div class="sec-head rv">') > -1) {
    out = out.replace('<section class="sec"><div class="sec-head rv">', shareBlock + '<section class="sec"><div class="sec-head rv">');
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 19 · referral capture + hash query helpers                         */
/* ------------------------------------------------------------------ */
function hashQuery() {
  const out = {};
  const h = String(location.hash || "");
  const q = h.indexOf("?");
  if (q < 0) return out;
  h.slice(q + 1).split("&").forEach(pair => {
    if (!pair) return;
    const i = pair.indexOf("=");
    const k = decodeURIComponent(i < 0 ? pair : pair.slice(0, i));
    const v = decodeURIComponent(i < 0 ? "" : pair.slice(i + 1));
    out[k] = v;
  });
  return out;
}
function captureRefFromUrl() {
  const fromHash = hashQuery().ref;
  const fromSearch = new URLSearchParams(location.search).get("ref");
  const code = String(fromHash || fromSearch || "").trim().toUpperCase();
  if (code && /^[A-Z0-9\-]{4,12}$/.test(code)) {
    lsSet("hd_ref_v1", { code: code, ts: nowTs() });
    applyRefCode(code, true);
    /* drop the ref param from the address bar without reloading */
    try {
      const clean = location.hash.replace(/([?&])ref=[^&]*/g, "").replace(/[?&]$/, "");
      history.replaceState(null, "", location.pathname + location.search.replace(/[?&]ref=[^&]*/g, "") + (clean || "#/"));
    } catch (e) {}
  } else {
    const saved = lsGet("hd_ref_v1", null);
    if (saved && saved.code && nowTs() - (saved.ts || 0) < 1000 * 60 * 60 * 24 * 30) applyRefCode(saved.code, false);
  }
}
async function applyRefCode(code, announce) {
  const c = String(code || "").toUpperCase();
  if (!c) return;
  if (state.user && HD.profile && HD.profile.refCode === c) return;
  state.refBy = c;
  state.refOff = 50;
  if (announce) toast("Referral " + c + " applied — ₹50 off your order 🎁");
  if (window.firebase && state.fbReady) {
    try {
      const d = await firebase.firestore().collection("refcodes").doc(c).get();
      if (!d.exists) { state.refBy = null; state.refOff = 0; if (announce) toast("That referral code wasn't found"); return; }
      if (state.user && d.data().uid === state.user.uid) { state.refBy = null; state.refOff = 0; return; }
      state.refBy = c; state.refOff = 50;
      if (routeNow() === "/cart") route();
    } catch (e) {}
  } else if (routeNow() === "/cart") {
    route();
  }
}

/* ------------------------------------------------------------------ */
/* 20 · global event delegation                                       */
/* ------------------------------------------------------------------ */
function bindHdEvents() {
  document.addEventListener("click", async function (e) {
    const q = sel => e.target.closest(sel);
    let el;

    /* S.wishlist / sharing / alerts */
    if ((el = q("[data-fav]"))) {
      const on = toggleWishlist(el.dataset.fav);
      if (on && !P().asked) setTimeout(() => askNotificationConsent(false), 700);
      toast(on ? "Saved to wishlist ❤️" : "Removed from wishlist");
      if (routeNow() === "/wishlist") route();
      return;
    }
    if ((el = q("[data-notify-stock]"))) {
      const p = byId(el.dataset.notifyStock);
      if (p) setPriceAlert(p.id, p.price);
      toast("We'll ping you when it's back in stock");
      if (!P().enabled && !P().asked) askNotificationConsent(false);
      return;
    }
    if ((el = q("[data-share]"))) { e.preventDefault(); shareProduct(el.dataset.share); return; }
    if ((el = q("[data-share-copy]"))) {
      copyText(el.dataset.shareCopy);
      return;
    }
    if ((el = q("[data-share-native]"))) {
      const p = byId(el.dataset.shareNative);
      if (!p) return;
      const ok = await nativeShare(p.title, p.title + " — " + money(p.price) + " on " + CONFIG.brand, storeUrl("#/p/" + p.id));
      if (!ok) toast("Use the buttons above to share");
      return;
    }
    if ((el = q("[data-share-release]"))) {
      const t = el.dataset.shareRelease;
      const txt = "📅 " + t + " — release tracked on HeavenDigital. Live prices & preorder info: " + storeUrl("#/releases");
      if (!(await nativeShare(t + " — release date", txt, storeUrl("#/releases")))) { copyText(txt); }
      return;
    }
    if ((el = q("[data-price-alert]"))) { openPriceAlert(el.dataset.priceAlert); return; }
    if ((el = q("[data-pa-quick]"))) {
      const inp = document.getElementById("pa-target");
      if (inp) inp.value = el.dataset.paQuick;
      return;
    }
    if ((el = q("[data-alert-set]"))) { saveAlertFromModal(el.dataset.alertSet); return; }
    if ((el = q("[data-alert-remove]"))) {
      removePriceAlert(el.dataset.alertRemove);
      toast("Alert removed");
      closeModal(); route();
      return;
    }
    if (q("[data-alert-for-wishlist]")) { alertAllWishlist(); return; }
    if (q("[data-wish-clear]")) {
      S.wishlist = []; saveWishlist(); toast("Wishlist cleared"); route(); return;
    }
    if (q("[data-reset-cat]")) {
      state.catQ = ""; state.catPrice = "all"; state.catStock = false; catFilter = "all"; route(); return;
    }

    /* cart controls */
    if ((el = q("[data-cart-inc]"))) {
      cartAdd(el.dataset.cartInc, 1, splitKey(el.dataset.cartInc)[1] === "p2" ? "p2" : undefined); route(); return;
    }
    if ((el = q("[data-cart-dec]"))) {
      const k = el.dataset.cartDec;
      const [id, opt] = splitKey(k);
      const have = cart[k] || 0;
      if (have <= 1) delete cart[k]; else cart[k] = have - 1;
      saveCart(cart); updateBadge(); route(); return;
    }
    if (q("[data-cart-clear]")) {
      cart = {}; saveCart(cart); updateBadge(); toast("Cart cleared"); route(); return;
    }
    if (q("[data-promo-apply]")) { applyPromo(); return; }
    if (q("[data-promo-remove]")) { state.promo = null; toast("Promo removed"); route(); return; }

    /* search / notifications / install */
    if (q("[data-open-search]")) { openSearchOverlay(""); return; }
    if (q("[data-open-notifs]")) { openNotifs(); return; }
    if (q("[data-ask-push]")) { closeModal(); askNotificationConsent(true); return; }
    if (q("[data-remind-releases]")) {
      if (!P().enabled) askNotificationConsent(true);
      else { P().new_releases = true; lsSet(LS.prefs, P()); toast("Release alerts on 🔔"); }
      return;
    }

    /* auth */
    if (q("[data-hd-signin]")) { e.preventDefault(); await hdSignIn(); return; }
    if (q("[data-hd-signup]")) { e.preventDefault(); await hdSignUp(); return; }
    if (q("[data-hd-google]")) { e.preventDefault(); await hdGoogle(); return; }
    if (q("[data-hd-forgot]")) { e.preventDefault(); await hdForgot(); return; }
    if ((el = q("[data-pw-toggle]"))) { pwToggle(el.dataset.pwToggle); return; }
    if (q("[data-hd-verify-email]")) {
      try {
        if (state.user && !state.user.emailVerified) {
          await state.user.sendEmailVerification();
          toast("Verification email sent");
        } else toast("Email already verified");
      } catch (err) { toast(hdAuthError(err)); }
      return;
    }
    if (q("[data-hd-reset-pass]")) {
      try {
        await firebase.auth().sendPasswordResetEmail(state.user.email);
        toast("Reset link sent to " + state.user.email);
      } catch (err) { toast(hdAuthError(err)); }
      return;
    }
    if (q("[data-acct-save-profile]")) {
      const wa = String((document.getElementById("ac-wa") || {}).value || "").replace(/[^0-9]/g, "");
      const name = String((document.getElementById("ac-name") || {}).value || "").trim();
      try {
        await firebase.firestore().collection("users").doc(state.user.uid).set({ wa: wa, name: name, updatedAt: nowTs() }, { merge: true });
        if (name) { try { await state.user.updateProfile({ displayName: name }); } catch (er) {} }
        HD.profile = Object.assign({}, HD.profile || {}, { wa: wa, name: name });
        const box = document.getElementById("acProfileMsg");
        if (box) box.innerHTML = '<div class="ok-note">Saved — we\'ll use this number for delivery.</div>';
        toast("Details saved");
      } catch (err) { toast("Save failed: " + (err.message || err)); }
      return;
    }
    if ((el = q("[data-acct-tab]"))) {
      state.acctTab = el.dataset.acctTab;
      try { history.replaceState(null, "", "#/account?tab=" + state.acctTab); } catch (er) {}
      document.querySelectorAll("[data-acct-tab]").forEach(b => b.classList.toggle("on", b.dataset.acctTab === state.acctTab));
      renderAccountBody();
      return;
    }

    /* invoices */
    if ((el = q("[data-invoice-oid]"))) {
      const oid = el.dataset.invoiceOid;
      const ord = (state.orders || []).find(o => o.oid === oid) || localOrders().find(o => o.oid === oid) || { oid: oid };
      openInvoice(ord, ord.items);
      return;
    }
    if (q("[data-print-invoice]")) { printInvoice(); return; }
    if ((el = q("[data-download-invoice]"))) { downloadInvoice(el.dataset.downloadInvoice); return; }

    /* admin tabs + exports */
    if ((el = q("[data-adm-tab]"))) { setAdmTab(el.dataset.admTab); return; }
    if (q("[data-adm-refresh]")) { refreshAdmin(true); return; }
    if (q("[data-export-orders]")) { exportOrders(); return; }
    if (q("[data-export-products]")) { exportProducts(); return; }
    if (q("[data-export-customers]")) { exportCustomers(); return; }
    if (q("[data-export-json]")) { exportJson(); return; }
    if ((el = q("[data-hd-ord-status]"))) {
      const parts = String(el.dataset.hdOrdStatus).split("|");
      await ordSetStatus(parts[0], parts[1]);
      return;
    }

    /* promos */
    if (q("[data-promo-add]")) {
      const code = String((document.getElementById("pr-code") || {}).value || "").trim().toUpperCase();
      const kind = (document.getElementById("pr-kind") || {}).value || "pct";
      const val = Number((document.getElementById("pr-val") || {}).value || 0);
      const min = Number((document.getElementById("pr-min") || {}).value || 0);
      const msg = document.getElementById("promoAdminMsg");
      if (!/^[A-Z0-9\-]{3,20}$/.test(code) || !val) { if (msg) msg.innerHTML = '<div class="err">Enter a code (letters/numbers) and a value.</div>'; return; }
      const list = promosList().slice();
      list.push({ code: code, pct: kind === "pct" ? val : 0, off: kind === "flat" ? val : 0, min: min, on: true });
      try { await savePromos(list); toast("Promo " + code + " is live"); } catch (err) { if (msg) msg.innerHTML = '<div class="err">' + hdEsc(err.message || err) + "</div>"; }
      return;
    }
    if ((el = q("[data-promo-toggle]"))) {
      const list = promosList().slice();
      const i = Number(el.dataset.promoToggle);
      if (list[i]) { list[i].on = list[i].on === false; try { await savePromos(list); } catch (err) { toast("Failed: " + (err.message || err)); } }
      return;
    }
    if ((el = q("[data-promo-del]"))) {
      const list = promosList().slice();
      list.splice(Number(el.dataset.promoDel), 1);
      try { await savePromos(list); toast("Promo deleted"); } catch (err) { toast("Failed: " + (err.message || err)); }
      return;
    }

    /* push composer */
    if (q("[data-push-send]")) { await publishNotification(); return; }
    if (q("[data-push-test]")) {
      const ok = await enablePush(false);
      if (ok) {
        pushLocalNotif({ title: "Test notification 🔔", body: "If you can see this in the 🔔 centre, the funnel works end to end.", url: "#/deals", category: "offers" });
        try {
          const reg = swReg || (navigator.serviceWorker ? await navigator.serviceWorker.ready : null);
          if (reg && reg.active) reg.active.postMessage({ type: "SHOW_NOTIFICATION", payload: { title: "HeavenDigital test 🔔", body: "Push is working on this device.", url: storeUrl("#/deals") } });
        } catch (er) {}
        toast("Test sent");
      }
      return;
    }
    if (q("[data-save-vapid]")) {
      const key = String((document.getElementById("pn-vapid") || {}).value || "").trim();
      const msg = document.getElementById("vapidMsg");
      try {
        await firebase.firestore().collection("settings").doc("store").set({ vapidPublicKey: key }, { merge: true });
        state.settings = Object.assign({}, state.settings, { vapidPublicKey: key });
        if (msg) msg.innerHTML = key ? '<div class="ok-note">Saved — new subscribers will register with this key.</div>'
          : '<div class="err">Cleared. In-app notifications keep working.</div>';
      } catch (err) { if (msg) msg.innerHTML = '<div class="err">' + hdEsc(err.message || err) + "</div>"; }
      return;
    }
    if (q("[data-push-consent-row]")) { askNotificationConsent(true); return; }
  });

  /* keyboard: "/" opens search, Esc closes modals */
  document.addEventListener("keydown", e => {
    const tag = (e.target && e.target.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "textarea" || tag === "select" || (e.target && e.target.isContentEditable);
    if (e.key === "/" && !typing) { e.preventDefault(); openSearchOverlay(""); }
    if (e.key === "Escape") {
      const root = document.getElementById("modalRoot");
      if (root && root.innerHTML) closeModal();
    }
  });

  /* keep views fresh after sign-in, S.wishlist cloud sync, print styles */
  window.addEventListener("hashchange", () => {
    setTimeout(() => {
      paintWishBadge();
      paintNotifBadge();
      if (routeNow() === "/account") loadAccountData(false);
    }, 60);
  });
}

/* ------------------------------------------------------------------ */
/* 21 · admin data refresh                                            */
/* ------------------------------------------------------------------ */
async function refreshAdmin(force) {
  state.ordersLoaded = false;
  state.custLoaded = false;
  try {
    if (typeof loadAdminOrders === "function") await loadAdminOrders();
    if (typeof loadCustomers === "function") await loadCustomers();
  } catch (e) {}
  vAdminRender();
  if (force) toast("Dashboard refreshed");
}

/* ------------------------------------------------------------------ */
/* 22 · boot                                                          */
/* ------------------------------------------------------------------ */
function hdBoot() {
  if (hdBoot.__done) return;          /* safe to call twice (inline + self-boot) */
  hdBoot.__done = true;
  /* 1 · new routes + SEO entries (ROUTES/ROUTE_SEO are shared maps) */
  try {
    ROUTES["/deals"] = { t: "Crazy deals — up to 92% off", v: vDeals };
    ROUTES["/wishlist"] = { t: "Your wishlist", v: vWishlist };
    ROUTES["/releases"] = { t: "Game release calendar 2026–27", v: vReleases };
    ROUTES["/account"].v = vAccount;
    ROUTES["/admin"].v = hdAdminPage;
    ROUTES["/cart"].v = vCart;
    ROUTES["/track"].v = vTrack;
    ROUTE_SEO["/deals"] = { title: "Game Deals — Up to 92% Off | HeavenDigital", description: "Live PS5, Xbox and PC game-account deals with real INR prices and instant UPI checkout.", canonical: BASESEO + "deals/" };
    ROUTE_SEO["/wishlist"] = { title: "Your Wishlist | HeavenDigital", description: "Games you saved, with live prices and price-drop alerts.", canonical: BASESEO };
    ROUTE_SEO["/releases"] = { title: "Game Release Calendar 2026–2027 | HeavenDigital", description: "Every major PS5, Xbox and PC release date with live store pricing at HeavenDigital.", canonical: BASESEO + "releases/" };
  } catch (e) { console.warn("[hd] route registration failed", e && e.message); }

  /* 2 · wrap the product page with the v4 utility row */
  try {
    if (typeof vProduct === "function" && !vProduct.__hdWrapped) {
      const base = vProduct;
      const wrapped = function (id) { return decorateProduct(base(id), id); };
      wrapped.__hdWrapped = true;
      vProduct = wrapped;
    }
  } catch (e) {}

  /* 4 · PWA / offline / notifications plumbing */
  captureInstallPrompt();
  registerSW();
  bindConnectivity();
  paintWishBadge();
  paintNotifBadge();
  paintPushToggles();
  bindHdEvents();
  captureRefFromUrl();
  checkPriceDrops();

  /* 5 · lifecycle: firebase, auth hooks, broadcast listener, consent */
  try {
    if (typeof initFirebase === "function" && !initFirebase.__hdWrapped) {
      const baseInit = initFirebase;
      const wrappedInit = function () {
        baseInit();
        if (state.fbReady) setTimeout(hdAfterFirebase, 400);
      };
      wrappedInit.__hdWrapped = true;
      initFirebase = wrappedInit;
    }
  } catch (e) {}
  setTimeout(() => { if (state.fbReady) hdAfterFirebase(); }, 2500);
  setTimeout(() => { if (state.fbReady) hdAfterFirebase(); }, 6000);

  /* 6 · gentle consent prompt after engagement (never blocking) */
  setTimeout(() => {
    if (!P().asked && !isStandalone() && P().enabled === false) {
      askNotificationConsent(false);
    }
  }, 45000);

  /* 7 · route the current hash so newly registered pages render */
  try { if (routeNow() !== "/") route(); } catch (e) {}
}
function hdAfterFirebase() {
  pullWishlistCloud();
  listenBroadcasts();
  checkPriceDrops();
  if (routeNow() === "/account") loadAccountData(true);
  if (routeNow() === "/admin") vAdminRender();
  if (state.user) {
    const saved = lsGet("hd_ref_v1", null);
    if (saved && saved.code && !state.refBy) applyRefCode(saved.code, false);
  }
}

/* keep the offline bar / badges correct on bfcache restore */
window.addEventListener("pageshow", () => {
  paintOfflineBar(); paintWishBadge(); paintNotifBadge();
});

/* Boot: the inline call in index.html boots us right after this file loads; this
   self-boot is the fallback so the layer still comes up if that call is missing. */
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hdBoot);
else setTimeout(hdBoot, 0);

/* public helpers used by markup in other modules */
HD.openSearch = openSearchOverlay;
HD.share = shareProduct;
HD.openInvoice = openInvoice;
HD.notify = pushLocalNotif;
HD.settings = () => CORE.getSettings();
HD.state = CORE.getState();
HD.boot = hdBoot;
HD.checkout = openCheckout;
HD.card = hdCardV4;
HD.homeStrip = homeStrip;
HD.checkoutAction = hdCheckoutAction;
/* hooks called from the store's own listeners */
window.hdAuthError = hdAuthError;
window.hdSignUp = hdSignUp;
window.hdSignIn = hdSignIn;
window.hdAfterAuth = function (user) {
  paintWishBadge();
  if (user) pullWishlistCloud();
  const r = routeNow();
  if (r === "/account" || r === "/admin") route();
};
window.hdRefreshChrome = function () {
  const pill = document.getElementById("acctPillTxt");
  const u = CORE.getUser();
  if (pill) pill.textContent = u ? ((u.displayName || u.email || "Account").split(" ")[0].split("@")[0].slice(0, 12)) : "Account";
};
window.hdOpenSearch = openSearchOverlay;
window.hdOpenNotifs = openNotifs;
window.hdInstall = doInstall;
window.hdEnablePush = enablePush;
/* inline markup handlers (oninput/onchange) must live on window */
window.setCustQ = setCustQ; window.setOrdQ = setOrdQ;
window.hdPushMaster = hdPushMaster; window.hdPushPref = hdPushPref;
})();
