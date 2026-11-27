/* Simulates the real browser load order: external scripts are NOT inlined, they are
   executed as separate classic scripts after the inline ones — the exact situation
   defer/na. A guard against "works only when inlined" regressions. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM, VirtualConsole } = require("jsdom");

const root = process.cwd();
let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
html = html.replace(/<script[^>]+src="https?:\/\/[^"]+"[^>]*><\/script>\s*/g, "");

const externals = [];
html = html.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
  const file = path.join(root, src);
  if (fs.existsSync(file)) externals.push(src);
  return "<!-- external:" + src + " -->";
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
vc.on("warn", (...a) => { const m = a.join(" "); if (/\[hd\]/.test(m)) errors.push("console.warn: " + m); });

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
const tick = ms => new Promise(r => setTimeout(r, ms || 60));

(async () => {
  await tick(250);              /* inline store script ran */
  /* now execute each external script as its own classic script, in document order */
  for (const src of externals) {
    const code = fs.readFileSync(path.join(root, src), "utf8");
    try {
      vm.runInContext(code, dom.getInternalVMContext(), { filename: src });
    } catch (e) {
      errors.push("script " + src + " threw: " + e.message);
    }
    await tick(40);
  }
  /* index.html calls HD.boot() in an inline script right after pwa-features.js */
  await tick(200);

  const checks = [];
  checks.push(["HD exists", typeof w.HD === "object"]);
  checks.push(["hdCore exists", typeof w.hdCore === "object"]);
  checks.push(["boot ran (routes registered)", typeof w.HD.boot === "function"]);

  w.location.hash = "#/deals";
  w.dispatchEvent(new w.HashChangeEvent("hashchange"));
  await tick(150);
  checks.push(["/deals renders", w.document.getElementById("app").innerHTML.length > 5000]);
  checks.push(["deal cards use v4 markup", /data-fav=/.test(w.document.getElementById("app").innerHTML)]);

  w.location.hash = "#/pc";
  w.dispatchEvent(new w.HashChangeEvent("hashchange"));
  await tick(150);
  const pc = w.document.getElementById("app").innerHTML;
  checks.push(["catalog cards get wishlist hearts", /class="card-fav/.test(pc)]);
  checks.push(["catalog cards keep the Add button", /data-add=/.test(pc)]);

  console.log("externals executed in order: " + externals.join(", "));
  console.log("");
  checks.forEach(c => console.log((c[1] ? "PASS  " : "FAIL  ") + c[0]));
  console.log("\nERRORS (" + errors.length + "):\n" + (errors.slice(0, 10).join("\n") || "  none"));
  process.exit(checks.some(c => !c[1]) || errors.length ? 1 : 0);
})();
