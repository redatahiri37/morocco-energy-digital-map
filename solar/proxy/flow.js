/* GET /flow/es-ma — the Spain–Morocco interconnector, live, for the energy map.
 *
 * REE (Red Eléctrica, Spain's grid operator) publishes the peninsula's
 * demand and cross-border exchanges every 5 minutes at demanda.ree.es,
 * without an account. The answer is JSONP for REE's own page and carries
 * no CORS header, so energy.wattu.org reads it through here.
 *
 *   → { "at": "2026-10-18T12:20:00.000Z", "net_import_mw": 640 }
 *     net_import_mw > 0: Morocco imports from Spain; < 0: Morocco exports.
 *   Errors → { "error": "<message fr>", "status": <code> }, like /pvcalc.
 *
 * The series is the one Electricity Maps reads for ES→MA
 * (electricitymaps-contrib, parsers/ES.py): expMar is Spain's export to
 * Morocco (≤ 0: REE counts exports as negative), impMar Spain's import
 * from Morocco (≥ 0). Times are Madrid wall-clock, with "2A"/"2B" for the
 * hour that repeats when summer time ends.
 */

const REE_URL = "https://demanda.ree.es/WSvisionaMovilesPeninsulaRest/resources/demandaGeneracionPeninsula";
const UPSTREAM_TIMEOUT_MS = 10000;
const CACHE_S = 300;                // REE's step; edge and browser keep it that long
const STALE_MS = 2 * 3600e3;        // older than this, the map says unavailable
const MAX_MW = 3000;                // the link is 1,400 MW; anything beyond is garbage

const MADRID = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Madrid", hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});

// Epoch ms → Madrid wall clock, as the epoch ms of that time read as UTC.
function madridWall(t) {
  const p = Object.fromEntries(MADRID.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute);
}

// "2026-10-18 14:20" (Madrid) → epoch ms. Madrid is UTC+1 or UTC+2: keep
// the offset at which Madrid shows that time. "2A" is the first pass
// through the repeated hour (summer time), "2B" the second.
export function madridMs(ts) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{1,2})([AB]?):(\d{2})$/.exec(ts);
  if (!m) return NaN;
  const wall = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[6]);
  if (m[5]) return wall - (m[5] === "A" ? 2 : 1) * 3600e3;
  for (const h of [2, 1]) {
    const t = wall - h * 3600e3;
    if (madridWall(t) === wall) return t;
  }
  return NaN;
}

// Today in Madrid as YYYY-MM-DD: REE's answer for a date starts the
// evening before, so just after midnight it still holds the last points.
export function madridDate(now) {
  return new Date(madridWall(now)).toISOString().slice(0, 10);
}

// REE's JSONP text → the latest { at, net_import_mw }, or null.
export function latestFlow(text, now) {
  const start = text.indexOf("("), end = text.lastIndexOf(")");
  if (start < 0 || end <= start) return null;
  let rows;
  try { rows = JSON.parse(text.slice(start + 1, end)).valoresHorariosGeneracion; } catch (e) { return null; }
  if (!Array.isArray(rows)) return null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i] || {};
    if (!Number.isFinite(r.expMar) || !Number.isFinite(r.impMar)) continue;
    const mw = Math.round(-(r.expMar + r.impMar));
    const t = typeof r.ts === "string" ? madridMs(r.ts) : NaN;
    if (!Number.isFinite(t) || t > now + 600e3 || Math.abs(mw) > MAX_MW) continue;
    return { at: t, net_import_mw: mw };
  }
  return null;
}

export async function handleFlow(request, env, { corsHeaders, errorResponse, rateLimited }) {
  if (request.method !== "GET") {
    return errorResponse(request, 405, "Méthode non autorisée");
  }
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (await rateLimited(env, "flow:" + ip)) {
    return errorResponse(request, 429, "Trop de requêtes — réessayez dans une minute");
  }

  const now = Date.now();
  let res;
  try {
    res = await fetch(`${REE_URL}?curva=DEMANDAAU&fecha=${madridDate(now)}`, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: { "user-agent": "Wattu energy map (+https://energy.wattu.org)" },
      // Errors are never cached: an REE outage must not outlive itself.
      cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": CACHE_S, "400-599": 0 } },
    });
  } catch (e) {
    return errorResponse(request, 504, "REE ne répond pas — réessayez dans quelques instants");
  }
  if (!res.ok) {
    return errorResponse(request, 502, "REE est indisponible — réessayez plus tard");
  }

  const flow = latestFlow(await res.text(), now);
  if (!flow) {
    return errorResponse(request, 502, "Réponse REE illisible");
  }
  if (now - flow.at > STALE_MS) {
    return errorResponse(request, 503, "Données REE trop anciennes");
  }
  return new Response(JSON.stringify({ at: new Date(flow.at).toISOString(), net_import_mw: flow.net_import_mw }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${CACHE_S}`,
      ...corsHeaders(request),
    },
  });
}
