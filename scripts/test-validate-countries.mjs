#!/usr/bin/env node
// Proves each check in validate-countries.mjs still fires: copies the repo's
// docs/ and DATA_SCHEMA.md to a temp dir, reintroduces one defect at a time,
// and asserts the validator fails with the expected message. A check with no
// case here can be deleted without anything noticing.

import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const VALIDATOR = join(ROOT, "scripts/validate-countries.mjs");

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "validate-countries-"));
  cpSync(join(ROOT, "docs"), join(dir, "docs"), { recursive: true });
  cpSync(join(ROOT, "DATA_SCHEMA.md"), join(dir, "DATA_SCHEMA.md"));
  return dir;
}
const run = (dir) => spawnSync(process.execPath, [VALIDATOR, dir], { encoding: "utf8" });
const edit = (dir, file, fn) => { const p = join(dir, file); writeFileSync(p, fn(readFileSync(p, "utf8"))); };
const editJson = (dir, file, fn) => edit(dir, file, (s) => { const d = JSON.parse(s); fn(d); return JSON.stringify(d); });
// Appended to the config, so cases don't depend on its exact formatting.
const config = (dir, js) => edit(dir, "docs/countries.config.js", (s) => s + "\n" + js + "\n");

const MA = "docs/data/morocco";
const cases = [
  ["unknown layer kind", /unknown kind "points"/,
    (d) => config(d, `window.COUNTRIES.morocco.layers[0].kind = "points";`)],
  ["file on a live layer", /oim-plants layers take file: null/,
    (d) => config(d, `window.COUNTRIES.morocco.layers.find(L => L.kind === "oim-plants").file = "x.geojson";`)],
  ["duplicate layer id", /duplicate layer id/,
    (d) => config(d, `window.COUNTRIES.morocco.layers[1].id = window.COUNTRIES.morocco.layers[0].id;`)],
  ["missing data file", /does not exist/,
    (d) => config(d, `window.COUNTRIES.morocco.layers[0].file = "nope.geojson";`)],
  ["enabled placeholder", /enabled but still marked placeholder/,
    (d) => config(d, `window.COUNTRIES_ENABLED.push("namibia");`)],
  ["point outside the country", /outside the country bounds/,
    (d) => editJson(d, `${MA}/power-plants.geojson`, (fc) => { fc.features[0].geometry.coordinates = [2.35, 48.85]; })],
  ["line that never enters the country", /never enters the country bounds/,
    (d) => editJson(d, `${MA}/interconnectors.geojson`, (fc) => { fc.features[0].geometry.coordinates = [[2, 48], [3, 49]]; })],
  ["grid status the renderer can't draw", /status invalid: "proposed"/,
    (d) => editJson(d, `${MA}/planned-corridors.geojson`, (fc) => { fc.features[0].properties.status = "proposed"; })],
  ["voltage stored under another name", /voltage_kv missing/,
    (d) => editJson(d, `${MA}/interconnectors.geojson`, (fc) => {
      const p = fc.features[0].properties; p.voltage = String(p.voltage_kv); delete p.voltage_kv; })],
  ["missing capacity", /capacity_mw missing/,
    (d) => editJson(d, `${MA}/power-plants.geojson`, (fc) => { delete fc.features[0].properties.capacity_mw; })],
  ["unknown fuel", /fuel_type invalid/,
    (d) => editJson(d, `${MA}/power-plants.geojson`, (fc) => { fc.features[0].properties.fuel_type = "HFO"; })],
  ["wrong geometry for kind", /geometry must be Point/,
    (d) => editJson(d, `${MA}/industrial.geojson`, (fc) => { fc.features[0].geometry = { type: "LineString", coordinates: [[-7, 33], [-7.1, 33.1]] }; })],
  ["duplicate feature id", /duplicate id/,
    (d) => editJson(d, `${MA}/digital.geojson`, (fc) => { fc.features[1].properties.id = fc.features[0].properties.id; })],
  ["boundary without provenance", /no `boundary` provenance/,
    (d) => config(d, `delete window.COUNTRIES.morocco.boundary;`)],
  ["broken JSON", /not valid JSON/,
    (d) => edit(d, `${MA}/industrial.geojson`, (s) => s.slice(0, -10))],
  ["schema doc drift", /doesn't document required field `voltage_kv`/,
    (d) => edit(d, "DATA_SCHEMA.md", (s) => s.replaceAll("`voltage_kv`", "`voltage`"))],
  ["schema doc missing", /DATA_SCHEMA.md: missing/,
    (d) => unlinkSync(join(d, "DATA_SCHEMA.md"))],
];

let failed = 0;
const base = sandbox();
const clean = run(base);
rmSync(base, { recursive: true, force: true });
if (clean.status !== 0) { console.log("FAIL  baseline: the unmodified repo must pass\n" + clean.stdout); failed++; }
else console.log("PASS  baseline passes");

for (const [name, expect, mutate] of cases) {
  const dir = sandbox();
  try {
    mutate(dir);
    const r = run(dir);
    const ok = r.status === 1 && expect.test(r.stdout);
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      exit ${r.status}, expected ${expect}\n${r.stdout}${r.stderr}`}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
console.log(failed ? `\n${failed} case(s) failed` : `\nall ${cases.length + 1} cases pass`);
process.exit(failed ? 1 : 0);
