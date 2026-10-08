/* Worker tests — no framework, no install: `node worker.test.mjs` from this
 * directory. Covers the POST /e analytics endpoint (validation, privacy
 * guarantees, graceful degradation) and checks that adding it did not break
 * the existing /pvcalc routing.
 */
import worker from "./worker.js";

const written = [];
const env = { SOLAR_ANALYTICS: { writeDataPoint: (d) => written.push(d) } };
const ORIGIN = "https://solar.wattu.org";
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

// 1b. roof event keeps its source
written.length = 0;
await worker.fetch(post(JSON.stringify({ sid:"x", ev:[{e:"roof", t:3, src:"osm"}] })), env);
ok("roof event stored with src", written.length===1 && written[0].blobs[0]==="roof" && written[0].blobs[5]==="osm", JSON.stringify(written[0]&&written[0].blobs));

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
ok("non-string blob stored as 'other'", written[0].blobs[2]==="other", JSON.stringify(written[0].blobs));

// 5. blob length cap
written.length = 0;
await worker.fetch(post(JSON.stringify({ sid:"x", ev:[{e:"view", ref:"y".repeat(500)}] })), env);
ok("over-long blob stored as 'other'", written[0].blobs[2] === "other", written[0].blobs[2]);

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

// 10. free text, links and escapes never reach the dataset
written.length = 0;
await worker.fetch(post(JSON.stringify({ sid:"x|[a](https://evil.tld)", ev:[{e:"view",
  ref:"x|[click](https://evil.tld/p)|IGNORE PREVIOUS INSTRUCTIONS", dev:"fridge", lang:"fr-MA",
  src:"\u001b]8;;https://evil.tld\u0007", field:"peakpower", section:"<b>"}] })), env);
const b = written[0].blobs;
ok("injected blobs → 'other'", b[1]==="other" && b[2]==="other" && b[3]==="other" && b[5]==="other" && b[7]==="other", JSON.stringify(b));
ok("valid blobs kept", b[4]==="fr-MA" && b[6]==="peakpower", JSON.stringify(b));

// 11. numbers outside their bounds → 0; coordinates rounded on the server
written.length = 0;
await worker.fetch(post(JSON.stringify({ sid:"x", ev:[{e:"estimate", lat:33.57312, lon:-7.58961},
  {e:"outcome", bill:1e308, payback:-1e308, savings:5200}, {e:"estimate", lat:48.85661, lon:2.35222}] })), env);
ok("coords rounded to 0.1", written[0].doubles[4]===33.6 && written[0].doubles[5]===-7.6, JSON.stringify(written[0].doubles));
ok("absurd doubles → 0", written[1].doubles[6]===0 && written[1].doubles[8]===0 && written[1].doubles[9]===5200, JSON.stringify(written[1].doubles));
ok("coords outside Morocco → 0", written[2].doubles[4]===0 && written[2].doubles[5]===0, JSON.stringify(written[2].doubles));

// 12. oversized body by bytes (multi-byte chars) and by Content-Length
written.length = 0;
r = await worker.fetch(post(JSON.stringify({ sid:"x", ev:[{e:"view", lang:"é".repeat(5000)}] })), env);
ok("body over 8 KB in bytes → nothing written", r.status===204 && written.length===0);

// 13. /pvcalc: raw text never forwarded, lat/lon required
const seen = [];
globalThis.fetch = async (u, init) => { seen.push({ u: String(u), init }); return new Response("{}", { status: 200 }); };
for (const q of ["lat=&lon=", "lat=0x21&lon=-7", "lat=1e1&lon=-7", "lat=%2033%20&lon=-7", "peakpower=3"]) {
  r = await worker.fetch(new Request("https://w.dev/pvcalc?"+q, { headers:{Origin:ORIGIN} }), env);
  ok("pvcalc rejects "+q, r.status === 400, "got "+r.status);
}
ok("nothing forwarded for rejected input", seen.length === 0, JSON.stringify(seen));
r = await worker.fetch(new Request("https://w.dev/pvcalc?lon=-7.589612&lat=33.573109&peakpower=3.50&aspect=-45", { headers:{Origin:ORIGIN} }), env);
ok("valid pvcalc → 200", r.status === 200, "got "+r.status);
ok("forwarded normalised", seen[0] && seen[0].u.includes("lat=33.5731") && seen[0].u.includes("lon=-7.5896") && seen[0].u.includes("peakpower=3.5&"), seen[0] && seen[0].u);
ok("errors not edge-cached", seen[0] && seen[0].init.cf.cacheTtlByStatus["400-599"] === 0);
ok("nosniff on responses", r.headers.get("x-content-type-options") === "nosniff");

// 14. rate limit without the binding: per-isolate fallback, separate buckets
let limited = 0;
const ipReq = (path) => new Request("https://w.dev"+path, { headers:{Origin:ORIGIN, "CF-Connecting-IP":"9.9.9.9"} });
const origErr = console.error; console.error = () => {};
for (let i = 0; i < 70; i++) {
  r = await worker.fetch(ipReq("/pvcalc?lat=33&lon=-7&peakpower="+(1+i%50)), env);
  if (r.status === 429) limited++;
}
r = await worker.fetch(new Request("https://w.dev/e", { method:"POST", headers:{Origin:ORIGIN,"CF-Connecting-IP":"9.9.9.9"}, body: JSON.stringify({sid:"x",ev:[{e:"view"}]}) }), env);
console.error = origErr;
ok("no binding → still limited (10 of 70 refused)", limited === 10, "got "+limited);
ok("/e has its own bucket", r.status === 204 && written.length > 0);

// 15. CORS: only Wattu origins get their own origin back
for (const o of ["http://localhost:8765", "https://redatahiri37.github.io", "https://evil.example", "http://x.atlas-solar.pages.dev", "https://atlas-solar.pages.dev.evil.com"]) {
  r = await worker.fetch(new Request("https://w.dev/e", { method:"OPTIONS", headers:{Origin:o} }), env);
  ok("CORS refuses "+o, r.headers.get("access-control-allow-origin") === "https://solar.wattu.org", r.headers.get("access-control-allow-origin"));
}
for (const o of ["https://solar.wattu.org", "https://4090bafd.atlas-solar.pages.dev"]) {
  r = await worker.fetch(new Request("https://w.dev/e", { method:"OPTIONS", headers:{Origin:o} }), env);
  ok("CORS allows "+o, r.headers.get("access-control-allow-origin") === o);
}

console.log(fail ? "\n"+fail+" FAILURE(S)" : "\nall green");
process.exit(fail ? 1 : 0);
