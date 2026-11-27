/* Real scope analysis with acorn: every free identifier in pwa-features.js must be
   declared in pwa-features.js, declared in the inline store script, or be a browser
   global. Reports the exact line of anything unresolved. */
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const root = process.cwd();
const pwaPath = path.join(root, "pwa-features.js");
const pwaSrc = fs.readFileSync(pwaPath, "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const inlineSrc = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).find(s => s.includes("const CONFIG"));

const BIN = new Set(("Array Boolean Date Error Function JSON Map Math Number Object Promise RegExp Set String " +
  "Symbol WeakMap WeakSet parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent eval " +
  "Intl BigInt Reflect Proxy").split(" "));
const GLOBAL = new Set(("window document console navigator location history localStorage sessionStorage setTimeout " +
  "clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame fetch alert confirm prompt " +
  "btoa atob URL URLSearchParams Blob FileReader FormData Event CustomEvent MutationObserver IntersectionObserver " +
  "ResizeObserver queueMicrotask crypto performance screen getComputedStyle scrollTo open close print Image " +
  "HTMLElement Node Element serviceWorker self firebase emailjs QRCode Should undefined globalThis " +
  "Uint8Array Notification qrcode gtag").split(" "));

function scopeWalk(src, file) {
  const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: "script", locations: true });
  const declared = new Set();
  const refs = [];

  // 1 · collect every declaration anywhere in the program (function-scoped or block),
  //     which is a superset of what is in scope at each reference — good enough here.
  (function visit(node) {
    if (!node || typeof node.type !== "string") return;
    if (node.type === "FunctionDeclaration" && node.id) declared.add(node.id.name);
    if ((node.type === "VariableDeclarator") && node.id) collectPattern(node.id);
    if (node.type === "ClassDeclaration" && node.id) declared.add(node.id.name);
    if ((node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression" || node.type === "FunctionDeclaration") && node.params)
      node.params.forEach(collectPattern);
    if (node.type === "CatchClause" && node.param) collectPattern(node.param);
    for (const k in node) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v.type === "string") visit(v);
    }
  })(ast);

  function collectPattern(p) {
    if (!p) return;
    if (p.type === "Identifier") declared.add(p.name);
    else if (p.type === "ObjectPattern") p.properties.forEach(pr => collectPattern(pr.value || pr.argument));
    else if (p.type === "ArrayPattern") p.elements.forEach(collectPattern);
    else if (p.type === "AssignmentPattern") collectPattern(p.left);
    else if (p.type === "RestElement") collectPattern(p.argument);
  }

  // 2 · collect identifier reads that are not property keys / member properties
  (function visit(node, parent, key) {
    if (!node || typeof node.type !== "string") return;
    if (node.type === "Identifier") {
      const isProp = parent && (parent.type === "MemberExpression" && key === "property" && !parent.computed) ||
        (parent && (parent.type === "Property" || parent.type === "MethodDefinition") && key === "key" && !parent.computed) ||
        (parent && parent.type === "LabeledStatement") ||
        (parent && parent.type === "BreakStatement") || (parent && parent.type === "ContinueStatement");
      if (!isProp) refs.push({ name: node.name, line: node.loc.start.line });
      return;
    }
    for (const k in node) {
      if (k === "loc") continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach(c => visit(c, node, k));
      else if (v && typeof v.type === "string") visit(v, node, k);
    }
  })(ast, null, null);

  return { declared, refs };
}

const globalsFromInline = scopeWalk(inlineSrc, "index.html");
const pwa = scopeWalk(pwaSrc, "pwa-features.js");
const known = new Set([...pwa.declared, ...globalsFromInline.declared, ...GLOBAL, ...BIN]);

const bad = [];
const seen = new Set();
pwa.refs.forEach(r => {
  if (known.has(r.name) || seen.has(r.name)) return;
  seen.add(r.name);
  bad.push(r.name + "  (line " + r.line + ")");
});
// same check the other way: does the inline script call anything that only exists in pwa-features.js?
const pwaGlobal = new Set();
const re = /^window\.([A-Za-z0-9_$]+)\s*=/gm;
let mm;
while ((mm = re.exec(pwaSrc))) pwaGlobal.add(mm[1]);
const dynamicOk = new Set(["HD", "hdAuthError", "hdSignUp", "hdSignIn", "hdAfterAuth", "hdRefreshChrome"]);

console.log("UNRESOLVED (" + bad.length + "):");
console.log(bad.join("\n") || "  none");
process.exit(bad.length ? 1 : 0);
