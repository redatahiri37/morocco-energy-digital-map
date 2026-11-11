#!/usr/bin/env node
/* Checks power plants against the WRI Global Power Plant Database: the same
 * pinned file (commit and sha256) scripts/build-country-open-data.py builds
 * the open-data countries from.
 *
 * A plant is checked when it names its WRI record:
 *   - `gppd_id` on a hand-curated plant (Morocco), or
 *   - an `id` that is a WRI record id (the countries built from WRI).
 * For each one: the record exists, the capacity is within TOLERANCE of WRI's,
 * the point is within MAX_KM of WRI's, and the fuel matches. A plant whose
 * capacity really differs (an extension WRI predates) says so with
 * `gppd_capacity_note` and is reported, not failed.
 *
 * Hand-typed capacities went wrong before (Moroccan dams at 232, 256 and
 * 432 MW for 128, 135 and 40.6) with nothing to catch it: this is that check.
 *
 *   node scripts/check-gppd.mjs              downloads to scripts/.cache once
 *   node scripts/check-gppd.mjs --self-test  also proves each check fires
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const URL_ = "https://raw.githubusercontent.com/wri/global-power-plant-database/" +
  "7a91cfbb2a4e272597acbc00506d61fc1ec73b3d/output_database/global_power_plant_database.csv";
const SHA256 = "4b1f93e0fd93664f18684d9b05d0a52ed9658c6a8cf0d21ff2520791379ba7fc";   // as in build-country-open-data.py
const CACHE = join(ROOT, "scripts/.cache");
const TOLERANCE = 0.10;   // capacity, relative
const MAX_KM = 15;        // position
// WRI's fuel → ours. Storage (pumped hydro) counts as hydro.
const FUEL = { Solar: "solar", Wind: "wind", Hydro: "hydro", Storage: "hydro", Coal: "coal", Gas: "gas",
  Oil: "oil", Nuclear: "nuclear", Geothermal: "geothermal", Biomass: "biomass", Waste: "waste" };

async function gppd() {
  const file = join(CACHE, "gppd.csv");
  if (!existsSync(file)) {
    mkdirSync(CACHE, { recursive: true });
    console.log(`downloading ${URL_}`);
    const r = await fetch(URL_);
    if (!r.ok) throw new Error(`GPPD download: HTTP ${r.status}`);
    writeFileSync(file + ".part", Buffer.from(await r.arrayBuffer()));
    renameSync(file + ".part", file);
  }
  const buf = readFileSync(file);
  const got = createHash("sha256").update(buf).digest("hex");
  if (got !== SHA256) throw new Error(`${file}: sha256 ${got}, expected ${SHA256}. Delete it and rerun.`);
  const rows = parseCsv(buf.toString("utf8"));
  const head = rows.shift();
  const col = (n) => head.indexOf(n);
  const [id, name, cap, lat, lon, fuel] = ["gppd_idnr", "name", "capacity_mw", "latitude", "longitude", "primary_fuel"].map(col);
  return new Map(rows.filter((r) => r.length > fuel).map((r) => [r[id], { name: r[name], mw: +r[cap], lat: +r[lat], lon: +r[lon], fuel: r[fuel] }]));
}
function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const km = (a, b) => {
  const r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

// Returns [failures, notes, checked] for one country's plants.
function check(country, features, ref) {
  const fail = [], note = []; let n = 0;
  for (const f of features) {
    const p = f.properties || {};
    const wid = p.gppd_id || (ref.has(p.id) ? p.id : null);
    if (!wid) continue;
    const w = ref.get(wid), at = `${country} ${p.id} (${p.name})`;
    if (!w) { fail.push(`${at}: gppd_id ${wid} is not in the WRI database`); continue; }
    n++;
    const dev = Math.abs(p.capacity_mw - w.mw) / w.mw;
    if (!(dev <= TOLERANCE)) {
      const msg = `${at}: ${p.capacity_mw} MW, WRI ${wid} says ${w.mw} MW (${Math.round(dev * 100)} % off)`;
      if (p.gppd_capacity_note) note.push(`${msg}: ${p.gppd_capacity_note}`); else fail.push(msg);
    }
    const d = km(f.geometry.coordinates, [w.lon, w.lat]);
    if (d > MAX_KM) fail.push(`${at}: ${d.toFixed(1)} km from WRI ${wid}'s point`);
    if (FUEL[w.fuel] && FUEL[w.fuel] !== p.fuel_type && !(p.fuel_type === "waste" && FUEL[w.fuel] === "biomass"))
      fail.push(`${at}: fuel ${p.fuel_type}, WRI ${wid} says ${w.fuel}`);
  }
  return [fail, note, n];
}

const ref = await gppd();
const data = join(ROOT, "docs/data");
let failures = 0, checked = 0;
const plants = {};
for (const country of readdirSync(data)) {
  const file = join(data, country, "power-plants.geojson");
  if (!existsSync(file)) continue;
  plants[country] = JSON.parse(readFileSync(file, "utf8")).features;
  const [fail, note, n] = check(country, plants[country], ref);
  for (const m of fail) console.error("FAIL  " + m);
  for (const m of note) console.log("note  " + m);
  failures += fail.length; checked += n;
}
console.log(`${failures ? "    " : "ok  "}  ${checked} plants checked against WRI GPPD v1.3 (capacity ±${TOLERANCE * 100} %, ${MAX_KM} km, fuel)`);

if (process.argv.includes("--self-test")) {
  // Each defect reintroduced on a copy of Morocco's plants must fail.
  const ma = plants.morocco;
  const dam = ma.find((f) => f.properties.id === "idriss-1er-dam");
  const cases = [
    ["capacity typed wrong (432 for 40.6)", { capacity_mw: 432 }, null, /40\.6 MW/],
    ["point moved off the dam", {}, [-4.555, 34.198], /km from WRI/],
    ["wrong fuel", { fuel_type: "gas" }, null, /fuel gas/],
    ["unknown WRI id", { gppd_id: "WRI0000000" }, null, /not in the WRI database/],
  ];
  for (const [name, props, xy, expect] of cases) {
    const copy = { ...dam, properties: { ...dam.properties, ...props }, geometry: xy ? { ...dam.geometry, coordinates: xy } : dam.geometry };
    const [fail] = check("morocco", [copy], ref);
    const ok = fail.some((m) => expect.test(m));
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  self-test: ${name}${ok ? "" : " (not caught)"}`);
  }
  const [clean] = check("morocco", [dam], ref);
  if (clean.length) { failures++; console.log("FAIL  self-test: the unmodified dam must pass"); }
}
process.exit(failures ? 1 : 0);
