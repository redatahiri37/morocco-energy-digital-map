#!/usr/bin/env node
// Validates every country in docs/countries.config.js and its GeoJSON
// against the data schema in DATA_SCHEMA.md. Exits 1 on any error.
//
//   node scripts/validate-countries.mjs          # the repo
//   node scripts/validate-countries.mjs <root>   # another checkout (used by the self-test)
//
// Errors are things that break the map (a layer that won't render, a point
// in the wrong country, a field the renderer reads that isn't there).
// Warnings are gaps worth tracking but not worth blocking a deploy.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import vm from "node:vm";

const ROOT = resolve(process.argv[2] || new URL("..", import.meta.url).pathname);
const DOCS = join(ROOT, "docs");

// ---------------------------------------------------------------------------
// The schema. DATA_SCHEMA.md documents exactly this; the drift check at the
// bottom fails if a required field below is missing from that document.
// ---------------------------------------------------------------------------
const KINDS = ["power", "grid", "industrial", "digital", "oim"];

const POINT_STATUS = ["operational", "construction", "announced", "planned", "idle"];
// The grid renderer only draws these three; any other status is invisible.
const GRID_STATUS = ["operational", "planned", "idle"];
const FUELS = ["solar", "wind", "hydro", "coal", "gas", "oil"];

const num = (v) => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v) => v === null || num(v);
const str = (v) => typeof v === "string" && v.trim() !== "";

// Per kind: geometry types, required fields (with a test), recommended fields.
export const SCHEMA = {
  power: {
    geometry: ["Point"],
    required: {
      name: str, status: (v) => POINT_STATUS.includes(v), source: str,
      capacity_mw: num, fuel_type: (v) => FUELS.includes(v),
    },
    recommended: ["id", "source_url", "precision", "commissioning_year", "operator", "region", "tech"],
  },
  grid: {
    geometry: ["LineString", "MultiLineString"],
    required: {
      name: str, status: (v) => GRID_STATUS.includes(v), source: str,
      voltage_kv: num,
    },
    recommended: ["id", "source_url", "precision", "kind"],
  },
  industrial: {
    geometry: ["Point"],
    required: {
      name: str, status: (v) => POINT_STATUS.includes(v), source: str,
      sector: str, estimated_demand_mw: numOrNull,
    },
    recommended: ["id", "source_url", "precision", "grid_connection"],
  },
  digital: {
    geometry: ["Point"],
    required: {
      name: str, status: (v) => POINT_STATUS.includes(v), source: str,
      operator: str, category: str, capacity_estimate_mw: numOrNull,
    },
    recommended: ["id", "source_url", "precision", "year", "investment_usd"],
  },
};

const errors = [], warnings = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

// ---------------------------------------------------------------------------
// Load the config the way the browser does.
// ---------------------------------------------------------------------------
const sandbox = { window: {} };
vm.runInNewContext(readFileSync(join(DOCS, "countries.config.js"), "utf8"), sandbox);
const COUNTRIES = sandbox.window.COUNTRIES || {};
const ENABLED = sandbox.window.COUNTRIES_ENABLED || [];

const isLngLat = (c) => Array.isArray(c) && c.length === 2 && num(c[0]) && num(c[1]) &&
  c[0] >= -180 && c[0] <= 180 && c[1] >= -90 && c[1] <= 90;
const isColor = (v) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
const inBounds = (c, b) => c[0] >= b[0][0] && c[0] <= b[1][0] && c[1] >= b[0][1] && c[1] <= b[1][1];
const vertices = (g) => g.type === "Point" ? [g.coordinates]
  : g.type === "LineString" ? g.coordinates
  : g.type === "MultiLineString" ? g.coordinates.flat()
  : g.type === "Polygon" ? g.coordinates.flat()
  : g.type === "MultiPolygon" ? g.coordinates.flat(2) : [];

for (const key of ENABLED) {
  if (!COUNTRIES[key]) fail("COUNTRIES_ENABLED", `"${key}" has no entry in COUNTRIES`);
  else if (COUNTRIES[key].placeholder) fail("COUNTRIES_ENABLED", `"${key}" is enabled but still marked placeholder`);
}

let checkedFeatures = 0;
for (const [key, c] of Object.entries(COUNTRIES)) {
  const at = `countries.${key}`;
  if (!/^[a-z][a-z0-9-]*$/.test(key)) fail(at, "key must be lowercase letters, digits and dashes");
  if (!str(c.label)) fail(at, "label missing");
  if (!/^[A-Z]{2}$/.test(c.iso || "")) fail(at, "iso must be a two-letter ISO 3166-1 code");
  if (!isLngLat(c.center)) fail(at, "center must be [lng, lat]");
  if (!num(c.zoom)) fail(at, "zoom must be a number");
  if (!str(c.dataPath) || !c.dataPath.startsWith("./data/") || !c.dataPath.endsWith("/"))
    fail(at, `dataPath must look like "./data/<key>/", got ${JSON.stringify(c.dataPath)}`);
  if (c.placeholder) continue;

  // --- a country with data ---------------------------------------------------
  const b = c.bounds;
  const boundsOk = Array.isArray(b) && b.length === 2 && isLngLat(b[0]) && isLngLat(b[1]) &&
    b[0][0] < b[1][0] && b[0][1] < b[1][1];
  if (!boundsOk) fail(at, "bounds must be [[west, south], [east, north]]");
  else if (!inBounds(c.center, b)) fail(at, "center is outside bounds");

  const dir = join(DOCS, c.dataPath);
  if (!existsSync(dir)) { fail(at, `dataPath ${c.dataPath} does not exist`); continue; }
  if (!Array.isArray(c.layers) || c.layers.length === 0) fail(at, "no layers");

  if (c.palette) {
    for (const p of c.palette.providers || [])
      if (!str(p.key) || !isColor(p.color) || !str(p.short)) fail(`${at}.palette.providers`, `bad entry ${JSON.stringify(p)}`);
    for (const [k, v] of Object.entries(c.palette.sectors || {}))
      if (!isColor(v)) fail(`${at}.palette.sectors`, `"${k}" colour must be #rrggbb`);
  }
  if (c.boundary && (!str(c.boundary.source) || !/^https:\/\//.test(c.boundary.sourceUrl || "")))
    fail(`${at}.boundary`, "needs source and an https sourceUrl");

  const referenced = new Set();
  const seenIds = new Set();
  for (const L of c.layers || []) {
    const lat = `${at}.layers.${L.id}`;
    if (!/^[a-z][a-z0-9-]*$/.test(L.id || "")) fail(lat, "id must be lowercase letters, digits and dashes");
    if (seenIds.has(L.id)) fail(lat, "duplicate layer id"); seenIds.add(L.id);
    if (!KINDS.includes(L.kind)) { fail(lat, `unknown kind "${L.kind}" (expected ${KINDS.join(" / ")})`); continue; }
    for (const f of ["title", "source", "updated"]) if (!str(L[f])) fail(lat, `${f} missing`);
    if (!/^https:\/\//.test(L.sourceUrl || "")) fail(lat, "sourceUrl must be an https URL");

    if (L.kind === "oim") { if (L.file) fail(lat, "oim layers take file: null"); continue; }
    if (!str(L.file)) { fail(lat, "file missing"); continue; }
    referenced.add(L.file);
    const path = join(dir, L.file);
    if (!existsSync(path)) { fail(lat, `${c.dataPath}${L.file} does not exist`); continue; }

    let fc;
    try { fc = JSON.parse(readFileSync(path, "utf8")); }
    catch (e) { fail(lat, `${L.file} is not valid JSON: ${e.message}`); continue; }
    if (fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) { fail(lat, `${L.file} is not a FeatureCollection`); continue; }
    if (fc.features.length === 0) warn(lat, `${L.file} has no features`);

    const schema = SCHEMA[L.kind];
    const featIds = new Set();
    const missingRec = {};
    fc.features.forEach((f, i) => {
      checkedFeatures++;
      const p = f.properties || {};
      const fat = `${c.dataPath}${L.file} #${i}${p.name ? ` "${p.name}"` : ""}`;
      const g = f.geometry;
      if (!g || !schema.geometry.includes(g.type)) { fail(fat, `geometry must be ${schema.geometry.join(" or ")}, got ${g && g.type}`); return; }
      const vs = vertices(g);
      if (!vs.every(isLngLat)) { fail(fat, "coordinates must be [lng, lat] in range"); return; }
      for (const [field, test] of Object.entries(schema.required))
        if (!test(p[field])) fail(fat, `${field} ${field in p ? `invalid: ${JSON.stringify(p[field])}` : "missing"}`);
      for (const field of schema.recommended) if (p[field] == null) missingRec[field] = (missingRec[field] || 0) + 1;
      if (p.id != null) { if (featIds.has(p.id)) fail(fat, `duplicate id "${p.id}"`); featIds.add(p.id); }
      if (p.source_url != null && !/^https?:\/\//.test(p.source_url)) fail(fat, "source_url must be an http(s) URL");
      if (boundsOk) {
        // Points must sit in the country. Lines may cross borders
        // (interconnectors, export corridors) but must touch it.
        if (g.type === "Point" && !inBounds(vs[0], b)) fail(fat, `point ${JSON.stringify(vs[0])} is outside the country bounds`);
        if (g.type !== "Point" && !vs.some((v) => inBounds(v, b))) fail(fat, "line never enters the country bounds");
      }
    });
    for (const [field, n] of Object.entries(missingRec))
      warn(lat, `${n}/${fc.features.length} features lack recommended field "${field}"`);
  }

  const bpath = join(dir, "boundary.geojson");
  if (existsSync(bpath)) {
    try {
      const bfc = JSON.parse(readFileSync(bpath, "utf8"));
      const types = (bfc.features || []).map((f) => f.geometry && f.geometry.type);
      if (!types.length || !types.every((t) => t === "Polygon" || t === "MultiPolygon"))
        fail(`${c.dataPath}boundary.geojson`, "must hold Polygon / MultiPolygon features");
      if (!c.boundary) fail(at, "has boundary.geojson but no `boundary` provenance entry in the config");
    } catch (e) { fail(`${c.dataPath}boundary.geojson`, `not valid JSON: ${e.message}`); }
  }

  for (const f of readdirSync(dir))
    if (f.endsWith(".geojson") && f !== "boundary.geojson" && !referenced.has(f)) {
      warn(at, `${c.dataPath}${f} is not referenced by any layer`);
      try { JSON.parse(readFileSync(join(dir, f), "utf8")); }  // still deployed, so still must parse
      catch (e) { fail(`${c.dataPath}${f}`, `not valid JSON: ${e.message}`); }
    }
}

// ---------------------------------------------------------------------------
// Drift check: every required field must be documented in DATA_SCHEMA.md.
// ---------------------------------------------------------------------------
const docPath = join(ROOT, "DATA_SCHEMA.md");
if (!existsSync(docPath)) fail("DATA_SCHEMA.md", "missing");
else {
  const sections = readFileSync(docPath, "utf8").split(/^## /m);
  const shared = sections.find((sec) => sec.startsWith("Fields shared")) || "";
  for (const [kind, s] of Object.entries(SCHEMA)) {
    const section = (sections.find((sec) => sec.startsWith(`\`${kind}\``)) || "");
    if (!section) { fail("DATA_SCHEMA.md", `no "## \`${kind}\`" section`); continue; }
    for (const field of Object.keys(s.required))
      if (!(section + shared).includes(`\`${field}\``)) fail("DATA_SCHEMA.md", `\`${kind}\` section doesn't document required field \`${field}\``);
  }
}

for (const w of warnings) console.log(`warn   ${w}`);
for (const e of errors) console.log(`ERROR  ${e}`);
const nCountries = Object.values(COUNTRIES).filter((c) => !c.placeholder).length;
console.log(`\n${nCountries} countries with data, ${checkedFeatures} features checked: ` +
  `${errors.length} error(s), ${warnings.length} warning(s).`);
process.exit(errors.length ? 1 : 0);
