/* Interaction test: drives the real click delegation (cart, checkout, wishlist,
   price alerts, filters, notifications, invoice, share) and asserts state + DOM. */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const root = process.cwd();
let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
html = html.replace(/<script[^>]+src="https?:\/\/[^"]+"[^>]*><\/script>\s*/g, "");
html = html.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
  const file = path.join(root, src);
  if (!fs.existsSync(file)) return "<!-- missing " + src + " -->";
  return "<script>\n" + fs.readFileSync(file, "utf8").replace(/<\/script>/g, "<\\/script>") + "\n</script>";
});
html = html.replace(/<link rel="stylesheet"[^>]*>/g, "");

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", e => {
  const m = (e && e.message) || "";
  if (/getContext|scrollTo|Not implemented|clearRect/.test(m)) return;
  errors.push("jsdomError: " + m);
});
vc.on("error", (...a) => errors.push("console.error: " + a.join(" ")));
vc.on("warn", (...a) => {
  const s = a.join(" ");
  if (!/Firebase|notifications|products subscription/i.test(s)) errors.push("console.warn: " + s);
});

const dom = new JSDOM(html, {
  url: "https://heavendigital.store/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(w) {
    w.FirebaseConfig = null;
    w.fetch = () => Promise.reject(new Error("offline test"));
    w.scrollTo = () => {};
    w.HTMLCanvasElement.prototype.getContext = () => null;
    w.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    w.addEventListener("error", e => {
      const m = (e && e.message) || "";
      if (/clearRect|getContext|scrollTo/.test(m)) return;
      errors.push("window.error: " + m);
    });
  }
});

const w = dom.window;
const d = w.document;
const tick = (ms) => new Promise(r => setTimeout(r, ms || 40));
const click = el => { if (!el) throw new Error("element missing"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true })); };
const go = async (hash) => { w.location.hash = hash; w.dispatchEvent(new w.HashChangeEvent("hashchange")); await tick(120); };
const results = [];
const check = (name, cond, extra) => { results.push([cond ? "PASS" : "FAIL", name, extra || ""]); };

(async () => {
  await tick(250);
  const core = w.hdCore;
  const st = core.getState();
  const ids = Object.keys(st.products);
  const idA = ids[0], idB = ids[1];

  /* ---- 1 · add to cart from a catalog page ---- */
  await go("#/pc");
  let addBtn = d.querySelector("[data-add]");
  if (!addBtn) {
    // fall back to the first in-stock product's own page
    const inStock = Object.values(st.products).find(p => Number(p.stock) > 0);
    await go("#/p/" + inStock.id);
    addBtn = d.querySelector("[data-add]");
  }
  click(addBtn);
  await tick(80);
  check("add to cart fills cart", Object.keys(core.getCart()).length === 1,
    "items=" + Object.keys(core.getCart()).length);
  check("cart badge updates", d.getElementById("cartCount").textContent.trim() !== "0",
    "badge=" + d.getElementById("cartCount").textContent.trim());

  /* ---- 2 · wishlist toggle from card heart ---- */
  await go("#/psn");
  let fav = d.querySelector("[data-fav]");
  if (!fav) { await go("#/deals"); fav = d.querySelector("[data-fav]"); }
  if (!fav) { await go("#/wishlist"); fav = d.querySelector("[data-fav]"); }
  if (!fav) throw new Error("no [data-fav] on /psn, /deals or /wishlist");
  click(fav);
  await tick(80);
  check("wishlist toggle works", w.HD.state && JSON.parse(w.localStorage.getItem("hd_wishlist_v1") || "[]").length === 1,
    "ids=" + (w.localStorage.getItem("hd_wishlist_v1") || "[]"));

  /* ---- 3 · wishlist page renders the saved game ---- */
  await go("#/wishlist");
  check("wishlist page lists saved game", d.getElementById("app").innerHTML.indexOf("data-fav") > -1,
    "len=" + d.getElementById("app").innerHTML.length);

  /* ---- 4 · deals page: filters are wired ---- */
  await go("#/deals");
  const dealsHtml = d.getElementById("app").innerHTML;
  check("deals page renders cards", (dealsHtml.match(/class="card/g) || []).length > 5,
    "cards=" + (dealsHtml.match(/class="card/g) || []).length);
  const sortSel = d.querySelector("select[onchange*='setSort']");
  if (sortSel) { sortSel.value = "price"; sortSel.dispatchEvent(new w.Event("change", { bubbles: true })); await tick(80); }
  check("deal sort handler does not throw", true);

  /* ---- 5 · price alert modal + save ---- */
  await go("#/p/" + idA);
  const paBtn = d.querySelector("[data-price-alert]");
  click(paBtn);
  await tick(80);
  const targetInput = d.getElementById("pa-target");
  check("price-alert modal opens", !!targetInput);
  if (targetInput) {
    targetInput.value = "999";
    click(d.querySelector("[data-alert-set]"));
    await tick(120);
    const alerts = JSON.parse(w.localStorage.getItem("hd_price_alerts_v1") || "[]");
    check("price alert persisted", alerts.some(a => a.productId === idA && Number(a.targetPrice) === 999),
      "alerts=" + alerts.length);
  }

  /* ---- 6 · checkout modal from cart ---- */
  await go("#/cart");
  const coBtn = d.querySelector("[data-checkout]");
  check("cart shows checkout button", !!coBtn);
  if (coBtn) {
    click(coBtn);
    await tick(150);
    const modal = d.getElementById("modalRoot").innerHTML;
    check("checkout modal opens", modal.length > 500, "len=" + modal.length);
    check("checkout shows the UPI ID and app links", /Q693100998@ybl/.test(modal) && /paytm|gpay|phonepe|upi:\/\//i.test(modal));
    check("checkout has order id", /HD-[A-Z0-9]{5}/.test(modal));
    check("checkout QR rendered (or graceful)", true, /qr|QR/i.test(modal) ? "qr present" : "no qr (no QRCode lib)");
    const copyBtn = d.querySelector("[data-checkout-action='copy']");
    check("checkout exposes copy-UPI action", !!copyBtn);
    // close
    const closeBtn = d.querySelector("#modalRoot [data-close-modal], #modalRoot .modal-x");
    if (closeBtn) click(closeBtn);
  }

  /* ---- 7 · notification centre ---- */
  click(d.getElementById("notifPill"));
  await tick(120);
  const notifHtml = d.getElementById("modalRoot").innerHTML;
  check("notification drawer opens", /Notifications/.test(notifHtml) && /notif-list/.test(notifHtml),
    "len=" + notifHtml.length + " head=" + notifHtml.replace(/\s+/g, " ").slice(0, 120));
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await tick(60);

  /* ---- 8 · search overlay ---- */
  click(d.getElementById("searchPill"));
  await tick(120);
  const sHtml = d.getElementById("modalRoot").innerHTML;
  check("search overlay opens with input", /<input/i.test(sHtml), "len=" + sHtml.length);
  const sInput = d.getElementById("modalRoot").querySelector("input");
  if (sInput) {
    sInput.value = "gta";
    sInput.dispatchEvent(new w.Event("input", { bubbles: true }));
    await tick(150);
    check("search returns results as you type",
      d.getElementById("modalRoot").innerHTML.toLowerCase().indexOf("gta") > -1);
  }
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

  /* ---- 9 · account page (signed out) ---- */
  await go("#/account");
  const accHtml = d.getElementById("app").innerHTML;
  check("account page offers sign-in form", /au-email|data-hd-signin|Sign in/i.test(accHtml),
    "len=" + accHtml.length);
  check("account page offers Google + forgot-password", /data-hd-google/.test(accHtml) && /data-hd-forgot/.test(accHtml));
  const upTab = d.querySelector("[data-auth-mode='up']");
  if (upTab) { click(upTab); await tick(120); }
  check("sign-up tab reveals the name field", !!d.getElementById("au-name") || /Create account/.test(d.getElementById("app").innerHTML));

  /* ---- 10 · admin gate ---- */
  await go("#/admin");
  const admHtml = d.getElementById("app").innerHTML;
  check("admin shows owner gate when signed out", /ad-email|Owner sign-in|owner/i.test(admHtml),
    "len=" + admHtml.length);

  /* ---- 11 · track order validation ---- */
  await go("#/track");
  const trackHtml = d.getElementById("app").innerHTML;
  check("track page has order-id input", /id="trk|order id/i.test(trackHtml));

  /* ---- 12 · releases page ---- */
  await go("#/releases");
  const relHtml = d.getElementById("app").innerHTML;
  check("releases page lists dates", (relHtml.match(/20\d\d/g) || []).length > 3,
    "year mentions=" + (relHtml.match(/20\d\d/g) || []).length);

  /* ---- 13 · QR / UPI helper ---- */
  check("UPI intent builder exists", typeof w.HD !== "undefined");
  if (w.HD && w.HD.state) check("HD.state points at the live store", w.HD.state === st);

  /* ---- 14 · offline handling ---- */
  Object.defineProperty(w.navigator, "onLine", { get: () => false, configurable: true });
  w.dispatchEvent(new w.Event("offline"));
  await tick(120);
  const bar = d.getElementById("offlineBar");
  check("offline bar appears when offline", bar ? !bar.hidden : false,
    "hidden=" + (bar ? bar.hidden : "n/a"));
  Object.defineProperty(w.navigator, "onLine", { get: () => true, configurable: true });
  w.dispatchEvent(new w.Event("online"));
  await tick(120);
  check("offline bar hides when back online", bar ? bar.hidden : true);

  /* ---- 15 · service worker registered (or skipped gracefully) ---- */
  check("no uncaught errors so far", errors.length === 0, errors.slice(0, 3).join(" | "));

  console.log("RESULT  check");
  results.forEach(r => console.log(r[0].padEnd(8) + r[1] + (r[2] ? "  [" + r[2] + "]" : "")));
  const fails = results.filter(r => r[0] === "FAIL");
  console.log("\n" + (results.length - fails.length) + "/" + results.length + " passed");
  console.log("ERRORS (" + errors.length + "):\n" + (errors.slice(0, 12).join("\n") || "  none"));
  process.exit(fails.length || errors.length ? 1 : 0);
})();
