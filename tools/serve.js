// Minimal static server for local testing: node tools/serve.js [port] [folder]
// folder defaults to the project root (serves index.html as written); pass "site" to preview the build.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = +process.argv[2] || 8123;
const ROOT = path.resolve(path.join(__dirname, ".."), process.argv[3] || ".");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript", ".css": "text/css",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml",
};

http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end("not found"); return; }
    const page = path.extname(file) === ".html" && !/^\s*<!doctype/i.test(data)
      ? Buffer.from('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' + data)
      : data;   // mimic the artifact skeleton for pages written without one
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" }).end(page);
  });
}).listen(PORT, () => console.log(`http://localhost:${PORT} → ${ROOT}`));
