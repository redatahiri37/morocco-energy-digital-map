/* Worker tests — no framework, no install: `node worker.test.mjs` from this
 * directory. Covers the POST /e analytics endpoint (validation, privacy
 * guarantees, graceful degradation) and checks that adding it did not break
 * the existing /pvcalc routing.
 */
import worker from "./worker.js";

const written = [];
const env = { SOLAR_ANALYTICS: { writeDataPoint: (d) => written.push(d) } };
const ORIGIN = "https://atlas-solar.pages.dev";
const post = (body) => new Request("https://w.dev/e", {
  method: "POST", headers: { Origin: ORIGIN, "content-type": "text/plain" }, body,
});
let fail = 0;
const ok = (name, cond, extra="") => { console.log((cond?"PASS":"FAIL")+" — "+name+(extra?"  "+extra:"")); if(!cond) fail++; };

// 1. valid beacon
let r = await worker.fetch(post(JSON.stringify({
  sid: "abc123", ev: [
    { e: "view", t: 0, ref: "linkedin.com", dev: "mobile", w: 390, lang: "fr-MA" },
    { e: "estimate", t: 12, src: "typed", lat: 33.6, lon: -7.6 },
    { e: "outcome", t: 20, bill: 750, kwp: 3.5, payback: 6.4, savings: 5200 },
  ],
})), env);
ok("valid beacon → 204", r.status === 204, "got "+r.status);
ok("3 data points written", written.length === 3, "got "+written.length);
ok("CORS echoes origin", r.headers.get("access-control-allow-origin") === ORIGIN);
const est = written[1];
ok("estimate blobs", est.blobs[0]==="estimate" && est.blobs[1]==="abc123" && est.blobs[5]==="typed", JSON.stringify(est.blobs));
ok("estimate doubles lat/lon", est.doubles[4]===33.6 && est.doubles[5]===-7.6, JSON.stringify(est.doubles));
ok("index is event name", est.indexes[0]==="estimate");
ok("outcome doubles", JSON.stringify(written[2].doubles)==="[20,0,0,0,0,0,750,3.5,6.4,5200]", JSON.stringify(written[2].doubles));

// 2. unknown event dropped
written.length = 0;
await worker.fetch(post(JSON.stringify({ sid:"x", ev:[{e:"evil_exfil", addr:"12 rue X"}] })), env);
ok("unknown event dropped", written.length === 0);

// 3. unlisted key never stored
written.length = 0;
await worker.fetch(post(JSON.stringify({ sid:"x", ev:[{e:"view", address:"12 rue Hassan II", ip:"1.2.3.4"}] })), env);
ok("unlisted keys not stored", JSON.stringify(written[0]).indexOf("Hassan") === -1 && JSON.stringify(written[0]).indexOf("1.2.3.4") === -1, JSON.stringify(written[0]));

// 4. garbage / oversized / non-numeric
written.length = 0;
r = await worker.fetch(post("not json at all"), env);
ok("garbage body → 204, nothing written", r.status===204 && written.length===0);
r = await worker.fetch(post("x".repeat(9000)), env);
ok("oversized body → 204, nothing written", r.status===204 && written.length===0);
written.length = 0;
await worker.fetch(post(JSON.stringify({ sid:"x", ev:[{e:"view", w:"NaN-ish", ref:{a:1}}] })), env);
ok("non-numeric coerced to 0", written[0].doubles.every(Number.isFinite), JSON.stringify(written[0].doubles));
ok("non-string blob coerced to ''", written[0].blobs[2]==="", JSON.stringify(written[0].blobs));

// 5. blob length cap
written.length = 0;
await worker.fetch(post(JSON.stringify({ sid:"x", ev:[{e:"view", ref:"y".repeat(500)}] })), env);
ok("blob capped at 64", written[0].blobs[2].length === 64, ""+written[0].blobs[2].length);

// 6. event cap per beacon
written.length = 0;
await worker.fetch(post(JSON.stringify({ sid:"x", ev: Array(50).fill({e:"view"}) })), env);
ok("max 20 events per beacon", written.length === 20, ""+written.length);

// 7. no binding → still 204
r = await worker.fetch(post(JSON.stringify({sid:"x",ev:[{e:"view"}]})), {});
ok("no AE binding → graceful 204", r.status === 204);

// 8. method + routing guards
r = await worker.fetch(new Request("https://w.dev/e", { headers:{Origin:ORIGIN} }), env);
ok("GET /e → 405", r.status === 405, "got "+r.status);
r = await worker.fetch(new Request("https://w.dev/nope", { headers:{Origin:ORIGIN} }), env);
ok("unknown path → 404", r.status === 404);
r = await worker.fetch(new Request("https://w.dev/e", { method:"OPTIONS", headers:{Origin:ORIGIN} }), env);
ok("OPTIONS → 204 with POST advertised", r.status===204 && r.headers.get("access-control-allow-methods").includes("POST"));

// 9. pvcalc still routed (not broken by the new branch)
r = await worker.fetch(new Request("https://w.dev/pvcalc?lat=999", { headers:{Origin:ORIGIN} }), env);
ok("pvcalc validation still runs", r.status === 400, "got "+r.status);

console.log(fail ? "\n"+fail+" FAILURE(S)" : "\nall green");
process.exit(fail ? 1 : 0);
