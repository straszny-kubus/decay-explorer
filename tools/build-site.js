// Builds the deployable site into site/: a full HTML document around index.html (which is written as an
// Artifact page body), plus the PWA manifest, service worker, icons and nuclide table.
// Usage: node tools/build-site.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "site");
const read = rel => fs.readFileSync(path.join(ROOT, rel));

const COPY = ["nuclides.json", "pwa/manifest.webmanifest:manifest.webmanifest", "pwa/_headers:_headers",
  ...fs.readdirSync(path.join(ROOT, "icons")).map(f => `icons/${f}`)];

const page = read("index.html").toString();
const hash = crypto.createHash("sha256");
hash.update(page);
for (const entry of COPY) hash.update(read(entry.split(":")[0]));
const version = hash.digest("hex").slice(0, 10);

// The Artifact host adds charset, viewport and a small reset; a standalone site has to bring its own.
// No </head> or <body>: the page's own <title>, <meta> and <style> then stay in the head.
const HEAD = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Pick a radioactive isotope and watch its decay chain unfold: composition, activity and when every atom becomes stable.">
<meta name="theme-color" content="#eceff3" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0c1117" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Decay Chains">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon.svg" type="image/svg+xml">
<link rel="icon" href="icons/icon-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<style>:root { padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); } img { max-width: 100%; }</style>
`;
const FOOT = `
<script>
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
</script>
`;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "icons"), { recursive: true });
fs.writeFileSync(path.join(OUT, "index.html"), HEAD + page + FOOT);
fs.writeFileSync(path.join(OUT, "sw.js"), read("pwa/sw.js").toString().replace('"__VERSION__"', `"${version}"`));
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");   // GitHub Pages: serve files as they are
for (const entry of COPY) {
  const [from, to = from] = entry.split(":");
  fs.copyFileSync(path.join(ROOT, from), path.join(OUT, to));
}
console.log(`site/ built, version ${version}: ${fs.readdirSync(OUT).join(", ")}`);
