/* GET /et0?lat=..&lon=.. — reference evapotranspiration of a field, month by
 * month, for the solar pumping simulator (solar/pompage/).
 *
 * The farmer's water need is ET₀ × Kc × area / irrigation efficiency. ET₀
 * is computed here with the FAO-56 Penman-Monteith equation (Allen et al.
 * 1998, FAO Irrigation and Drainage Paper 56, eq. 6, daily step) from
 * PVGIS's typical meteorological year at the point: hourly air
 * temperature, relative humidity, global horizontal irradiance, 10 m wind
 * and surface pressure (ERA5 + SARAH-2, the same service as /pvcalc). No
 * other weather source and no account.
 *
 *   → { "et0_mm_day": [12 numbers, Jan…Dec], "elevation_m": 467,
 *       "source": "PVGIS TMY 2005-2020, FAO-56 Penman-Monteith" }
 *   Errors → { "error": "<message fr>", "status": <code> }, like /pvcalc.
 *
 * Coordinates are rounded to 0.01° (~1 km): climate does not change
 * faster, neighbouring fields share the edge cache, and the exact position
 * of a farm never reaches JRC. The TMY answer (1.3 MB) is cached 30 days at
 * the edge; ours (200 bytes) a day in the browser.
 */

const TMY_URL = "https://re.jrc.ec.europa.eu/api/v5_2/tmy";
const UPSTREAM_TIMEOUT_MS = 20000;
const DECIMAL = /^-?\d{1,3}(\.\d{1,8})?$/;

// ── FAO-56, daily step ─────────────────────────────────────────────────
const SIGMA = 4.903e-9;                     // MJ K⁻⁴ m⁻² day⁻¹
const GSC = 0.0820;                         // solar constant, MJ m⁻² min⁻¹

// Saturation vapour pressure, kPa (eq. 11)
export function esat(t) {
  return 0.6108 * Math.exp((17.27 * t) / (t + 237.3));
}

// Extraterrestrial radiation, MJ m⁻² day⁻¹ (eq. 21–25)
export function extraterrestrial(latDeg, doy) {
  const phi = (latDeg * Math.PI) / 180;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365);
  const delta = 0.409 * Math.sin((2 * Math.PI * doy) / 365 - 1.39);
  const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(delta))));
  return ((24 * 60) / Math.PI) * GSC * dr *
    (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(ws));
}

// One day → ET₀ in mm/day (eq. 6). Inputs: tmax, tmin (°C), ea (kPa,
// actual vapour pressure), rs (MJ m⁻² day⁻¹), u2 (m/s at 2 m), p (kPa),
// ra (MJ m⁻² day⁻¹), z (m).
export function et0Day({ tmax, tmin, ea, rs, u2, p, ra, z }) {
  const t = (tmax + tmin) / 2;
  const es = (esat(tmax) + esat(tmin)) / 2;
  const vpd = Math.max(0, es - ea);
  const delta = (4098 * esat(t)) / (t + 237.3) ** 2;
  const gamma = 0.000665 * p;
  const rso = (0.75 + 2e-5 * z) * ra;
  const rns = (1 - 0.23) * rs;
  const ratio = rso > 0 ? Math.min(1, rs / rso) : 0.5;
  const rnl = SIGMA * (((tmax + 273.16) ** 4 + (tmin + 273.16) ** 4) / 2) *
    (0.34 - 0.14 * Math.sqrt(Math.max(0, ea))) * (1.35 * ratio - 0.35);
  const rn = rns - rnl;
  const et0 = (0.408 * delta * rn + gamma * (900 / (t + 273)) * u2 * vpd) /
    (delta + gamma * (1 + 0.34 * u2));
  return Math.max(0, et0);
}

// 10 m wind → 2 m (eq. 47)
const U2_FROM_U10 = 4.87 / Math.log(67.8 * 10 - 5.42);

// PVGIS TMY JSON → monthly mean ET₀ (mm/day), Jan…Dec, or null.
export function monthlyEt0(tmy) {
  const rows = tmy && tmy.outputs && tmy.outputs.tmy_hourly;
  const loc = tmy && tmy.inputs && tmy.inputs.location;
  if (!Array.isArray(rows) || rows.length < 8000 || !loc) return null;
  const lat = Number(loc.latitude), z = Number(loc.elevation) || 0;
  if (!Number.isFinite(lat)) return null;

  // Group hours by calendar day (UTC: Morocco is within half an hour of it).
  const days = new Map();
  for (const r of rows) {
    const m = /^(\d{4})(\d{2})(\d{2}):/.exec(r["time(UTC)"] || "");
    const T = r.T2m, RH = r.RH, G = r["G(h)"], W = r.WS10m, SP = r.SP;
    if (!m || ![T, RH, G, W, SP].every(Number.isFinite)) continue;
    const key = m[2] + m[3];
    let d = days.get(key);
    if (!d) days.set(key, d = { month: +m[2], mmdd: key, tmax: -99, tmin: 99, ea: 0, g: 0, w: 0, p: 0, n: 0 });
    d.tmax = Math.max(d.tmax, T);
    d.tmin = Math.min(d.tmin, T);
    d.ea += (esat(T) * Math.min(100, Math.max(0, RH))) / 100;
    d.g += Math.max(0, G);
    d.w += Math.max(0, W);
    d.p += SP;
    d.n++;
  }

  const sum = new Array(12).fill(0), count = new Array(12).fill(0);
  for (const d of days.values()) {
    if (d.n < 20) continue; // a day with missing hours would bias Tmax/Tmin and Rs
    const mo = d.month, dd = +d.mmdd.slice(2);
    const doy = Math.round(30.4 * (mo - 1) + dd);
    const e = et0Day({
      tmax: d.tmax, tmin: d.tmin,
      ea: d.ea / d.n,
      rs: (d.g * 24 / d.n) * 0.0036,          // Wh m⁻² → MJ m⁻²
      u2: (d.w / d.n) * U2_FROM_U10,
      p: d.p / d.n / 1000,                      // Pa → kPa
      ra: extraterrestrial(lat, doy),
      z,
    });
    sum[mo - 1] += e;
    count[mo - 1]++;
  }
  if (count.some((c) => c < 20)) return null;
  return sum.map((s, i) => Math.round((s / count[i]) * 100) / 100);
}

export async function handleEt0(request, env, { corsHeaders, errorResponse, rateLimited }) {
  if (request.method !== "GET") {
    return errorResponse(request, 405, "Méthode non autorisée");
  }
  const params = new URL(request.url).searchParams;
  for (const key of params.keys()) {
    if (key !== "lat" && key !== "lon") return errorResponse(request, 400, `Paramètre inconnu : ${key.slice(0, 40)}`);
  }
  const lat = params.get("lat"), lon = params.get("lon");
  if (lat === null || lon === null) return errorResponse(request, 400, "Paramètre manquant : lat ou lon");
  if (!DECIMAL.test(lat) || !DECIMAL.test(lon) || Math.abs(+lat) > 90 || Math.abs(+lon) > 180) {
    return errorResponse(request, 400, "Paramètre invalide : lat ou lon");
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (await rateLimited(env, "et0:" + ip)) {
    return errorResponse(request, 429, "Trop de requêtes — réessayez dans une minute");
  }

  const upstream = new URL(TMY_URL);
  upstream.searchParams.set("lat", String(+(+lat).toFixed(2)));
  upstream.searchParams.set("lon", String(+(+lon).toFixed(2)));
  upstream.searchParams.set("outputformat", "json");

  let res;
  try {
    res = await fetch(upstream, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": 30 * 86400, "400-599": 0 } },
    });
  } catch (e) {
    return errorResponse(request, 504, "PVGIS ne répond pas — réessayez dans quelques instants");
  }
  if (!res.ok) {
    return errorResponse(request, res.status >= 500 ? 502 : 400,
      res.status >= 500 ? "PVGIS est indisponible — réessayez plus tard" : "PVGIS n'a pas de données pour ce point");
  }

  let tmy = null, et0 = null;
  try { tmy = await res.json(); et0 = monthlyEt0(tmy); } catch (e) { et0 = null; }
  if (!et0) return errorResponse(request, 502, "Données météo incomplètes pour ce point");

  const z = Math.round(Number(tmy.inputs.location.elevation));
  return new Response(JSON.stringify({
    et0_mm_day: et0,
    elevation_m: Number.isFinite(z) ? z : null,
    source: "PVGIS TMY 2005-2020, FAO-56 Penman-Monteith",
  }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=86400",
      ...corsHeaders(request),
    },
  });
}
