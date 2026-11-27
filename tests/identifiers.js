/* Static sanity check: every identifier the upgrade layer reads must exist either in
   pwa-features.js, in the inline store script, or on window. Catches typos left by
   refactors without needing a browser. */
const fs = require("fs");
const path = require("path");
const root = process.cwd();

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const inline = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).filter(s => s.includes("const CONFIG")).join("\n");
const pwa = fs.readFileSync(path.join(root, "pwa-features.js"), "utf8");

function decls(src) {
  const s = new Set();
  let m;
  for (const r of [/^(?:async )?function ([A-Za-z0-9_$]+)/gm, /^(?:const|let|var) ([A-Za-z0-9_$]+)/gm]) {
    r.lastIndex = 0;
    while ((m = r.exec(src))) s.add(m[1]);
  }
  const re = /^(?:const|let|var) \{([^}]+)\}/gm;
  while ((m = re.exec(src))) m[1].split(",").forEach(x => s.add(x.split(":").pop().trim()));
  // function parameters + catch params, so locals are not reported
  const rp = /function[^(]*\(([^)]*)\)/g;
  while ((m = rp.exec(src))) m[1].split(",").forEach(x => s.add(x.split("=")[0].trim()));
  const ra = /\(([^()]*)\)\s*=>/g;
  while ((m = ra.exec(src))) m[1].split(",").forEach(x => s.add(x.split("=")[0].trim()));
  const rc = /catch\s*\(([^)]+)\)/g;
  while ((m = rc.exec(src))) m[1].split(",").forEach(x => s.add(x.split("=")[0].trim()));
  return s;
}

const have = new Set([...decls(inline), ...decls(pwa)]);
const GLOBALS = new Set(("window document console Math JSON Object Array String Number Boolean Date Promise Set Map WeakMap " +
  "Intl isNaN parseInt parseFloat encodeURIComponent decodeURIComponent setTimeout clearTimeout setInterval clearInterval " +
  "requestAnimationFrame cancelAnimationFrame fetch localStorage sessionStorage navigator location history alert confirm " +
  "prompt btoa atob URL URLSearchParams Blob FileReader FormData Error TypeError RegExp Symbol Proxy Reflect " +
  "structuredClone crypto AbortController Image HTMLElement Node Event CustomEvent MutationObserver IntersectionObserver " +
  "ResizeObserver queueMicrotask self firebase emailjs QRCode HD CORE S P LS hdEsc money nowTs lsGet lsSet safeUrl " +
  "waUrl storeUrl hdCard hdCatalog").split(/\s+/));
const KW = new Set(("if else return const let var function for while do switch case break continue new typeof instanceof " +
  "try catch finally throw delete void in of class extends this null true false undefined await async yield default " +
  "super import export from").split(/\s+/));

function strip(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '""');
}

const body = strip(pwa);
const idRe = /(?<![.\w$])([A-Za-z_$][A-Za-z0-9_$]*)/g;
const ids = new Set();
let m;
while ((m = idRe.exec(body))) ids.add(m[1]);

// ignore identifiers used as object keys / labels (followed by ":")
const keys = new Set();
const keyRe = /(?<![.\w$])([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g;
while ((m = keyRe.exec(body))) keys.add(m[1]);

const missing = [...ids].filter(x => !have.has(x) && !GLOBALS.has(x) && !KW.has(x) && !keys.has(x));
console.log("UNRESOLVED IDENTIFIERS (" + missing.length + "):");
console.log(missing.sort().join("\n") || "  none");
process.exit(missing.length ? 1 : 0);
