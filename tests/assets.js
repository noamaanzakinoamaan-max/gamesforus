/* Asset integrity: manifest icons exist, sw.js precache list matches disk,
   and every file referenced from index.html is present. */
const fs = require("fs");
const path = require("path");
const root = process.cwd();
const problems = [];

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
(manifest.icons || []).forEach(i => {
  const f = path.join(root, i.src.replace(/^\.\//, ""));
  if (!fs.existsSync(f)) problems.push("manifest icon missing: " + i.src);
});
(manifest.screenshots || []).forEach(i => {
  const f = path.join(root, i.src.replace(/^\.\//, ""));
  if (!fs.existsSync(f)) problems.push("manifest screenshot missing: " + i.src);
});
(manifest.shortcuts || []).forEach(s => {
  (s.icons || []).forEach(i => {
    const f = path.join(root, i.src.replace(/^\.\//, ""));
    if (!fs.existsSync(f)) problems.push("shortcut icon missing: " + i.src);
  });
});

const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const cacheBlock = sw.slice(sw.indexOf("PRECACHE"), sw.indexOf("]"));
const cached = [...cacheBlock.matchAll(/"\.\/([^"]+)"/g)].map(m => m[1]);
cached.forEach(rel => {
  if (!fs.existsSync(path.join(root, rel))) problems.push("precache target missing: " + rel);
});
["pwa-features.js", "pwa-features.css", "offline.html", "manifest.json"].forEach(f => {
  if (!cached.includes(f)) problems.push("not precached: " + f);
});

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const localRefs = [...html.matchAll(/(?:src|href)="((?!https?:|#|mailto:|tel:|upi:|data:)[^"?#]+)"/g)].map(m => m[1]);
[...new Set(localRefs)].forEach(rel => {
  if (rel.endsWith("/") || /[+$`]/.test(rel)) return;   /* template fragments */
  const f = path.join(root, rel);
  if (!fs.existsSync(f)) problems.push("index.html references missing file: " + rel);
});

console.log("PROBLEMS (" + problems.length + "):");
console.log(problems.join("\n") || "  none");
process.exit(problems.length ? 1 : 0);
