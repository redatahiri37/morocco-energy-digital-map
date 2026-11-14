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
  ["layer source without its French", /sourceFr missing: "Global Energy Monitor · ONEE · operator disclosures"/,
    (d) => config(d, `delete window.COUNTRIES.morocco.layers[0].sourceFr;`)],
  ["boundary note without its French", /noteFr missing/,
    (d) => config(d, `delete window.COUNTRIES.egypt.boundary.noteFr;`)],
  ["mix source without its French", /source_fr missing/,
    (d) => editJson(d, `${MA}/mix.json`, (m) => { delete m.source_fr; })],
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
  ["siteGrid file missing", /siteGrid.*does not exist/,
    (d) => config(d, `window.COUNTRIES.morocco.siteGrid.file = "nope.geojson";`)],
  ["siteGrid line without numeric voltage", /siteGrid features must be lines with a numeric voltage_kv/,
    (d) => editJson(d, `${MA}/transmission-lines.geojson`, (fc) => { fc.features[0].properties.voltage_kv = "225"; })],
  ["boundary without provenance", /no `boundary` provenance/,
    (d) => config(d, `delete window.COUNTRIES.morocco.boundary;`)],
  ["broken JSON", /not valid JSON/,
    (d) => edit(d, `${MA}/industrial.geojson`, (s) => s.slice(0, -10))],
  ["live flow on a line that isn't there", /"interconnector-es-ma-9" is not the id of a grid feature/,
    (d) => config(d, `window.COUNTRIES.morocco.liveFlow.features = ["interconnector-es-ma-9"];`)],
  ["live flow path the Worker doesn't serve", /path must look like "\/flow\/<route>"/,
    (d) => config(d, `window.COUNTRIES.morocco.liveFlow.path = "https://evil.example/x";`)],
  ["demand figure as text", /figures must be \[\{ label, labelFr, value: number, unit \}\]/,
    (d) => config(d, `window.COUNTRIES.morocco.demand.figures[0].value = "8.4";`)],
  ["schema doc drift", /doesn't document required field `voltage_kv`/,
    (d) => edit(d, "DATA_SCHEMA.md", (s) => s.replaceAll("`voltage_kv`", "`voltage`"))],
  ["country without a French name", /labelFr missing/,
    (d) => config(d, `delete window.COUNTRIES.morocco.labelFr;`)],
  ["layer without a French title", /titleFr missing/,
    (d) => config(d, `delete window.COUNTRIES.morocco.layers[0].titleFr;`)],
  ["mix file missing", /mix\.json does not exist/,
    (d) => unlinkSync(join(d, `${MA}/mix.json`))],
  ["mix shares that don't add up", /generation shares add up to/,
    (d) => editJson(d, `${MA}/mix.json`, (m) => { m.fuels[0].generation_pct += 10; })],
  ["mix figure stored as text", /co2_intensity_g_per_kwh must be a number or null/,
    (d) => editJson(d, `${MA}/mix.json`, (m) => { m.co2_intensity_g_per_kwh = "<b>602</b>"; })],
  ["mix fuel the map can't colour", /fuel must be one of the schema's fuel types/,
    (d) => editJson(d, `${MA}/mix.json`, (m) => { m.fuels[0].fuel = "Other Fossil"; })],
  ["operator without a short name", /operators: bad entry/,
    (d) => config(d, `window.COUNTRIES.morocco.operators[0].short = "";`)],
  ["per-country colours, no longer read", /palette: is no longer read/,
    (d) => config(d, `window.COUNTRIES.morocco.palette = { sectors: { cement: "#A1A1AA" } };`)],
  ["water: dam drawn as a line", /a dam must be Point, got LineString/,
    (d) => editJson(d, `${MA}/dams.geojson`, (fc) => { fc.features[0].geometry = { type: "LineString", coordinates: [[-5, 33], [-5.1, 33.1]] }; })],
  ["water: unknown category", /category invalid: "reservoir"/,
    (d) => editJson(d, `${MA}/desalination.geojson`, (fc) => { fc.features[0].properties.category = "reservoir"; })],
  ["water: flow as a string", /flow_m3s must be a number/,
    (d) => editJson(d, `${MA}/water-transfers.geojson`, (fc) => { fc.features[0].properties.flow_m3s = "15"; })],
  ["lens naming a missing layer", /"rivers" is not a layer of morocco/,
    (d) => config(d, `window.COUNTRIES.morocco.lenses[1].layers.push("rivers");`)],
  ["lenses without the default", /needs an "energy" lens/,
    (d) => config(d, `window.COUNTRIES.morocco.lenses.shift();`)],
  ["basin drawn as a point", /geometry must be Polygon or MultiPolygon, got Point/,
    (d) => editJson(d, `${MA}/basins.geojson`, (fc) => { fc.features[0].geometry = { type: "Point", coordinates: [-6, 33] }; })],
  ["dam readings for an unknown feature", /"no-such-dam": is not the id of a feature/,
    (d) => editJson(d, `${MA}/dam-levels.json`, (x) => { x["no-such-dam"] = x["al-massira-dam"]; })],
  ["dam reading as text", /fill_pct must be a number/,
    (d) => editJson(d, `${MA}/dam-levels.json`, (x) => { x["al-massira-dam"].series[0].fill_pct = "75"; })],
  ["rain projection missing a percentile", /change_pct.2050.ssp585 must have numeric/,
    (d) => editJson(d, `${MA}/rain-projections.json`, (x) => { delete x.change_pct["2050"].ssp585.p10; })],
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
