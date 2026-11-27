/* jsdom smoke harness — inlines local scripts, blocks every external request,
   then walks every SPA route and reports render size + console errors. */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const root = process.cwd();
let html = fs.readFileSync(path.join(root, "index.html"), "utf8");

/* 1 · drop external scripts (Firebase, EmailJS, GA) — the store must work without them */
html = html.replace(/<script[^>]+src="https?:\/\/[^"]+"[^>]*><\/script>\s*/g, "");
/* 2 · inline every local script so jsdom executes the real load order */
html = html.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
  const file = path.join(root, src);
  if (!fs.existsSync(file)) return "<!-- missing " + src + " -->";
  return "<script>\n" + fs.readFileSync(file, "utf8").replace(/<\/script>/g, "<\\/script>") + "\n</script>";
});
/* 3 · stylesheets are irrelevant to logic */
html = html.replace(/<link rel="stylesheet"[^>]*>/g, "");

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", e => {
  const msg = (e && e.message) || "";
  if (/getContext|scrollTo|Not implemented|clearRect/.test(msg)) return;
  errors.push("jsdomError: " + msg);
});
vc.on("error", (...a) => errors.push("console.error: " + a.join(" ")));

const dom = new JSDOM(html, {
  url: "https://heavendigital.store/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    window.FirebaseConfig = null;
    window.fetch = () => Promise.reject(new Error("offline test"));
    window.scrollTo = () => {};
    window.HTMLCanvasElement.prototype.getContext = () => null;
    window.matchMedia = window.matchMedia || (q => ({
      matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}
    }));
    window.addEventListener("error", e => {
      const m = (e && e.message) || "";
      if (/clearRect|getContext|scrollTo/.test(m)) return;
      errors.push("window.error: " + m);
    });
  }
});

const w = dom.window;
const tick = ms => new Promise(r => setTimeout(r, ms || 30));

(async () => {
  await tick(200);
  const out = [];
  const routes = ["/", "/pc", "/psn", "/xbox", "/membership", "/deals", "/wishlist", "/releases",
                  "/cart", "/account", "/admin", "/track", "/search", "/reviews", "/faq", "/how",
                  "/contact", "/about", "/refund-policy", "/terms", "/privacy", "/nope"];
  for (const r of routes) {
    w.location.hash = "#" + r;
    w.dispatchEvent(new w.HashChangeEvent("hashchange"));
    await tick(100);
    const app = w.document.getElementById("app");
    const len = app ? app.innerHTML.length : 0;
    const title = w.document.title;
    const notFound = /Page not found/.test(title);
    const wantNotFound = r === "/nope";
    // deliberately short states: empty cart, signed-out account, owner gate, 404
    const shortOk = /^\/(cart|account|admin|wishlist|nope)$/.test(r);
    const verdict = (notFound !== wantNotFound) ? "404-MISMATCH" : (len > 250 || shortOk) ? "OK" : "THIN";
    out.push([r, len, title.slice(0, 44), verdict]);
  }
  const HDC = w.hdCore.getState();
  const firstId = Object.keys(HDC.products)[0];
  w.location.hash = "#/p/" + firstId;
  w.dispatchEvent(new w.HashChangeEvent("hashchange"));
  await tick(120);
  const pdHtml = w.document.getElementById("app").innerHTML;
  out.push(["#/p/" + firstId, pdHtml.length,
            (/data-price-alert/.test(pdHtml) ? "utility row OK" : "MISSING utility row"), "OK"]);

  console.log("route".padEnd(18) + "htmlLen".padStart(9) + "   verdict        title");
  out.forEach(r => console.log(String(r[0]).padEnd(18) + String(r[1]).padStart(9) + "   " + String(r[3]).padEnd(15) + r[2]));
  console.log("\nproducts:", Object.keys(HDC.products).length, "| fbReady:", HDC.fbReady, "| HD:", typeof w.HD);
  console.log("ERRORS (" + errors.length + "):");
  console.log(errors.slice(0, 20).join("\n") || "  none");
  const bad = out.some(r => r[3] !== "OK");
  process.exit(errors.length || bad ? 1 : 0);
})();
