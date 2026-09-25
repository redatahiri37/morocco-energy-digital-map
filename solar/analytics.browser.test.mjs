/* Atlas Solar — end-to-end analytics test.
 *
 * Walks the real funnel in a real browser and asserts that each stage emits
 * the event the report depends on, that no address text or cookie ever
 * leaves the page, and that Do Not Track silences collection entirely.
 *
 * Leaflet, Chart.js, PVGIS and Nominatim are all stubbed or blocked, so the
 * run is offline and deterministic.
 *
 * Requires playwright (not a repo dependency — this is the one test with an
 * install cost):
 *   npm i playwright && npx playwright install chromium
 *   node solar/analytics.browser.test.mjs
 * Set CHROME_PATH to use an already-installed Chromium.
 */
import { chromium } from "playwright";
import http from "http";
import fs from "fs";
import path from "path";

const ROOT = new URL(".", import.meta.url).pathname;
const MIME = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".xml":"text/xml", ".txt":"text/plain" };
const server = http.createServer((req, res) => {
  let f = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (f.endsWith("/")) f = path.join(f, "index.html");
  fs.readFile(f, (e, d) => e
    ? (res.writeHead(404), res.end("nf"))
    : (res.writeHead(200, {"content-type": MIME[path.extname(f)] || "application/octet-stream"}), res.end(d)));
});
await new Promise(r => server.listen(8765, r));

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
const page = await ctx.newPage();

const beacons = [];
await page.route("**/solar-pvgis.redatahiri.workers.dev/e", async (route) => {
  try { beacons.push(JSON.parse(route.request().postData() || "{}")); } catch (e) {}
  await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" }, body: "" });
});
// Block outbound third parties so the run is deterministic and offline.
await page.route("**://nominatim.openstreetmap.org/**", r => r.abort());
await page.route("**/pvcalc**", r => r.abort());
await page.route("**://*.tile.openstreetmap.org/**", r => r.abort());
await page.route("**://corsproxy.io/**", r => r.abort());
// Stub the CDN libraries so the page behaves as it does in production
// (they are unreachable from this sandbox's egress proxy).
const stub = (body) => (r) => r.fulfill({ status:200, headers:{"content-type":"text/javascript"}, body });
await page.route("**unpkg.com/leaflet**.js", stub(`
  window.L = { map:()=>({ setView(){return this}, remove(){}, addLayer(){return this}, invalidateSize(){return this}, removeLayer(){return this}, on(){return this} }),
    tileLayer:()=>({ addTo(){return this} }), marker:()=>({ addTo(){return this}, bindPopup(){return this} }),
    latLng:()=>({}), control:{ layers:()=>({ addTo(){return this} }) } };`));
await page.route("**unpkg.com/leaflet**.css", r => r.fulfill({status:200, headers:{"content-type":"text/css"}, body:""}));
await page.route("**chart.js**", stub(`
  window.Chart = function(){ return { destroy(){}, update(){}, data:{}, options:{} }; };
  window.Chart.register = function(){};`));

const errors = [];
page.on("pageerror", e => errors.push(String(e)));

await page.goto("http://localhost:8765/", { waitUntil: "load" });
await page.waitForTimeout(600);

// intent
await page.fill("#address-input", "Casa");
await page.waitForTimeout(200);
// activation via a city chip (no geocoder network needed)
await page.click(".chip");
await page.waitForTimeout(2500);
// tune a control
await page.locator("#bill").evaluate(el => { el.value = 1200; el.dispatchEvent(new Event("input", {bubbles:true})); });
await page.waitForTimeout(300);
await page.locator("#angle").evaluate(el => { el.value = 25; el.dispatchEvent(new Event("input", {bubbles:true})); });
await page.waitForTimeout(3200);
// read down the page
for (const sel of ['[data-depth="financing"]', '[data-depth="charts"]', '[data-depth="method"]']) {
  await page.locator(sel).scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
}
// end the session
await page.evaluate(() => { Object.defineProperty(document,"visibilityState",{value:"hidden",configurable:true}); document.dispatchEvent(new Event("visibilitychange", {bubbles:true})); });
await page.waitForTimeout(800);

const ev = beacons.flatMap(b => b.ev || []);
const sids = [...new Set(beacons.map(b => b.sid))];
const names = ev.map(e => e.e);
const has = n => names.includes(n);
const get = n => ev.find(e => e.e === n);

let fail = 0;
const ok = (n, c, x="") => { console.log((c?"PASS":"FAIL")+" — "+n+(x?"  "+x:"")); if(!c) fail++; };

ok("no page errors", errors.length === 0, errors.join(" | "));
ok("beacons were sent", beacons.length > 0, beacons.length+" beacon(s)");
ok("one stable session id", sids.length === 1, JSON.stringify(sids));
ok("view fired", has("view"));
ok("view has referrer/device", get("view")?.dev === "mobile" && get("view")?.ref === "direct", JSON.stringify(get("view")));
ok("address_input fired", has("address_input"));
ok("estimate fired", has("estimate"));
ok("estimate src=chip", get("estimate")?.src === "chip", JSON.stringify(get("estimate")));
ok("coords coarsened to 1dp", (() => { const e=get("estimate"); return e && Math.abs(e.lat*10 - Math.round(e.lat*10)) < 1e-9; })(), JSON.stringify([get("estimate")?.lat, get("estimate")?.lon]));
ok("pvgis_fallback fired (PVGIS blocked)", has("pvgis_fallback"));
ok("param_change fired", has("param_change"));
ok("param_change deduped per field", (() => { const f = ev.filter(e=>e.e==="param_change").map(e=>e.field); return new Set(f).size === f.length; })(), JSON.stringify(ev.filter(e=>e.e==="param_change").map(e=>e.field)));
ok("outcome fired with real numbers", (() => { const o=get("outcome"); return o && o.bill>0 && o.kwp>0; })(), JSON.stringify(get("outcome")));
ok("depth fired for all 3 sections", (() => { const s=new Set(ev.filter(e=>e.e==="depth").map(e=>e.section)); return ["financing","charts","method"].every(x=>s.has(x)); })(), JSON.stringify(ev.filter(e=>e.e==="depth").map(e=>e.section)));
ok("exit fired with step 2", get("exit")?.step === 2, JSON.stringify(get("exit")));
ok("no address text anywhere in payload", JSON.stringify(beacons).toLowerCase().indexOf("casa") === -1);
ok("no cookies set", (await ctx.cookies()).length === 0);

// DNT must switch everything off
const ctx2 = await browser.newContext({ viewport:{width:390,height:780}, extraHTTPHeaders:{DNT:"1"} });
const p2 = await ctx2.newPage();
let dntBeacons = 0;
await p2.route("**/solar-pvgis.redatahiri.workers.dev/e", r => { dntBeacons++; r.fulfill({status:204, body:""}); });
await p2.route("**/pvcalc**", r => r.abort());
await p2.route("**://*.tile.openstreetmap.org/**", r => r.abort());
await p2.addInitScript(() => Object.defineProperty(navigator, "doNotTrack", { get: () => "1" }));
await p2.goto("http://localhost:8765/", { waitUntil: "load" });
await p2.click(".chip");
await p2.waitForTimeout(3000);
ok("Do Not Track sends zero beacons", dntBeacons === 0, dntBeacons+" sent");

console.log("\nfunnel observed: " + names.join(" → "));
await browser.close(); server.close();
console.log(fail ? fail+" FAILURE(S)" : "all green");
process.exit(fail ? 1 : 0);
