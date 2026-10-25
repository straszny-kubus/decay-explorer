// Regression checks for the decay solver in index.html. Run after changing the solver or the data:
//   node tools/check-solver.js
// 1. Every chain in nuclides.json conserves atoms (sum of fractions = 1) from 1 ps to "every atom stable".
// 2. Known physics for the uranium series and caesium-137.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const core = html.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
const api = new Function(`${core}; return { DB, loadDB, buildChain, evaluate, activityPerAtom, timeAllStable, timeEquilibrium, YEAR, NA };`)();
const { DB, loadDB, buildChain, evaluate, activityPerAtom, timeAllStable, timeEquilibrium, YEAR, NA } = api;
loadDB(JSON.parse(fs.readFileSync(path.join(ROOT, "nuclides.json"), "utf8")));

let failures = 0;
const check = (ok, label) => { console.log(`${ok ? "ok  " : "FAIL"} ${label}`); if (!ok) failures++; };

// 1. Conservation across all chains
const t0 = Date.now(), bad = [];
const roots = Object.values(DB).filter(n => isFinite(n.hl) && n.decays.length).map(n => n.id);
for (const id of roots) {
  const ch = buildChain(id), ts = timeAllStable(ch, NA / ch.nuclides[0].m);
  let worst = 0;
  for (let k = 0; k <= 60; k++) {
    const N = evaluate(ch, 10 ** (-12 + (Math.log10(ts) + 12) * k / 60));
    worst = Math.max(worst, Math.abs(N.reduce((a, b) => a + b, 0) - 1));
  }
  if (worst > 1e-9) bad.push(`${id} (${worst.toExponential(1)})`);
}
check(!bad.length, `atoms conserved in all ${roots.length} chains (${((Date.now() - t0) / 1000).toFixed(0)} s)${bad.length ? ": " + bad.slice(0, 10).join(", ") : ""}`);

// 2. Known physics
const u = buildChain("U-238"), i = id => u.ids.indexOf(id);
check(Math.abs(evaluate(u, u.nuclides[0].hl)[0] - 0.5) < 1e-12, "U-238: half remains after one half-life");
const Neq = evaluate(u, 1e7 * YEAR);
const ratio = activityPerAtom(u, Neq) / (u.lam[0] * Neq[0]);
check(Math.abs(ratio - 14) < 0.01, `U-238: equilibrium activity is 14× the parent's (got ${ratio.toFixed(4)})`);
const ra = (Neq[i("Ra-226")] / Neq[0]) / (u.lam[0] / u.lam[i("Ra-226")]);
check(Math.abs(ra - 1) < 1e-3, `U-238: Ra-226/U-238 matches half-life ratio (got ${ra.toFixed(5)})`);
const teq = timeEquilibrium(u, 0, timeAllStable(u, NA / 238.05)) / YEAR;
check(teq > 1.5e6 && teq < 2e6, `U-238: equilibrium after ~1.7 Myr (got ${(teq / 1e6).toFixed(2)} Myr)`);
const cs = buildChain("Cs-137"), bq = activityPerAtom(cs, evaluate(cs, 0)) * NA / cs.nuclides[0].m;
check(Math.abs(bq / 3.21e12 - 1) < 0.01, `Cs-137: 1 g = 3.21 TBq (got ${(bq / 1e12).toFixed(3)} TBq)`);

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
