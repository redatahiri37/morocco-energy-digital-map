/* solar-pvgis — Cloudflare Worker proxying PVGIS v5.2 for Atlas Solar.
 *
 * Contract:
 *   GET /pvcalc?lat=..&lon=..&peakpower=..&loss=..&angle=..&aspect=..&mountingplace=..&outputformat=json
 *   → JRC JSON verbatim, CORS-scoped to the Atlas Nexus origins, edge-cached 24 h.
 *   Errors → { "error": "<message fr>", "status": <code> } with matching HTTP status.
 *
 * Deploy: `wrangler deploy` from this directory. See ../README.md "Proxy operations".
 */

const UPSTREAM = "https://re.jrc.ec.europa.eu/api/v5_2/PVcalc";

const ALLOWED_ORIGINS = [
  "https://redatahiri37.github.io",
  "http://localhost:8765",
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
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-methods": "GET, OPTIONS",
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

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (request.method !== "GET") {
      return errorResponse(request, 405, "Méthode non autorisée");
    }

    const url = new URL(request.url);
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
