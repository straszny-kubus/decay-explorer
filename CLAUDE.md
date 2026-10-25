# Decay Chain Explorer — project notes

Mobile-first web app: pick a radioactive isotope, scrub through time, see its decay chain's composition
(atoms / mass / activity), total activity in Bq, equilibrium time and when every atom is stable.
User-facing docs and commands are in README.md; this file is the context for continuing development.

## Where it lives

- Repo: `git@github.com:straszny-kubus/decay-explorer.git` (public, `main`). Push over SSH works from this machine; `gh` is not installed.
- Live: https://straszny-kubus.github.io/decay-explorer/ — every push to `main` redeploys (`.github/workflows/pages.yml`).
- Also a private Claude Artifact: https://claude.ai/artifact/JjEFZbYS34BJCse1ENVFAJ — republish `index.html` with `nuclides.json` as a supporting file after UI changes.
- In the user's own terminal `node` may not be on PATH; full path: `C:\Program Files\nodejs\node.exe`.

## Architecture

- **`index.html` is the whole app** and is written as an Artifact page body: no `<!doctype>`, `<html>`, `<head>` or `<body>`. Keep it that way so it can still be published as an Artifact. `tools/build-site.js` wraps it in a full document (meta tags, manifest, service-worker registration) for the standalone site. No framework, no build step for the page itself, no dependencies.
  - `<script id="core">` holds data loading and the solver: pure functions, no DOM. `tools/check-solver.js` extracts and runs this block in Node, so keep it DOM-free.
  - The second `<script>` is formatting, UI, the time controls and the isotope picker.
  - CSS colours are tokens on `:root` with light and dark sets. Tile colours follow the Karlsruhe nuclide chart: α yellow, β⁻ blue, EC/β⁺ red, fission green, p orange, n light blue, IT white, stable black.
- **Data:** `data/iaea-ground-states.csv` (IAEA LiveChart download) → `tools/build-data.js` → `nuclides.json` (~181 KB).
  Rows are `[id, Z, halfLife_s | null, atomicMass_u, [[mode, branch, daughterId], ...]]`.
  - β-delayed modes (B-N, ECP, …) are subsets of their parent β branch, so they are subtracted from it.
  - Branches with no published % share whatever the known ones leave; branches below 0.0001 % are dropped.
  - "IT" listed on a ground state would be a self-loop, so it is dropped.
  - Hand-added: isomers Pa-234m, Ba-137m, Tc-99m (`ISOMERS`) and Zr-96's 2β⁻ (`MISSING_DECAYS`).
  - `loadDB` renormalises branches, because rounding in the file can sum to 0.999999.
  - Spontaneous fission → a per-parent sink node `SF:<parent>` ("fission products", not followed further).
  - A nuclide with a half-life but no decay mode ends its chain (λ treated as 0).
- **Solver:** N(t) = exp(A·t)·N(0). For each chain, `buildChain` precomputes exp(A·2^k) for every k from below the fastest decay to beyond the slowest. The smallest level comes from uniformization (a Taylor series of a non-negative matrix), the rest by repeated squaring, with **the diagonal set exactly to e^(−λ·2^k) at every level**. `evaluate(t)` multiplies the levels matching the binary digits of t (≤ ~53 matrix-vector products, ~0.5 ms on the largest chain).
  - Don't go back to the closed-form Bateman solution: it lost up to 80 % of atoms in long chains with near-equal half-lives.
  - Don't square the diagonal: e^(−λh) rounds to 1 for slow nuclides.
- **Derived quantities:**
  - "Every atom stable" = bisection for the time when the expected number of radioactive atoms drops to 1.
  - Equilibrium = the activity/parent-activity ratio levels off (within 1 %, for at least a decade of time) before 99.9 % of the parent has decayed. Otherwise there is no equilibrium chip.
- **Display order:** the main path follows the largest branch from the root; other nuclides are indented under their main feeder (`displayOrder`).
- **PWA:** `pwa/manifest.webmanifest`, `pwa/sw.js` (cache-first for app files, cache name stamped with a content hash by `build-site.js`; Google Fonts cached on first use), `pwa/_headers` (Cloudflare only). Icons are drawn by `tools/make-icons.js` (first five U-238 steps on the chart of nuclides), with no image libraries.

## Facts that surprise people

- **1 g of U-238:** the last radioactive atom goes after ~9×10²⁰ yr, not ~3×10¹¹ yr. Tl-210 has a 0.007 % β⁻n branch → Pb-209 → Bi-209 (T½ 2×10¹⁹ yr), which leaves ~4×10¹³ Bi-209 atoms. This is correct per the data; the page names this straggler.
- **Mass shares** count heavy atoms only; emitted α particles, neutrons and protons are assumed to leave the sample.

## Working on it

```bash
node tools/serve.js 8123          # source version, F5 after each save (no service worker)
node tools/build-site.js          # build site/
node tools/serve.js 8124 site     # built PWA; in Chrome DevTools > Application > Service workers tick "Update on reload"
node tools/check-solver.js        # solver regression checks (~20 s); run after touching the solver or data
node tools/build-data.js          # rebuild nuclides.json
```

`.claude/launch.json` has preview configs `decay` (8123) and `decay-site` (8124).

## Known limitations / possible next steps

- Only isomers listed in `ISOMERS` exist. Others, and which isomer each decay feeds, would need the IAEA `levels` endpoint per nuclide. Example: Am-242m isn't selectable.
- Fission products aren't followed; a fission-yield table would be needed.
- Only a pure single-isotope sample at t = 0. Mixtures (e.g. natural uranium: 99.27 % U-238 + 0.72 % U-235 + U-234 in equilibrium) would need several roots solved together.
- No decay energy, dose or radiation-type split (α/β/γ) yet. Activity is decays per second only.
- The Z–N chart view (pinch-zoom nuclide chart) and the stacked-area history chart, proposed at the start, are not built.
