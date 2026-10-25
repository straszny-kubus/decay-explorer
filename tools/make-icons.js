// Draws the app icon: the first five steps of the uranium series as they sit on the chart of nuclides
// (U-238 → Th-234 → Pa-234m → U-234 → Th-230), tiles colored by decay mode. Writes SVG and PNGs to icons/.
// Usage: node tools/make-icons.js
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OUT = path.join(__dirname, "..", "icons");
const BG = "#141a23", CELL = "#222b38", ALPHA = "#f0c419", BETA = "#4a97eb";
// [neutron offset, proton offset (down = fewer protons), color] relative to U-238
const STEPS = [[6, 0, ALPHA], [4, 2, BETA], [3, 1, BETA], [2, 0, ALPHA], [0, 2, ALPHA]];

// Shapes in a 512×512 space. full = background fills the square (maskable / apple-touch), else a rounded tile.
function shapes({ unit, full }) {
  const tile = unit * 0.9, w = 6 * unit + tile, h = 2 * unit + tile;
  const x0 = 256 - w / 2, y0 = 256 - h / 2;
  const list = [{ x: 0, y: 0, w: 512, h: 512, r: full ? 0 : 104, color: BG }];
  // empty chart cells behind the chain
  for (let n = 0; n <= 6; n++) for (let z = 0; z <= 2; z++) list.push({ x: x0 + n * unit, y: y0 + z * unit, w: tile, h: tile, r: tile * 0.16, color: CELL });
  for (const [n, z, color] of STEPS) list.push({ x: x0 + n * unit, y: y0 + z * unit, w: tile, h: tile, r: tile * 0.16, color });
  return list;
}

function inside(s, px, py) {
  if (px < s.x || px > s.x + s.w || py < s.y || py > s.y + s.h) return false;
  const dx = Math.max(s.x + s.r - px, 0, px - (s.x + s.w - s.r));
  const dy = Math.max(s.y + s.r - py, 0, py - (s.y + s.h - s.r));
  return dx * dx + dy * dy <= s.r * s.r;
}
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

// 4×4 supersampled rasterizer → RGBA
function raster(list, size) {
  const px = Buffer.alloc(size * size * 4), k = 512 / size, SS = 4;
  const cols = list.map(s => rgb(s.color));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const X = (x + (sx + 0.5) / SS) * k, Y = (y + (sy + 0.5) / SS) * k;
      for (let i = list.length - 1; i >= 0; i--) if (inside(list[i], X, Y)) { r += cols[i][0]; g += cols[i][1]; b += cols[i][2]; a++; break; }
    }
    const o = (y * size + x) * 4;
    if (a) { px[o] = r / a; px[o + 1] = g / a; px[o + 2] = b / a; px[o + 3] = 255 * a / (SS * SS); }
  }
  return px;
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = buf => { let c = -1; for (const byte of buf) c = CRC[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(rgba, size) {
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0); head.writeUInt32BE(size, 4);
  head[8] = 8; head[9] = 6;   // 8-bit RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", zlib.deflateSync(rows, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
function svg(list) {
  const f = v => +v.toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${list.map(s =>
    `<rect x="${f(s.x)}" y="${f(s.y)}" width="${f(s.w)}" height="${f(s.h)}" rx="${f(s.r)}" fill="${s.color}"/>`).join("")}</svg>\n`;
}

fs.mkdirSync(OUT, { recursive: true });
const any = shapes({ unit: 64, full: false });
const masked = shapes({ unit: 49, full: true });   // fits the maskable safe zone (circle of radius 205)
const files = {
  "icon.svg": svg(any),
  "icon-192.png": png(raster(any, 192), 192),
  "icon-512.png": png(raster(any, 512), 512),
  "icon-maskable-512.png": png(raster(masked, 512), 512),
  "apple-touch-icon.png": png(raster(shapes({ unit: 58, full: true }), 180), 180),
};
for (const [name, data] of Object.entries(files)) fs.writeFileSync(path.join(OUT, name), data);
console.log("wrote", Object.keys(files).join(", "), "→", OUT);
