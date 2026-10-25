// Converts the IAEA LiveChart ground-state table into the compact nuclides.json the app loads.
// Usage: node tools/build-data.js [data/iaea-ground-states.csv] [nuclides.json]
// Source CSV: https://nds.iaea.org/relnsd/v1/data?fields=ground_states&nuclides=all
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = process.argv[2] || path.join(ROOT, "data", "iaea-ground-states.csv");
const OUT = process.argv[3] || path.join(ROOT, "nuclides.json");
const MIN_BRANCH = 1e-6;   // drop branches below 0.0001 %

// Change in (Z, A) for each decay mode. null = spontaneous fission (ends in fission products).
const PRIMARY = {
  "B-": [1, 0], "2B-": [2, 0], "EC+B+": [-1, 0], "EC": [-1, 0], "B+": [-1, 0], "2EC": [-2, 0], "2B+": [-2, 0],
  "A": [-2, -4], "P": [-1, -1], "2P": [-2, -2], "N": [0, -1], "2N": [0, -2], "IT": [0, 0], "SF": null,
  "SF+EC+B+": [-1, 0],
  "14C": [-6, -14], "24NE": [-10, -24], "{+24}Ne": [-10, -24], "{+22}Ne": [-10, -22], "{+25}Ne": [-10, -25],
  "Mg": [-12, -28], "34SI": [-14, -34], "{+34}Si": [-14, -34],
};
// Beta-delayed modes are a subset of their parent beta branch: [parent mode family, dZ, dA]
const DELAYED = {
  "B-N": ["B-", 1, -1], "B-2N": ["B-", 1, -2], "B-3N": ["B-", 1, -3], "B-4N": ["B-", 1, -4], "B-5N": ["B-", 1, -5],
  "B-6N": ["B-", 1, -6], "B-7N": ["B-", 1, -7], "B-P": ["B-", 0, -1], "B-A": ["B-", -1, -4], "B-SF": ["B-", null],
  "ECP": ["EC", -2, -1], "B+P": ["EC", -2, -1], "EC2P": ["EC", -3, -2], "B+2P": ["EC", -3, -2],
  "ECA": ["EC", -3, -4], "B+A": ["EC", -3, -4], "ECSF": ["EC", null],
};
const family = m => (m === "B-" ? "B-" : ["EC+B+", "EC", "B+", "SF+EC+B+"].includes(m) ? "EC" : null);

// Isomers missing from a ground-state table but important for well-known chains (ENSDF values).
// feeds: which parent decay is redirected to the isomer, and what share of it.
const ISOMERS = [
  { id: "Pa-234m", Z: 91, A: 234, hl: 69.54, decays: [["B-", 0.9984, "U-234"], ["IT", 0.0016, "Pa-234"]], feeds: { from: "Th-234", mode: "B-", share: 1 } },
  { id: "Ba-137m", Z: 56, A: 137, hl: 153.12, decays: [["IT", 1, "Ba-137"]], feeds: { from: "Cs-137", mode: "B-", share: 0.947 } },
  { id: "Tc-99m",  Z: 43, A: 99,  hl: 21624.12, decays: [["IT", 0.99996, "Tc-99"], ["B-", 0.00004, "Ru-99"]], feeds: { from: "Mo-99", mode: "B-", share: 0.876 } },
];

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0].split(",");
  return lines.slice(1).map(l => {
    const v = l.split(","), o = {};
    head.forEach((h, i) => (o[h] = v[i] ?? ""));
    return o;
  });
}
const sig = (x, p) => +x.toPrecision(p);

const rows = parseCsv(fs.readFileSync(SRC, "utf8"));
const byZA = new Map();
const nuclides = new Map();
for (const r of rows) {
  const Z = +r.z, A = +r.z + +r.n;
  if (Z === 0) continue;   // free neutron clusters
  const stable = r.half_life === "STABLE";
  const hl = parseFloat(r.half_life_sec);
  if (!stable && !(hl > 0)) continue;   // half-life unknown
  const id = `${r.symbol}-${A}`;
  const nu = { id, Z, A, el: r.symbol, hl: stable ? null : sig(hl, 5), m: r.atomic_mass ? sig(+r.atomic_mass / 1e6, 9) : A, raw: [] };
  for (const k of ["1", "2", "3"]) {
    const mode = r[`decay_${k}`];
    if (!mode) continue;
    const p = r[`decay_${k}_%`];
    nu.raw.push({ mode, p: p === "" ? null : parseFloat(p) });
  }
  nuclides.set(id, nu);
  byZA.set(`${Z}:${A}`, nu);
}

const stats = { unknownMode: new Map(), missingDaughter: 0, guessed: 0 };
for (const nu of nuclides.values()) {
  if (nu.hl === null) { nu.decays = []; continue; }
  const primary = [], delayed = [];
  for (const d of nu.raw) {
    if (d.mode in PRIMARY) primary.push(d);
    else if (d.mode in DELAYED) delayed.push(d);
    else stats.unknownMode.set(d.mode, (stats.unknownMode.get(d.mode) || 0) + 1);
  }
  // branches with no published percentage share whatever the known ones leave
  const known = primary.filter(d => d.p !== null).reduce((s, d) => s + d.p, 0);
  const unknown = primary.filter(d => d.p === null);
  if (unknown.length) {
    stats.guessed++;
    const rest = known < 100 ? 100 - known : 100 / (primary.length);
    unknown.forEach(d => (d.p = rest / unknown.length));
  }
  const out = [];
  for (const d of primary) out.push({ mode: d.mode, p: d.p, dza: PRIMARY[d.mode] });
  for (const d of delayed) {
    if (d.p === null) continue;
    const [fam, dZ, dA] = DELAYED[d.mode];
    const parent = out.find(o => family(o.mode) === fam);
    if (parent) parent.p = Math.max(0, parent.p - d.p);
    out.push({ mode: d.mode, p: d.p, dza: dZ === null ? null : [dZ, dA] });
  }
  const total = out.reduce((s, d) => s + d.p, 0);
  nu.decays = [];
  for (const d of out) {
    const b = total > 0 ? d.p / total : 0;
    if (b < MIN_BRANCH) continue;
    let to = "SF";
    if (d.dza) {
      const dn = byZA.get(`${nu.Z + d.dza[0]}:${nu.A + d.dza[1]}`);
      if (!dn) { stats.missingDaughter++; continue; }
      if (dn === nu) continue;   // "IT" listed on a ground state: no change of nuclide
      to = dn.id;
    }
    nu.decays.push([d.mode, b, to]);
  }
  const kept = nu.decays.reduce((s, d) => s + d[1], 0);
  nu.decays.forEach(d => (d[1] = sig(d[1] / kept, 6)));
}

// Decay modes known from ENSDF but missing from the ground-state table.
const MISSING_DECAYS = { "Zr-96": [["2B-", 1, "Mo-96"]] };
for (const [id, decays] of Object.entries(MISSING_DECAYS)) if (!nuclides.get(id).decays.length) nuclides.get(id).decays = decays;

for (const iso of ISOMERS) {
  const ground = nuclides.get(iso.id.replace(/m$/, ""));
  nuclides.set(iso.id, { id: iso.id, Z: iso.Z, A: iso.A, el: ground.el, hl: iso.hl, m: ground.m, decays: iso.decays });
  const parent = nuclides.get(iso.feeds.from);
  const d = parent.decays.find(x => x[0] === iso.feeds.mode);
  const b = d[1] * iso.feeds.share;
  d[1] = sig(d[1] - b, 6);
  parent.decays.push([iso.feeds.mode, sig(b, 6), iso.id]);
  parent.decays = parent.decays.filter(x => x[1] > 0);
}

// Compact rows: [id, Z, halfLifeSeconds|null, atomicMass, [[mode, branch, daughterId], ...]]
const list = [...nuclides.values()].sort((a, b) => a.Z - b.Z || a.A - b.A || a.id.length - b.id.length);
const json = {
  source: "IAEA LiveChart of Nuclides (ENSDF / NUBASE), ground states extracted " + (rows[0].Extraction_date || "?"),
  fields: ["id", "Z", "halfLife_s", "atomicMass_u", "decays[mode, branch, daughter]"],
  nuclides: list.map(n => [n.id, n.Z, n.hl, n.m, n.decays]),
};
fs.writeFileSync(OUT, JSON.stringify(json));

console.log(`${list.length} nuclides (${list.filter(n => n.hl === null).length} stable) → ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
console.log(`branch percentages filled in for ${stats.guessed} nuclides; ${stats.missingDaughter} branches dropped (daughter not in table)`);
if (stats.unknownMode.size) console.log("unhandled modes:", Object.fromEntries(stats.unknownMode));
