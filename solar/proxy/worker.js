/* solar-pvgis — Cloudflare Worker proxying PVGIS v5.2 for Wattu's solar tool.
 *
 * Contract:
 *   GET /pvcalc?lat=..&lon=..&peakpower=..&loss=..&angle=..&aspect=..&mountingplace=..&outputformat=json
 *   → JRC JSON verbatim, CORS-scoped to the Wattu origins, edge-cached 24 h.
 *   Errors → { "error": "<message fr>", "status": <code> } with matching HTTP status.
 *
 *   POST /e  { sid, ev: [{ e, t, ... }] }
 *   → 204. Cookieless usage events into the SOLAR_ANALYTICS Analytics Engine
 *     dataset. No IP, no address, no identifier is stored. See ../ANALYTICS.md.
 *
 * Deploy: `wrangler deploy` from this directory. See ../README.md "Proxy operations".
 */

const UPSTREAM = "https://re.jrc.ec.europa.eu/api/v5_2/PVcalc";

const ALLOWED_ORIGINS = [
  "https://solar.wattu.org",             // solar tool — custom domain
  "https://energy.wattu.org",            // map — custom domain
  "https://atlas-solar.pages.dev",       // solar tool — its own Pages project
  "https://atlas-nexus-69o.pages.dev",   // map (kept: /solar/ 301s from here)
  "https://redatahiri37.github.io",
  "http://localhost:8765",
  "http://localhost:8766",
];

// Cloudflare Pages per-deployment preview URLs
// (e.g. https://4090bafd.atlas-solar.pages.dev)
const ALLOWED_ORIGIN_SUFFIXES = [
  ".atlas-solar.pages.dev",
  ".atlas-nexus-69o.pages.dev",
];

// Whitelist of query params PVGIS.fetch() sends — anything else is rejected.
const ALLOWED_PARAMS = new Set([
  "lat", "lon", "peakpower", "loss", "angle", "aspect",
  "mountingplace", "outputformat",
]);

// Numeric bounds: keep the worker from being used as an open proxy to
// arbitrary PVGIS abuse, and catch garbage before it reaches JRC.
const BOUNDS = {
  lat: [-90, 90],
  lon: [-180, 180],
  peakpower: [0.1, 100],
  loss: [0, 50],
  angle: [0, 90],
  aspect: [-180, 180],
};

const UPSTREAM_TIMEOUT_MS = 15000;

// Plain decimals only: Number() also accepts "", "0x21", "1e1", " 33 ",
// which would reach JRC as typed and split the edge cache.
const DECIMAL = /^-?\d{1,3}(\.\d{1,8})?$/;

// Used when the RATE_LIMITER binding is missing: a per-isolate counter is
// weaker than the binding but never leaves the Worker unlimited.
const RATE_LIMIT = 60;          // requests per minute per IP and route
const fallbackHits = new Map(); // key → [windowStart, count]
let warned = false;

async function rateLimited(env, key) {
  if (env.RATE_LIMITER) {
    const { success } = await env.RATE_LIMITER.limit({ key });
    return !success;
  }
  if (!warned) {
    warned = true; // once per isolate: visible in `wrangler tail`
    console.error("RATE_LIMITER binding missing — per-isolate fallback limit in use");
  }
  const now = Date.now();
  const hit = fallbackHits.get(key);
  if (!hit || now - hit[0] >= 60000) {
    if (fallbackHits.size > 10000) fallbackHits.clear();
    fallbackHits.set(key, [now, 1]);
    return false;
  }
  return ++hit[1] > RATE_LIMIT;
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const ok = ALLOWED_ORIGINS.includes(origin) ||
    (origin && origin.startsWith("https://") &&
     ALLOWED_ORIGIN_SUFFIXES.some(s => origin.endsWith(s)));
  const allowed = ok ? origin : ALLOWED_ORIGINS[0];
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "vary": "Origin",
    "x-content-type-options": "nosniff",
  };
}

function errorResponse(request, status, messageFr) {
  return new Response(JSON.stringify({ error: messageFr, status }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(request),
    },
  });
}

function validate(searchParams) {
  for (const key of searchParams.keys()) {
    if (!ALLOWED_PARAMS.has(key)) return `Paramètre inconnu : ${key}`;
  }
  for (const key of ["lat", "lon"]) {
    if (searchParams.get(key) === null) return `Paramètre manquant : ${key}`;
  }
  for (const [key, [min, max]] of Object.entries(BOUNDS)) {
    const raw = searchParams.get(key);
    if (raw === null) continue; // PVGIS has defaults for optional params
    const v = Number(raw);
    if (!DECIMAL.test(raw) || v < min || v > max) {
      return `Paramètre invalide : ${key}=${raw.slice(0, 40)}`;
    }
  }
  const mounting = searchParams.get("mountingplace");
  if (mounting !== null && !["free", "building"].includes(mounting)) {
    return `Paramètre invalide : mountingplace=${mounting.slice(0, 40)}`;
  }
  return null;
}

/* ── Usage analytics ────────────────────────────────────────────────────
 * Accepts the beacon from analytics.js and writes coarse aggregates into
 * Analytics Engine. Nothing identifying is persisted: the request IP is
 * used only for the rate limit and is never written to the dataset.
 *
 * Degrades to a silent 204 when the SOLAR_ANALYTICS binding is absent, so
 * a deploy without the dataset configured still serves the product.
 */
const EVENT_NAMES = new Set([
  "view",           // page loaded
  "address_input",  // visitor started typing an address (intent)
  "geocode_fail",   // address not found — friction signal
  "estimate",       // reached the result view (activation)
  "pvgis_fallback", // PVGIS unavailable, approximate mode shown
  "param_change",   // a control was tuned — tells us what people care about
  "outcome",        // the economics the visitor actually settled on
  "roof",           // roof found on OSM (src=osm), not found (none), drawing started/finished
  "depth",          // scrolled to a section (financing, charts, method)
  "exit",           // session ended — furthest step + duration
]);

// Only these keys are ever read off the wire. Anything else is dropped.
// Each value must match the shape analytics.js sends, or it is stored as
// "other": the dataset is read by scripts and agents and ends up in
// committed minutes, so free text (links, markdown, instructions) never
// gets in.
const EVENT_BLOBS = {
  ref: /^[a-z0-9.-]{1,64}$/,       // referrer host, "direct" or "self"
  dev: /^(mobile|tablet|desktop)$/,
  lang: /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,4})?$/,
  src: /^[a-z_]{1,24}$/,           // typed, chip, geoloc, osm, drawn…
  field: /^[a-z_]{1,24}$/,         // peakpower, bill_chip…
  section: /^[a-z_]{1,24}$/,       // financing, charts, method
};
// Bounds per number; outside them the value is stored as 0. Coordinates
// are Morocco only and rounded here too (~11 km), so the privacy promise
// in ANALYTICS.md does not rest on the client alone.
const EVENT_DOUBLES = {
  t: [0, 86400], w: [0, 10000], step: [0, 10], dur: [0, 86400],
  lat: [20, 37], lon: [-18, 0], bill: [0, 20000], kwp: [0, 100],
  payback: [0, 50], savings: [0, 1e6],
};
const COARSE = new Set(["lat", "lon"]);
const SID = /^[a-z0-9]{1,16}$/;

const MAX_EVENTS_PER_BEACON = 20;
const MAX_BODY_BYTES = 8192;

function blob(key, v) {
  if (v === undefined || v === null || v === "") return "";
  return typeof v === "string" && EVENT_BLOBS[key].test(v) ? v : "other";
}
function dbl(key, v) {
  const [min, max] = EVENT_DOUBLES[key];
  if (!Number.isFinite(v) || v < min || v > max) return 0;
  return COARSE.has(key) ? Math.round(v * 10) / 10 : v;
}

async function handleEvent(request, env) {
  // A malformed or oversized beacon is dropped silently — analytics must
  // never surface an error to the visitor.
  const done = () => new Response(null, { status: 204, headers: corsHeaders(request) });
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return done();
  const raw = await readCapped(request, MAX_BODY_BYTES);
  if (raw === null) return done();

  let payload;
  try { payload = JSON.parse(raw); } catch (e) { payload = null; }

  if (payload && Array.isArray(payload.ev) && env.SOLAR_ANALYTICS) {
    const sid = typeof payload.sid === "string" && SID.test(payload.sid) ? payload.sid : "other";
    for (const ev of payload.ev.slice(0, MAX_EVENTS_PER_BEACON)) {
      if (!ev || !EVENT_NAMES.has(ev.e)) continue;
      env.SOLAR_ANALYTICS.writeDataPoint({
        // indexes is the sampling key — one per data point, event name so
        // rare events (geocode_fail, pvgis_fallback) are never sampled away
        // behind the common ones.
        indexes: [ev.e],
        blobs: [ev.e, sid, ...Object.keys(EVENT_BLOBS).map((k) => blob(k, ev[k]))],
        doubles: Object.keys(EVENT_DOUBLES).map((k) => dbl(k, ev[k])),
      });
    }
  }

  return done();
}

// Reads the body as text, giving up (null) past `max` bytes without
// buffering the rest.
async function readCapped(request, max) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(all);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    const url = new URL(request.url);

    if (url.pathname === "/e") {
      if (request.method !== "POST") {
        return errorResponse(request, 405, "Méthode non autorisée");
      }
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      if (await rateLimited(env, "e:" + ip)) {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
      }
      return handleEvent(request, env);
    }

    if (request.method !== "GET") {
      return errorResponse(request, 405, "Méthode non autorisée");
    }
    if (url.pathname !== "/pvcalc") {
      return errorResponse(request, 404, "Endpoint inconnu");
    }

    const invalid = validate(url.searchParams);
    if (invalid) {
      return errorResponse(request, 400, invalid);
    }

    // Per-IP rate limit (60 req/min), its own bucket apart from /e.
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (await rateLimited(env, "pv:" + ip)) {
      return errorResponse(request, 429, "Trop de requêtes — réessayez dans une minute");
    }

    // Rebuild the upstream URL from the validated whitelist only, sorted so
    // the edge cache key is stable regardless of client param order.
    // Numbers are forwarded normalised (coordinates to 4 decimals, ~11 m),
    // never as the client typed them.
    const upstream = new URL(UPSTREAM);
    [...ALLOWED_PARAMS].sort().forEach((key) => {
      const v = url.searchParams.get(key);
      if (v === null) return;
      if (key in BOUNDS) {
        const n = Number(v);
        upstream.searchParams.set(key, String(key === "lat" || key === "lon" ? +n.toFixed(4) : n));
      } else {
        upstream.searchParams.set(key, v);
      }
    });
    upstream.searchParams.set("outputformat", "json");

    let jrcResponse;
    try {
      jrcResponse = await fetch(upstream, {
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        // Errors are never cached: a JRC outage must not outlive itself.
        cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": 86400, "400-599": 0 } },
      });
    } catch (e) {
      return errorResponse(request, 504, "PVGIS ne répond pas — réessayez dans quelques instants");
    }

    if (!jrcResponse.ok) {
      const msg = jrcResponse.status === 429
        ? "PVGIS est saturé — réessayez dans une minute"
        : jrcResponse.status >= 500
          ? "PVGIS est indisponible — réessayez plus tard"
          : "PVGIS a rejeté la requête — vérifiez les paramètres";
      return errorResponse(request, jrcResponse.status, msg);
    }

    return new Response(jrcResponse.body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=86400",
        ...corsHeaders(request),
      },
    });
  },
};
