/* solar-pvgis — Cloudflare Worker proxying PVGIS v5.2 for Atlas Solar.
 *
 * Contract:
 *   GET /pvcalc?lat=..&lon=..&peakpower=..&loss=..&angle=..&aspect=..&mountingplace=..&outputformat=json
 *   → JRC JSON verbatim, CORS-scoped to the Atlas Nexus origins, edge-cached 24 h.
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
  for (const [key, [min, max]] of Object.entries(BOUNDS)) {
    const raw = searchParams.get(key);
    if (raw === null) continue; // PVGIS has defaults for optional params
    const v = Number(raw);
    if (!Number.isFinite(v) || v < min || v > max) {
      return `Paramètre invalide : ${key}=${raw}`;
    }
  }
  const mounting = searchParams.get("mountingplace");
  if (mounting !== null && !["free", "building"].includes(mounting)) {
    return `Paramètre invalide : mountingplace=${mounting}`;
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
  "depth",          // scrolled to a section (financing, charts, method)
  "exit",           // session ended — furthest step + duration
]);

// Only these keys are ever read off the wire. Anything else is dropped.
const EVENT_BLOBS = ["ref", "dev", "lang", "src", "field", "section"];
const EVENT_DOUBLES = ["t", "w", "step", "dur", "lat", "lon", "bill", "kwp", "payback", "savings"];

const MAX_EVENTS_PER_BEACON = 20;
const MAX_BLOB_LEN = 64;
const MAX_BODY_BYTES = 8192;

function str(v) {
  return typeof v === "string" ? v.slice(0, MAX_BLOB_LEN) : "";
}
function num(v) {
  return Number.isFinite(v) ? v : 0;
}

async function handleEvent(request, env) {
  // A malformed or oversized beacon is dropped silently — analytics must
  // never surface an error to the visitor.
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return new Response(null, { status: 204, headers: corsHeaders(request) });

  let payload;
  try { payload = JSON.parse(raw); } catch (e) { payload = null; }

  if (payload && Array.isArray(payload.ev) && env.SOLAR_ANALYTICS) {
    const sid = str(payload.sid);
    for (const ev of payload.ev.slice(0, MAX_EVENTS_PER_BEACON)) {
      if (!ev || !EVENT_NAMES.has(ev.e)) continue;
      env.SOLAR_ANALYTICS.writeDataPoint({
        // indexes is the sampling key — one per data point, event name so
        // rare events (geocode_fail, pvgis_fallback) are never sampled away
        // behind the common ones.
        indexes: [ev.e],
        blobs: [ev.e, sid, ...EVENT_BLOBS.map((k) => str(ev[k]))],
        doubles: EVENT_DOUBLES.map((k) => num(ev[k])),
      });
    }
  }

  return new Response(null, { status: 204, headers: corsHeaders(request) });
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
      if (env.RATE_LIMITER) {
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        const { success } = await env.RATE_LIMITER.limit({ key: ip });
        if (!success) return new Response(null, { status: 204, headers: corsHeaders(request) });
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

    // Per-IP rate limit (60 req/min) via the Workers rate-limiting binding.
    if (env.RATE_LIMITER) {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return errorResponse(request, 429, "Trop de requêtes — réessayez dans une minute");
      }
    }

    // Rebuild the upstream URL from the validated whitelist only, sorted so
    // the edge cache key is stable regardless of client param order.
    const upstream = new URL(UPSTREAM);
    [...ALLOWED_PARAMS].sort().forEach((key) => {
      const v = url.searchParams.get(key);
      if (v !== null) upstream.searchParams.set(key, v);
    });
    upstream.searchParams.set("outputformat", "json");

    let jrcResponse;
    try {
      jrcResponse = await fetch(upstream, {
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        cf: { cacheTtl: 86400, cacheEverything: true },
      });
    } catch (e) {
      return errorResponse(request, 504, "PVGIS ne répond pas — réessayez dans quelques instants");
    }

    if (!jrcResponse.ok) {
      const msg = jrcResponse.status >= 500
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
