#!/usr/bin/env node
/* Checks the map's fuel colours (FUEL_COLORS in docs/app.js), in each theme:
 *   - lightness inside the theme's band and enough chroma to read as a hue
 *     (OKLCH L 0.43–0.77 light, 0.48–0.67 dark; C >= 0.10);
 *   - 3:1 contrast with the panel, except the fuels in RELIEF, which rely on
 *     the labelled legend;
 *   - every two fuels that touch in some country's mix bar (from
 *     docs/data/<country>/mix.json, generation and capacity) differ by
 *     Delta E >= 15 to normal vision, and >= 6 under protanopia and
 *     deuteranopia (8 and up is the target; the bar has gaps and a labelled
 *     legend for the 6–8 band).
 * Delta E is the distance in OKLab x 100; colour blindness is simulated with
 * Machado, Oliveira & Fernandes (2009) at full severity. These are the checks
 * of the dataviz palette method the colours were chosen with.
 * On the map any two fuels can meet: their worst pair is reported, not gated
 * (nine hues can't all be that far apart; the legend filters to one fuel).
 *
 *   node scripts/check-fuel-palette.mjs
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SURFACE = { light: "#FFFFFF", dark: "#0B1426" };   // --bg-1, the panel behind the mix bar
const BAND = { light: [0.43, 0.77], dark: [0.48, 0.67] };
const RELIEF = { light: ["solar"], dark: [] };            // below 3:1, named in the legend

let errors = 0;
const fail = (msg) => { console.error("FAIL  " + msg); errors++; };

// ---- colour math --------------------------------------------------------------
const lin = (hex) => [1, 3, 5].map((i) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const lum = (hex) => { const [r, g, b] = lin(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
function oklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
          1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
          0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
const MACHADO = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
};
const seen = (hex, kind) => {
  const c = lin(hex);
  return kind ? MACHADO[kind].map((row) => Math.max(0, Math.min(1, row[0] * c[0] + row[1] * c[1] + row[2] * c[2]))) : c;
};
const deltaE = (a, b, kind) => { const p = oklab(seen(a, kind)), q = oklab(seen(b, kind)); return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const cvd = (a, b) => Math.min(deltaE(a, b, "protan"), deltaE(a, b, "deutan"));
const lc = (hex) => { const [L, a, b] = oklab(lin(hex)); return [L, Math.hypot(a, b)]; };

// ---- the palette, as app.js has it -------------------------------------------------
const app = readFileSync(join(ROOT, "docs/app.js"), "utf8");
const block = app.match(/const FUEL_COLORS = \{([\s\S]*?)\n  \};/);
if (!block) { fail("docs/app.js: no `const FUEL_COLORS = { light: {…}, dark: {…} };`"); process.exit(1); }
const palette = {};
for (const [, mode, body] of block[1].matchAll(/(light|dark):\s*\{([^}]*)\}/g))
  palette[mode] = Object.fromEntries([...body.matchAll(/(\w+):\s*"(#[0-9A-Fa-f]{6})"/g)].map((m) => [m[1], m[2]]));

// ---- which fuels touch in a mix bar -------------------------------------------------
const pairs = new Map();
const dataDir = join(ROOT, "docs/data");
for (const country of readdirSync(dataDir)) {
  const file = join(dataDir, country, "mix.json");
  if (!existsSync(file)) continue;
  const mix = JSON.parse(readFileSync(file, "utf8"));
  for (const key of ["generation_pct", "capacity_gw"]) {
    const run = mix.fuels.filter((f) => (f[key] || 0) > 0).map((f) => f.fuel);
    for (let i = 1; i < run.length; i++) pairs.set(run[i - 1] + "|" + run[i], [run[i - 1], run[i], country]);
  }
}

for (const mode of ["light", "dark"]) {
  const p = palette[mode], before = errors;
  if (!p) { fail(`FUEL_COLORS.${mode} missing`); continue; }
  const fuels = Object.keys(p);
  for (const f of fuels) {
    const [L, C] = lc(p[f]);
    if (L < BAND[mode][0] || L > BAND[mode][1]) fail(`${mode} ${f} ${p[f]}: lightness ${L.toFixed(3)} outside ${BAND[mode].join("–")}`);
    if (C < 0.10) fail(`${mode} ${f} ${p[f]}: chroma ${C.toFixed(3)} below 0.10 (reads as grey)`);
    const k = contrast(p[f], SURFACE[mode]);
    if (k < 3 && !RELIEF[mode].includes(f)) fail(`${mode} ${f} ${p[f]}: contrast ${k.toFixed(2)}:1 with ${SURFACE[mode]}, below 3:1`);
  }
  let worstN = [99], worstC = [99];
  for (const [a, b, country] of pairs.values()) {
    if (!p[a] || !p[b]) { fail(`${mode}: no colour for ${p[a] ? b : a} (${country}'s mix)`); continue; }
    const n = deltaE(p[a], p[b]), c = cvd(p[a], p[b]);
    if (n < 15) fail(`${mode} ${a}/${b} (side by side in ${country}'s bar): Delta E ${n.toFixed(1)}, below 15`);
    if (c < 6) fail(`${mode} ${a}/${b} (side by side in ${country}'s bar): colour-blind Delta E ${c.toFixed(1)}, below 6`);
    if (n < worstN[0]) worstN = [n, a, b];
    if (c < worstC[0]) worstC = [c, a, b];
  }
  let all = [99];
  for (let i = 0; i < fuels.length; i++) for (let j = i + 1; j < fuels.length; j++) {
    if (p[fuels[i]] === p[fuels[j]]) continue;   // a fuel folded into another (waste → bioenergy)
    const n = deltaE(p[fuels[i]], p[fuels[j]]);
    if (n < all[0]) all = [n, fuels[i], fuels[j]];
  }
  console.log(`${errors > before ? "    " : "ok  "}  ${mode}: ${fuels.length} fuels, ${pairs.size} bar neighbours; worst neighbours ` +
    `${worstN[1]}/${worstN[2]} ${worstN[0].toFixed(1)}, colour-blind ${worstC[1]}/${worstC[2]} ${worstC[0].toFixed(1)}` +
    `${worstC[0] >= 6 && worstC[0] < 8 ? " (6–8: gaps + legend)" : ""}; on the map ${all[1]}/${all[2]} ${all[0].toFixed(1)}`);
}
process.exit(errors ? 1 : 0);
