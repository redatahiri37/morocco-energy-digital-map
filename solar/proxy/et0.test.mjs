/* /et0 tests — `node et0.test.mjs` from this directory. The FAO-56 maths
 * against the paper's own worked example, then the route with a synthetic
 * typical year (the real one is 1.3 MB) and a mocked PVGIS.
 */
import worker from "./worker.js";
import { esat, extraterrestrial, et0Day, monthlyEt0 } from "./et0.js";

let fail = 0;
const ok = (name, cond, extra = "") => { console.log((cond ? "PASS" : "FAIL") + " — " + name + (extra ? "  " + extra : "")); if (!cond) fail++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// FAO-56 worked examples
ok("e°(24.5 °C) = 3.075 kPa (ex. 3)", near(esat(24.5), 3.075, 0.002), esat(24.5).toFixed(3));
ok("Ra at 20°S, 3 Sept = 32.2 MJ (ex. 8)", near(extraterrestrial(-20, 246), 32.2, 0.1), extraterrestrial(-20, 246).toFixed(2));
const ex18 = et0Day({ tmax: 21.5, tmin: 12.3, ea: 1.409, rs: 22.07, u2: 2.078, p: 100.1, ra: extraterrestrial(50.8, 187), z: 100 });
ok("Uccle, 6 July: ET₀ = 3.9 mm/day (ex. 18)", near(ex18, 3.9, 0.05), ex18.toFixed(2));

// Synthetic typical year at 31.6°N: hot dry summers, mild winters.
function syntheticTmy({ hours = 8760, lat = 31.63 } = {}) {
  const rows = [];
  const start = Date.UTC(2015, 0, 1);
  for (let h = 0; h < hours; h++) {
    const d = new Date(start + h * 3600e3);
    const doy = Math.floor(h / 24) + 1, hr = d.getUTCHours();
    const season = -Math.cos((2 * Math.PI * (doy - 15)) / 365);           // −1 Jan … +1 Jul
    const day = Math.max(0, Math.sin((Math.PI * (hr - 6)) / 12));         // 6 h → 18 h
    const p = (n) => String(n).padStart(2, "0");
    rows.push({
      "time(UTC)": `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}:${p(hr)}00`,
      T2m: 19 + 8 * season + 7 * Math.sin((Math.PI * (hr - 9)) / 12),
      RH: 55 - 15 * season,
      "G(h)": (750 + 250 * season) * day,
      WS10m: 2.5,
      SP: 97000,
    });
  }
  return { inputs: { location: { latitude: lat, longitude: -7.98, elevation: 467 } }, outputs: { tmy_hourly: rows } };
}

const m = monthlyEt0(syntheticTmy());
ok("12 months", Array.isArray(m) && m.length === 12, JSON.stringify(m));
ok("July above January", m && m[6] > 2 * m[0], m && `${m[0]} → ${m[6]}`);
ok("values in a plausible band (0.5–12 mm/day)", m && m.every((v) => v > 0.5 && v < 12));
ok("short series → null", monthlyEt0(syntheticTmy({ hours: 4000 })) === null);
ok("garbage → null", monthlyEt0({}) === null && monthlyEt0(null) === null);

// The route
const ORIGIN = "https://solar.wattu.org";
const req = (q, init = {}) => new Request("https://w.dev/et0" + q, { headers: { Origin: ORIGIN }, ...init });
const seen = [];
globalThis.fetch = async (u, init) => { seen.push({ u: String(u), init }); return new Response(JSON.stringify(syntheticTmy())); };

let r = await worker.fetch(req("?lat=31.6295&lon=-7.9811"), {});
let body = await r.json();
ok("→ 200", r.status === 200, "got " + r.status);
ok("body: et0_mm_day, elevation_m, source", JSON.stringify(Object.keys(body)) === '["et0_mm_day","elevation_m","source"]' &&
  body.et0_mm_day.length === 12 && body.elevation_m === 467, JSON.stringify(body));
ok("CORS for the solar site", r.headers.get("access-control-allow-origin") === ORIGIN);
ok("coordinates rounded to 0.01° before JRC", seen[0] && seen[0].u ===
  "https://re.jrc.ec.europa.eu/api/v5_2/tmy?lat=31.63&lon=-7.98&outputformat=json", seen[0] && seen[0].u);
ok("TMY edge-cached 30 days, errors never", seen[0] && seen[0].init.cf.cacheTtlByStatus["200-299"] === 2592000 &&
  seen[0].init.cf.cacheTtlByStatus["400-599"] === 0);

r = await worker.fetch(req("?lat=31.6&lon=-7.9&peakpower=1"), {});
ok("unknown parameter → 400", r.status === 400, "got " + r.status);
r = await worker.fetch(req("?lat=31.6"), {});
ok("missing lon → 400", r.status === 400, "got " + r.status);
r = await worker.fetch(req("?lat=1e1&lon=-7.9"), {});
ok("not a plain decimal → 400", r.status === 400, "got " + r.status);
r = await worker.fetch(req("?lat=31.6&lon=-7.9", { method: "POST", body: "{}" }), {});
ok("POST → 405", r.status === 405, "got " + r.status);

globalThis.fetch = async () => new Response("down", { status: 503 });
r = await worker.fetch(req("?lat=31.6&lon=-7.9"), {});
ok("PVGIS down → 502 with CORS", r.status === 502 && r.headers.get("access-control-allow-origin") === ORIGIN, "got " + r.status);
globalThis.fetch = async () => new Response("<html>maintenance</html>");
r = await worker.fetch(req("?lat=31.6&lon=-7.9"), {});
ok("unreadable answer → 502", r.status === 502, "got " + r.status);
globalThis.fetch = async () => { throw new Error("timeout"); };
r = await worker.fetch(req("?lat=31.6&lon=-7.9"), {});
ok("PVGIS silent → 504", r.status === 504, "got " + r.status);

console.log(fail ? "\n" + fail + " FAILURE(S)" : "\nall green");
process.exit(fail ? 1 : 0);
